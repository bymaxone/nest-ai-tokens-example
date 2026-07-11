/**
 * E2E tests for the `/ledger` and `/pricing` REST surface.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres,
 * deterministic seed).
 * Goal: prove the read surface end to end against the seed plan: identity
 * gating (401), filter permutations with exact plan-computed expectations,
 * bounded pagination, ownership policy (403/404), and JSON-safe money
 * (bigint rendered as decimal strings).
 * Mocks: none. One container per spec file; the suite runs single-worker.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { PricingService, computeCostNanoUsd } from '@bymax-one/nest-ai-tokens'
import type { NormalizedUsage } from '@bymax-one/nest-ai-tokens'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import request from 'supertest'
import type { App } from 'supertest/types.js'

import { MODEL_PRICES_SEED } from '@bymax-one/nest-ai-tokens/prices'

import { listenLocal } from './listen-local.js'
import { buildSeedPlan } from '../../prisma/seed-plan.js'
import { runSeed } from '../../prisma/seed-runner.js'
import { createApp } from '../../src/bootstrap.js'
import { MOCK_MODEL_PRICES } from '../../src/pricing/mock-model-prices.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI, which reads prisma.config.ts). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

const plan = buildSeedPlan()

/** The deterministic seed rows for one user scope within a tenant. */
function seededUserRows(tenantId: string, userId: string): typeof plan.usageRecords {
  return plan.usageRecords.filter(
    (row) => row.tenantId === tenantId && row.scopeType === 'user' && row.scopeId === userId,
  )
}

let container: StartedPostgreSqlContainer | undefined
let app: INestApplication | undefined
let server: App

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
  app = await createApp()
  await runSeed(app.get(PrismaService))
  server = await listenLocal(app)
})

/** Teardown order matters: app first (pools), then the container. */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

describe('GET /ledger/transactions', () => {
  /**
   * Identity gating.
   *
   * The ledger is identity-scoped; an anonymous request is rejected with
   * 401 before touching the database.
   */
  it('returns 401 without a demo identity', async () => {
    await request(server).get('/ledger/transactions').expect(401)
  })

  /**
   * Default page for a seeded user.
   *
   * ada's scope holds exactly her seeded rows; the response reports the
   * filter-wide total (SQL COUNT) while the page respects the default
   * bounded limit, and money renders as decimal strings.
   */
  it('lists the default page with the filter-wide total', async () => {
    const expected = seededUserRows('acme', 'ada')

    const response = await request(server)
      .get('/ledger/transactions')
      .set('x-demo-user', 'ada')
      .expect(200)

    expect(response.body.total).toBe(expected.length)
    expect(response.body.limit).toBe(20)
    expect(response.body.offset).toBe(0)
    expect(response.body.items).toHaveLength(20)
    for (const item of response.body.items as { billedCostNanoUsd: unknown; scope: unknown }[]) {
      expect(typeof item.billedCostNanoUsd).toBe('string')
      expect(item.scope).toEqual({ type: 'user', id: 'ada' })
    }
  })

  /**
   * Operation filter permutation.
   *
   * The embeddings slice of grace's history is plan-computable; the total
   * and every returned row must match it.
   */
  it('filters by operation', async () => {
    const expected = seededUserRows('acme', 'grace').filter((row) => row.operation === 'embeddings')

    const response = await request(server)
      .get('/ledger/transactions?operation=embeddings&limit=100')
      .set('x-demo-user', 'grace')
      .expect(200)

    expect(response.body.total).toBe(expected.length)
    expect(response.body.items).toHaveLength(expected.length)
  })

  /**
   * Inclusive date-window filter.
   *
   * A window pinned to one seeded row's exact occurredAt must include that
   * row (both bounds inclusive), with the total computed over the window.
   */
  it('filters by an inclusive date window', async () => {
    const rows = seededUserRows('globex', 'linus')
    const sample = rows[0]
    if (sample === undefined) throw new Error('seed plan must have linus rows')
    const at = new Date(sample.occurredAt ?? 0).toISOString()
    const expected = rows.filter((row) => new Date(row.occurredAt ?? 0).toISOString() === at).length

    const response = await request(server)
      .get(`/ledger/transactions?from=${at}&to=${at}&limit=100`)
      .set('x-demo-user', 'linus')
      .expect(200)

    expect(response.body.total).toBe(expected)
    expect((response.body.items as { id: string }[]).some((item) => item.id === sample.id)).toBe(
      true,
    )
  })

  /**
   * Pagination window.
   *
   * offset past most rows leaves the remainder; the total stays
   * filter-wide, proving limit/offset never distort the count.
   */
  it('honors limit and offset while keeping the total filter-wide', async () => {
    const expected = seededUserRows('acme', 'ada')

    const response = await request(server)
      .get(`/ledger/transactions?limit=10&offset=${expected.length - 3}`)
      .set('x-demo-user', 'ada')
      .expect(200)

    expect(response.body.total).toBe(expected.length)
    expect(response.body.items).toHaveLength(3)
  })

  /**
   * Status filter.
   *
   * The seed writes only posted rows, so a pending-only filter matches
   * nothing (and proves the status list reaches the store).
   */
  it('filters by lifecycle status', async () => {
    const response = await request(server)
      .get('/ledger/transactions?status=pending')
      .set('x-demo-user', 'ada')
      .expect(200)

    expect(response.body.total).toBe(0)
    expect(response.body.items).toHaveLength(0)
  })

  /**
   * Tenant isolation.
   *
   * The same user id under a different tenant header sees nothing: the
   * filter pins tenant AND user scope, so cross-tenant listing is
   * impossible by construction.
   */
  it('isolates tenants when the tenant header overrides', async () => {
    const response = await request(server)
      .get('/ledger/transactions')
      .set('x-demo-user', 'ada')
      .set('x-tenant-id', 'globex')
      .expect(200)

    expect(response.body.total).toBe(0)
  })

  /**
   * Validation rejections.
   *
   * Out-of-bounds pagination, unknown enum values, and inverted date
   * windows are 400s from the Zod pipe with value-free issue bodies.
   */
  it.each([
    ['a zero limit', '/ledger/transactions?limit=0'],
    ['an oversized limit', '/ledger/transactions?limit=101'],
    ['an unknown operation', '/ledger/transactions?operation=telepathy'],
    [
      'an inverted date window',
      '/ledger/transactions?from=2026-06-01T00:00:00Z&to=2026-05-01T00:00:00Z',
    ],
  ])('rejects %s with 400', async (_label, url) => {
    const response = await request(server).get(url).set('x-demo-user', 'ada').expect(400)

    expect(response.body.message).toBe('Validation failed')
  })
})

