/**
 * E2E proofs of the quota lab and the budget admin surface.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: prove the declarative constant route (guard-placed static hold,
 * interceptor-settled capture, x-ai-tokens-* cost headers), the
 * model-based estimator via CRAFTED balances (a balance between the lite
 * and pro estimates passes lite and rejects pro with the canonical 402),
 * the budget admin gates (401/403/Zod 400), a count-limited block budget
 * blocking pre-handler with the canonical 429 and no ledger write, the
 * caller-scoped budget listing with live status, and the combined access
 * status read. Crafted balances run through the REAL WalletService and
 * the estimates through the REAL MeteringService.estimateCost.
 * Mocks: none. One container stack per run; the suite runs single-worker.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { LedgerService, MeteringService, WalletService } from '@bymax-one/nest-ai-tokens'
import type { UsageStatus, WalletRef } from '@bymax-one/nest-ai-tokens'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import request from 'supertest'
import type { App } from 'supertest/types.js'

import { runSeed } from '../../prisma/seed-runner.js'
import { createApp } from '../../src/bootstrap.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Every lifecycle status: "no ledger row" means none in ANY of these. */
const ALL_STATUSES: UsageStatus[] = ['pending', 'posted', 'reversed', 'released']

let container: StartedPostgreSqlContainer | undefined
let app: INestApplication | undefined
let server: App
let ledger: LedgerService
let wallets: WalletService
let metering: MeteringService

/** Container up, migrate + seed, boot the production wiring (no listener). */
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
  server = app.getHttpServer() as App
  ledger = app.get(LedgerService)
  metering = app.get(MeteringService)
  const maybeWallets = app.get<WalletService | null>(WalletService)
  if (maybeWallets === null) throw new Error('wallets must be enabled for this suite')
  wallets = maybeWallets
})

/** App first (pools, timers), then the container; both guarded. */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

/** The wallet owner whose balance the model-based proofs craft. */
const graceRef: WalletRef = { tenantId: 'acme', ownerType: 'user', ownerId: 'grace' }

/** Ada's ledger rows for one feature, across ALL statuses. */
async function adaRowsFor(feature: string): Promise<number> {
  const rows = await ledger.query({
    tenantId: 'acme',
    scope: { type: 'user', id: 'ada' },
    feature,
    status: ALL_STATUSES,
  })
  return rows.length
}

