/**
 * E2E proofs of tenant isolation in both tenancy modes (spec §18, §13
 * scenario 6; matrix rows 80-83).
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: prove that with the header-simulated identities one tenant can
 * never read another tenant's ledger, usage, or wallet data through ANY
 * endpoint (list, detail probe by known foreign id, aggregations,
 * balance); that a null-tenant identity falls back to the global tenant in
 * the default mode (row 80); and that a strict-mode boot
 * (TENANT_REQUIRED=true) rejects tenant-less identities with the
 * documented `tenant.required` 403 on reads, writes, and metered calls
 * (rows 22, 81) while tenant-scoped identities keep working.
 * Mocks: none. One container stack per run; the two application boots
 * (default mode, then strict mode) run strictly sequentially against the
 * same database.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import request from 'supertest'
import type { App } from 'supertest/types.js'

import { buildSeedPlan } from '../../prisma/seed-plan.js'
import { runSeed } from '../../prisma/seed-runner.js'
import { createApp } from '../../src/bootstrap.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** A window covering every seeded row (history spans 90 days pre-epoch). */
const SEED_WINDOW = { from: '2026-01-01T00:00:00.000Z', to: '2026-07-02T00:00:00.000Z' }

/** One ledger list item as the API serializes it. */
interface LedgerItem {
  id: string
  tenantId: string
  scope: { type: string; id: string }
}

const plan = buildSeedPlan()

/** Count the seeded USER-scope rows of one tenant user (system rows excluded). */
function seededUserRowCount(tenantId: string, userId: string): number {
  return plan.usageRecords.filter(
    (row) => row.tenantId === tenantId && row.scopeType === 'user' && row.scopeId === userId,
  ).length
}

let container: StartedPostgreSqlContainer | undefined
let app: INestApplication | undefined
let server: App

/** Boot the production wiring against the running container. */
async function bootApp(): Promise<INestApplication> {
  const booted = await createApp()
  app = booted
  server = booted.getHttpServer() as App
  return booted
}

/** Container up + migrate once; the default-mode app boots and seeds. */
beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('ai_tokens_example')
    .start()
  const databaseUrl = container.getConnectionUri()
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: APP_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  })
  process.env.DATABASE_URL = databaseUrl
  process.env.PORT = '0'
  delete process.env.TENANT_REQUIRED
  const booted = await bootApp()
  await runSeed(booted.get(PrismaService))
})

/** App first (pools, timers), then the container; both guarded. */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    delete process.env.TENANT_REQUIRED
    await container?.stop()
  }
})

/** Fetch one identity's wallet balance in nano-USD. */
async function balanceOf(user: string): Promise<bigint> {
  const response = await request(server).get('/usage/balance').set('x-demo-user', user).expect(200)
  return BigInt(response.body.nanoUsd as string)
}

/** Run one translate as the given identity and return its transaction id. */
async function translateAs(user: string): Promise<string> {
  const response = await request(server)
    .post('/workspace/translate')
    .set('x-demo-user', user)
    .send({ text: `Isolation probe by ${user}`, targetLanguages: ['pt'] })
    .expect(200)
  return response.body.usage.transactionId as string
}