describe('GET /ledger/transactions/:id', () => {
  /**
   * Owner detail.
   *
   * The owner sees the full payload with string money and the metadata
   * fields the inspector renders.
   */
  it('returns the full record to its owner', async () => {
    const sample = seededUserRows('acme', 'ada')[0]
    if (sample === undefined) throw new Error('seed plan must have ada rows')

    const response = await request(server)
      .get(`/ledger/transactions/${sample.id}`)
      .set('x-demo-user', 'ada')
      .expect(200)

    expect(response.body.id).toBe(sample.id)
    expect(response.body.billedCostNanoUsd).toBe(String(sample.billedCostNanoUsd))
    expect(response.body.tenantId).toBe('acme')
  })

  /**
   * Foreign owner.
   *
   * Another user's row is 403 (app-level ownership policy), even within
   * the same tenant.
   */
  it('returns 403 for a foreign row', async () => {
    const sample = seededUserRows('acme', 'ada')[0]
    if (sample === undefined) throw new Error('seed plan must have ada rows')

    await request(server)
      .get(`/ledger/transactions/${sample.id}`)
      .set('x-demo-user', 'grace')
      .expect(403)
  })

  /**
   * Unknown id.
   *
   * A clean 404; the requested id is not echoed back.
   */
  it('returns 404 for an unknown id', async () => {
    const response = await request(server)
      .get('/ledger/transactions/does-not-exist')
      .set('x-demo-user', 'ada')
      .expect(404)

    expect(JSON.stringify(response.body)).not.toContain('does-not-exist')
  })

  /**
   * Identity gating.
   *
   * Anonymous detail probes are 401 (ids cannot be enumerated without an
   * identity).
   */
  it('returns 401 without a demo identity', async () => {
    await request(server).get('/ledger/transactions/seed-usage-0001').expect(401)
  })
})

describe('GET /pricing', () => {
  /**
   * Public current catalog.
   *
   * Every boot-seeded open window (library snapshot plus the three mock
   * models) is listed without an identity, with bigint rates rendered as
   * decimal strings.
   */
  it('lists every open window with JSON-safe rates', async () => {
    const response = await request(server).get('/pricing').expect(200)

    const items = response.body.items as {
      model: string
      inputNanoUsdPerMillion: string
      effectiveTo: string | null
    }[]
    expect(items.length).toBe(MODEL_PRICES_SEED.length + MOCK_MODEL_PRICES.length)
    expect(items.every((item) => item.effectiveTo === null)).toBe(true)
    const pro = items.find((item) => item.model === 'mock-chat-pro')
    expect(pro?.inputNanoUsdPerMillion).toBe('600000000')
  })
})