describe('constant lab route (declarative path)', () => {
  /**
   * Guard-placed hold, interceptor-settled capture, cost headers.
   *
   * The static 1000-token estimate reserves pre-handler; the interceptor
   * settles the handler's raw response and exposes the x-ai-tokens-*
   * headers as decimal strings. The settled row is enforced and carries
   * the constant lab feature.
   */
  it('meters the call declaratively and exposes the cost headers', async () => {
    const response = await request(server)
      .post('/quota/lab/constant')
      .set('x-demo-user', 'ada')
      .send({ prompt: 'constant probe' })
      .expect(200)

    expect(response.headers['x-ai-tokens-cost']).toMatch(/^\d+$/)
    expect(response.headers['x-ai-tokens-billed-cost']).toMatch(/^\d+$/)
    expect(response.body.choices[0].message.content).toBe('[mock:mock-chat-lite] constant probe')
    const rows = await ledger.query({
      tenantId: 'acme',
      scope: { type: 'user', id: 'ada' },
      feature: 'quota.lab.constant',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.enforced).toBe(true)
    expect(rows[0]?.status).toBe('posted')
  })

  /**
   * The declarative gate still needs an identity.
   *
   * Without x-demo-user the guard's scopeResolver rejects 401 before the
   * handler (and before any hold).
   */
  it('rejects an identity-less constant call 401', async () => {
    await request(server).post('/quota/lab/constant').send({}).expect(401)
  })
})

describe('model-based estimator with crafted balances (rows 55-57)', () => {
  /**
   * A balance BETWEEN the two estimates separates the branches.
   *
   * Crafted: grace's balance is set strictly between the billed lite
   * (1000-token) and pro (5000-token) estimates. The pro call then fails
   * its hold with the canonical 402 and writes nothing; the lite call
   * passes and settles. That difference IS the estimator: same wallet,
   * same route, different model.
   */
  it('rejects the pro estimate and passes the lite estimate on the same balance', async () => {
    const liteEstimate = await metering.estimateCost({
      provider: 'mock',
      model: 'mock-chat-lite',
      operation: 'chat',
      inputTokens: 1000,
      maxOutputTokens: 0,
    })
    const proEstimate = await metering.estimateCost({
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      inputTokens: 5000,
      maxOutputTokens: 0,
    })
    expect(proEstimate.billedCostNanoUsd).toBeGreaterThan(liteEstimate.billedCostNanoUsd)
    const mid = (liteEstimate.billedCostNanoUsd + proEstimate.billedCostNanoUsd) / 2n

    const balance = await wallets.getBalance(graceRef)
    await wallets.debit(graceRef, {
      amountNanoUsd: balance.nanoUsd,
      idempotencyKey: 'e2e-lab-drain-grace',
      reason: 'craft the model-based boundary balance',
    })
    // effectiveAt is backdated: the store stamps createdAt with the DB
    // clock and a grant is spendable only when effectiveAt <= createdAt.
    await wallets.grant(graceRef, {
      amountNanoUsd: mid,
      effectiveAt: new Date(Date.now() - 60_000),
      idempotencyKey: 'e2e-lab-mid-grace',
      reason: 'purchase',
    })

    const blocked = await request(server)
      .post('/quota/lab/model-based')
      .set('x-demo-user', 'grace')
      .send({ model: 'mock-chat-pro' })
      .expect(402)
    expect(blocked.body.error.code).toBe('AI_TOKENS_INSUFFICIENT_CREDITS')

    const passed = await request(server)
      .post('/quota/lab/model-based')
      .set('x-demo-user', 'grace')
      .send({ model: 'mock-chat-lite' })
      .expect(200)
    expect(passed.body.model).toBe('mock-chat-lite')
    expect(passed.body.billedNanoUsd).toMatch(/^\d+$/)
    const record = await ledger.findById(String(passed.body.transactionId))
    expect(record?.feature).toBe('quota.lab.model-based')
    expect(record?.enforced).toBe(true)
  })
})

describe('budget admin gates', () => {
  /**
   * Identity and role gates.
   *
   * No identity -> 401; a non-admin identity -> 403: budget mutation is
   * admin plane.
   */
  it('rejects unauthenticated (401) and non-admin (403) upserts', async () => {
    await request(server)
      .post('/quota/budgets')
      .send({ scopeType: 'user', scopeId: 'ada', limitCount: 1 })
      .expect(401)
    await request(server)
      .post('/quota/budgets')
      .set('x-demo-user', 'ada')
      .send({ scopeType: 'user', scopeId: 'ada', limitCount: 1 })
      .expect(403)
  })

  /**
   * Strict Zod money-path validation (rows 61-63 reconciled).
   *
   * A definition without any limit dimension and a signed money string
   * are both 400 BEFORE the library sees them.
   */
  it('rejects limit-less and negative-money definitions 400', async () => {
    await request(server)
      .post('/quota/budgets')
      .set('x-demo-user', 'root')
      .set('x-tenant-id', 'acme')
      .send({ scopeType: 'user', scopeId: 'ada' })
      .expect(400)
    await request(server)
      .post('/quota/budgets')
      .set('x-demo-user', 'root')
      .set('x-tenant-id', 'acme')
      .send({ scopeType: 'user', scopeId: 'ada', limitNanoUsd: '-5' })
      .expect(400)
  })
})

describe('count-limited block budget (rows 64 reconciled + 66-67)', () => {
  /**
   * The budget hard-stop: one call passes, the second blocks pre-handler.
   *
   * root (targeting acme via x-tenant-id) caps ada's constant lab feature
   * at ONE operation per month. The next call consumes the single slot;
   * the one after is blocked by the guard BEFORE the handler with the
   * canonical 429 quota envelope and writes NO ledger row in any status.
   */
  it('blocks the second call with 429 AI_TOKENS_QUOTA_EXCEEDED and no ledger write', async () => {
    const created = await request(server)
      .post('/quota/budgets')
      .set('x-demo-user', 'root')
      .set('x-tenant-id', 'acme')
      .send({
        scopeType: 'user',
        scopeId: 'ada',
        limitCount: 1,
        window: 'month',
        policy: 'block',
        features: ['quota.lab.constant'],
      })
      .expect(201)
    expect(created.body.id).toEqual(expect.any(String))
    expect(created.body.policy).toBe('block')

    await request(server).post('/quota/lab/constant').set('x-demo-user', 'ada').send({}).expect(200)

    const rowsBefore = await adaRowsFor('quota.lab.constant')
    const blocked = await request(server)
      .post('/quota/lab/constant')
      .set('x-demo-user', 'ada')
      .send({})
      .expect(429)

    expect(blocked.body).toEqual({
      error: {
        code: 'AI_TOKENS_QUOTA_EXCEEDED',
        message: expect.any(String),
        details: expect.objectContaining({ dimension: 'count' }),
      },
    })
    expect(await adaRowsFor('quota.lab.constant')).toBe(rowsBefore)
  })

  /**
   * Caller-scoped listing with live status.
   *
   * ada sees the budget root created for her, with the window's spent
   * count reflecting the consumed slot.
   */
  it('lists the budget with its live window status for the budgeted user', async () => {
    const response = await request(server)
      .get('/quota/budgets')
      .set('x-demo-user', 'ada')
      .expect(200)

    expect(response.body.budgets).toHaveLength(1)
    expect(response.body.budgets[0]).toMatchObject({
      scope: { type: 'user', id: 'ada' },
      limitCount: 1,
      policy: 'block',
      features: ['quota.lab.constant'],
    })
    expect(response.body.status[0]).toMatchObject({
      policy: 'block',
      limit: { count: 1 },
      spent: expect.objectContaining({ count: 1 }),
      usedFraction: 1,
    })
  })
})

describe('GET /quota/status', () => {
  /**
   * Blocked-by-budget verdict.
   *
   * With her single slot consumed, ada's combined status reports
   * hasAccess false, blockedBy budget: the read the usage meter renders.
   */
  it('reports ada blocked by the exhausted budget', async () => {
    const response = await request(server)
      .get('/quota/status')
      .set('x-demo-user', 'ada')
      .expect(200)

    expect(response.body.hasAccess).toBe(false)
    expect(response.body.blockedBy).toBe('budget')
    expect(response.body.wallet.balanceNanoUsd).toMatch(/^\d+$/)
  })

  /**
   * Open-access verdict with the wallet section.
   *
   * linus has no budgets and a funded wallet: hasAccess true, wallet
   * balance as a decimal string, empty budget list.
   */
  it('reports linus with access and a funded wallet', async () => {
    const response = await request(server)
      .get('/quota/status')
      .set('x-demo-user', 'linus')
      .expect(200)

    expect(response.body.hasAccess).toBe(true)
    expect(response.body.blockedBy).toBeUndefined()
    expect(response.body.budgets).toEqual([])
  })

  /**
   * Identity gate on the read.
   *
   * The status read is identity-scoped (401 without a demo user) even
   * though it is unmetered.
   */
  it('rejects an identity-less status read 401', async () => {
    await request(server).get('/quota/status').expect(401)
  })
})