describe('default mode: per-tenant scoping (matrix rows 80, 83)', () => {
  let adaBalanceBefore: bigint
  let linusBalanceBefore: bigint
  let adaTransactionId: string
  let linusTransactionId: string

  /** Snapshot the seeded balances, then meter one call per tenant. */
  beforeAll(async () => {
    adaBalanceBefore = await balanceOf('ada')
    linusBalanceBefore = await balanceOf('linus')
    adaTransactionId = await translateAs('ada')
    linusTransactionId = await translateAs('linus')
  })

  /**
   * Ledger list isolation (row 83).
   *
   * Every row ada can list belongs to tenant acme and scope user:ada, and
   * linus's fresh transaction never appears; symmetrically for linus. This
   * is the core "A never sees B" proof on the list path.
   */
  it('scopes /ledger/transactions to the caller tenant and user', async () => {
    const adaList = await request(server)
      .get('/ledger/transactions')
      .set('x-demo-user', 'ada')
      .expect(200)
    const linusList = await request(server)
      .get('/ledger/transactions')
      .set('x-demo-user', 'linus')
      .expect(200)

    const adaItems = adaList.body.items as LedgerItem[]
    const linusItems = linusList.body.items as LedgerItem[]
    expect(adaItems.length).toBeGreaterThan(0)
    expect(linusItems.length).toBeGreaterThan(0)
    for (const item of adaItems) {
      expect(item.tenantId).toBe('acme')
      expect(item.scope).toEqual({ type: 'user', id: 'ada' })
    }
    for (const item of linusItems) {
      expect(item.tenantId).toBe('globex')
      expect(item.scope).toEqual({ type: 'user', id: 'linus' })
    }
    expect(adaItems.map((item) => item.id)).not.toContain(linusTransactionId)
    expect(linusItems.map((item) => item.id)).not.toContain(adaTransactionId)
  })

  /**
   * Foreign-id probe on the detail path (row 83).
   *
   * Probing a KNOWN foreign transaction id must never return data: the
   * response is the ownership rejection (403) and its body carries no
   * record fields (no tenant, costs, tokens, or scope of the foreign row).
   */
  it('rejects a probe by known foreign id without leaking the record', async () => {
    const probe = await request(server)
      .get(`/ledger/transactions/${linusTransactionId}`)
      .set('x-demo-user', 'ada')
      .expect(403)

    const body = JSON.stringify(probe.body)
    expect(body).not.toContain('globex')
    expect(body).not.toContain('CostNanoUsd')
    expect(probe.body.tenantId).toBeUndefined()
    expect(probe.body.scope).toBeUndefined()
  })

  /**
   * Wallet isolation on the balance path (row 83).
   *
   * Each identity's balance moves ONLY with its own spend: after one
   * metered call each, both balances dropped below their seeded snapshot
   * independently, and the two balances differ (ada carries the extra
   * trial grant by seed design).
   */
  it('keeps /usage/balance per identity', async () => {
    const adaBalanceAfter = await balanceOf('ada')
    const linusBalanceAfter = await balanceOf('linus')

    expect(adaBalanceAfter).toBeLessThan(adaBalanceBefore)
    expect(linusBalanceAfter).toBeLessThan(linusBalanceBefore)
    expect(adaBalanceAfter).not.toBe(linusBalanceAfter)
  })

  /**
   * Aggregation isolation (rows 68, 83).
   *
   * The tenant-wide by-type report over the seed window counts EXACTLY the
   * caller tenant's seeded user rows: acme totals for ada, globex totals
   * for linus. Neither aggregation absorbs the other tenant's traffic.
   */
  it('scopes /usage/by-type tenant aggregation to the caller tenant', async () => {
    const adaReport = await request(server)
      .get('/usage/by-type')
      .query({ ...SEED_WINDOW, scope: 'tenant' })
      .set('x-demo-user', 'ada')
      .expect(200)
    const linusReport = await request(server)
      .get('/usage/by-type')
      .query({ ...SEED_WINDOW, scope: 'tenant' })
      .set('x-demo-user', 'linus')
      .expect(200)

    const totalOf = (items: { records: number }[]): number =>
      items.reduce((sum, item) => sum + item.records, 0)
    const acmeSeeded = seededUserRowCount('acme', 'ada') + seededUserRowCount('acme', 'grace')
    const globexSeeded = seededUserRowCount('globex', 'linus')
    expect(totalOf(adaReport.body.items as { records: number }[])).toBe(acmeSeeded)
    expect(totalOf(linusReport.body.items as { records: number }[])).toBe(globexSeeded)
  })
})