describe('GET /pricing/:model/history', () => {
  /**
   * Unknown tuple.
   *
   * A model that was never priced for the tuple is a clean 404.
   */
  it('returns 404 for an unpriced tuple', async () => {
    await request(server).get('/pricing/ghost-model/history?provider=mock').expect(404)
  })

  /**
   * Validation.
   *
   * The provider is required; the Zod pipe rejects its absence with 400.
   */
  it('returns 400 without a provider', async () => {
    const response = await request(server).get('/pricing/mock-chat-pro/history').expect(400)

    expect(response.body.message).toBe('Validation failed')
  })
})

describe('PUT /pricing/:model', () => {
  /** A valid update body raising mock-chat-pro to 0.70 / 2.80 USD per million. */
  const updateBody = {
    provider: 'mock',
    operation: 'chat',
    inputNanoUsdPerMillion: '700000000',
    outputNanoUsdPerMillion: '2800000000',
    reasoningNanoUsdPerMillion: '2800000000',
  }

  /**
   * Access control matrix.
   *
   * Anonymous updates are 401, authenticated non-admins are 403, and a
   * rate-free body is 400: the admin plane is closed before any store
   * write.
   */
  it('rejects anonymous, non-admin, and rate-free updates', async () => {
    await request(server).put('/pricing/mock-chat-pro').send(updateBody).expect(401)
    await request(server)
      .put('/pricing/mock-chat-pro')
      .set('x-demo-user', 'ada')
      .send(updateBody)
      .expect(403)
    await request(server)
      .put('/pricing/mock-chat-pro')
      .set('x-demo-user', 'root')
      .send({ provider: 'mock', operation: 'chat' })
      .expect(400)
  })

  /**
   * The scenario 4 update flow: close the window, insert the successor,
   * and serve the new price immediately.
   *
   * The pre-update resolution primes the in-memory cache; the post-update
   * resolution uses an `at` in the same TTL bucket (same cache key), so
   * seeing the NEW price immediately proves `upsertPrice` invalidated the
   * cache rather than waiting out the five-minute TTL. The history must
   * show the old window closed exactly at the successor's `effectiveFrom`
   * (atomic close-and-insert), and the catalog must reflect the new rate.
   */
  it('closes the window, inserts the successor, and invalidates the cache', async () => {
    if (app === undefined) throw new Error('app must be booted')
    const pricing = app.get(PricingService)
    const primed = await pricing.resolveRate({
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      at: new Date(),
    })
    expect(primed?.inputNanoUsdPerMillion).toBe(600_000_000n)

    const response = await request(server)
      .put('/pricing/mock-chat-pro')
      .set('x-demo-user', 'root')
      .send(updateBody)
      .expect(200)

    expect(response.body.inputNanoUsdPerMillion).toBe('700000000')
    expect(response.body.effectiveTo).toBeNull()
    expect(response.body.source).toBe('manual')

    const resolved = await pricing.resolveRate({
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      at: new Date(),
    })
    expect(resolved?.inputNanoUsdPerMillion).toBe(700_000_000n)

    const history = await request(server)
      .get('/pricing/mock-chat-pro/history?provider=mock&operation=chat')
      .expect(200)
    const windows = history.body.items as { effectiveFrom: string; effectiveTo: string | null }[]
    expect(windows).toHaveLength(2)
    expect(windows[0]?.effectiveTo).toBeNull()
    expect(windows[1]?.effectiveTo).toBe(windows[0]?.effectiveFrom)

    const catalog = await request(server).get('/pricing').expect(200)
    const pro = (catalog.body.items as { model: string; inputNanoUsdPerMillion: string }[]).find(
      (item) => item.model === 'mock-chat-pro',
    )
    expect(pro?.inputNanoUsdPerMillion).toBe('700000000')
  })

  /**
   * Backdated cost proof (point-in-time pricing).
   *
   * A resolution dated before the update still lands in the CLOSED window
   * (never re-rated), and the pure cost engine prices the same usage
   * differently under the two windows: 1,000 in + 100 out tokens cost
   * exactly 840,000 nano-USD at the old rates and 980,000 at the new ones.
   */
  it('still resolves the closed window for a backdated calculation', async () => {
    if (app === undefined) throw new Error('app must be booted')
    const pricing = app.get(PricingService)
    const usage: NormalizedUsage = {
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      inputTokens: 1_000,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0,
      audioInTokens: 0,
      audioOutTokens: 0,
      imageInTokens: 0,
      imageOutTokens: 0,
    }

    const backdated = await pricing.resolveRate({
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      at: new Date('2026-01-01T00:00:00.000Z'),
    })
    const current = await pricing.resolveRate({
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      at: new Date(),
    })
    if (backdated === null || current === null) throw new Error('both windows must resolve')

    expect(backdated.effectiveTo).not.toBeNull()
    expect(computeCostNanoUsd(usage, backdated).totalNanoUsd).toBe(840_000n)
    expect(computeCostNanoUsd(usage, current).totalNanoUsd).toBe(980_000n)
  })
})