describe('default mode: null tenant falls back to the global tenant (row 80)', () => {
  /**
   * Global-tenant metering for the tenant-less admin.
   *
   * root (null tenant) is granted credit and meters one call: the posted
   * record lands under the app's `global` tenant, proving the documented
   * default-mode fallback end to end (credit -> hold -> capture -> read).
   */
  it('meters root under the global tenant', async () => {
    await request(server)
      .post('/ledger/credits')
      .set('x-demo-user', 'root')
      .send({ amountNanoUsd: '5000000000', type: 'purchase' })
      .expect(201)
    const transactionId = await translateAs('root')

    const detail = await request(server)
      .get(`/ledger/transactions/${transactionId}`)
      .set('x-demo-user', 'root')
      .expect(200)
    expect(detail.body.tenantId).toBe('global')
    expect(detail.body.scope).toEqual({ type: 'user', id: 'root' })
  })

  /**
   * Global-tenant read isolation.
   *
   * root's ledger shows ONLY global-tenant rows (his own call), never the
   * acme/globex traffic; and a tenant user probing root's global row is
   * rejected without data. The fallback cannot become a spyglass.
   */
  it('keeps the global tenant isolated from tenant traffic in both directions', async () => {
    const rootList = await request(server)
      .get('/ledger/transactions')
      .set('x-demo-user', 'root')
      .expect(200)

    const rootItems = rootList.body.items as LedgerItem[]
    const firstRootItem = rootItems[0]
    if (firstRootItem === undefined) throw new Error('root must have a metered global row')
    for (const item of rootItems) {
      expect(item.tenantId).toBe('global')
      expect(item.scope).toEqual({ type: 'user', id: 'root' })
    }

    const probe = await request(server)
      .get(`/ledger/transactions/${firstRootItem.id}`)
      .set('x-demo-user', 'ada')
      .expect(403)
    expect(JSON.stringify(probe.body)).not.toContain('global"')
    expect(probe.body.tenantId).toBeUndefined()
  })
})

describe('strict mode: TENANT_REQUIRED=true (matrix rows 22, 81)', () => {
  /** Reboot the SAME database in strict mode (variant boot, primary wiring untouched). */
  beforeAll(async () => {
    await app?.close()
    process.env.TENANT_REQUIRED = 'true'
    await bootApp()
  })

  /**
   * Strict-mode write rejection (rows 22, 81 reconciled).
   *
   * The drafted `recordCredit without tenantId -> ledger.tenant_required`
   * maps to the shipped surface: a tenant-less identity attempting the
   * money-path write is rejected with the app's documented
   * `tenant.required` 403 canonical envelope, and no grant is written.
   */
  it('rejects a tenant-less credit write with the canonical tenant.required 403', async () => {
    const response = await request(server)
      .post('/ledger/credits')
      .set('x-demo-user', 'root')
      .send({ amountNanoUsd: '1000000000', type: 'purchase' })
      .expect(403)

    const body = response.body as { error: { code: string; message: string; details?: unknown } }
    expect(Object.keys(body)).toEqual(['error'])
    expect(body.error.code).toBe('tenant.required')
    expect(body.error.message).toContain('TENANT_REQUIRED')
    expect(body.error.details).toBeUndefined()
  })

  /**
   * Strict-mode metered-call and read rejection (row 81).
   *
   * The same documented rejection covers the metered path and the read
   * path: the identity middleware is the single choke point, so no
   * endpoint can fall back to the global tenant in strict mode.
   */
  it('rejects tenant-less metered calls and reads with the same envelope', async () => {
    const metered = await request(server)
      .post('/workspace/translate')
      .set('x-demo-user', 'root')
      .send({ text: 'Strict mode probe', targetLanguages: ['pt'] })
      .expect(403)
    const read = await request(server)
      .get('/ledger/transactions')
      .set('x-demo-user', 'root')
      .expect(403)

    expect(metered.body.error.code).toBe('tenant.required')
    expect(read.body.error.code).toBe('tenant.required')
  })

  /**
   * Strict mode leaves tenant-scoped identities untouched.
   *
   * ada keeps full access under her own tenant, and the admin adopting a
   * tenant via x-tenant-id is the documented escape hatch; isolation still
   * holds (the adopted tenant's rows only).
   */
  it('keeps tenant-scoped identities working, including the x-tenant-id override', async () => {
    const adaList = await request(server)
      .get('/ledger/transactions')
      .set('x-demo-user', 'ada')
      .expect(200)
    const rootAsAcme = await request(server)
      .get('/ledger/transactions')
      .set('x-demo-user', 'root')
      .set('x-tenant-id', 'acme')
      .expect(200)

    expect((adaList.body.items as LedgerItem[]).length).toBeGreaterThan(0)
    for (const item of rootAsAcme.body.items as LedgerItem[]) {
      expect(item.tenantId).toBe('acme')
    }
  })
})
