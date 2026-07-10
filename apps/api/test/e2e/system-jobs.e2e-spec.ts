/**
 * E2E proofs of the system-jobs surface: platform-absorbed costs.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: prove a reindex run appends ONE tenant-scoped system record that
 * appears under /usage/system-costs (beside the seeded snapshots) and
 * NEVER in a user cost report, that the admin gate holds (401/403), that
 * an agent-decision assist appends one user-attributed system record with
 * the decision id as correlationId and the strategy/confidence tags
 * (reasoning never persisted) that is queryable through the ledger list,
 * that neither job consumes a wallet, and that the Zod bounds reject
 * malformed bodies.
 * Mocks: none. One container stack per run; the suite runs single-worker.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { LedgerService, WalletService, toJsonSafe } from '@bymax-one/nest-ai-tokens'
import type { WalletRef } from '@bymax-one/nest-ai-tokens'
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

/** A window covering the seed history and the live calls of this suite. */
const WINDOW = { from: '2026-01-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z' }

let container: StartedPostgreSqlContainer | undefined
let app: INestApplication | undefined
let server: App
let ledger: LedgerService
let wallets: WalletService

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

/** ada's wallet (the assisted user of the agent-decision proof). */
const adaRef: WalletRef = { tenantId: 'acme', ownerType: 'user', ownerId: 'ada' }

describe('POST /system-jobs/reindex (scenario 7; matrix rows 71, 84)', () => {
  /**
   * Admin gates.
   *
   * The reindex job is platform work: 401 without an identity and 403
   * for a non-admin user.
   */
  it('rejects unauthenticated (401) and non-admin (403) runs', async () => {
    await request(server).post('/system-jobs/reindex').send({}).expect(401)
    await request(server)
      .post('/system-jobs/reindex')
      .set('x-demo-user', 'ada')
      .send({})
      .expect(403)
  })

  /**
   * Count bounds.
   *
   * Zero and over-cap counts are 400 before the provider runs.
   */
  it('rejects out-of-range counts 400', async () => {
    for (const count of [0, 21]) {
      await request(server)
        .post('/system-jobs/reindex')
        .set('x-demo-user', 'root')
        .set('x-tenant-id', 'acme')
        .send({ count })
        .expect(400)
    }
  })

  /**
   * One tenant-scoped system record, visible ONLY as a system cost.
   *
   * The run appends exactly one record (batch aggregate) flagged
   * isSystemCost with category reindex under the tenant scope; the
   * /usage/system-costs aggregation gains one record over the two seeded
   * snapshots, while ada's user report and the tenant-wide by-type report
   * never see the system feature.
   */
  it('appends one system record that stays out of user reports', async () => {
    const response = await request(server)
      .post('/system-jobs/reindex')
      .set('x-demo-user', 'root')
      .set('x-tenant-id', 'acme')
      .send({ count: 4 })
      .expect(201)

    expect(response.body).toEqual({
      transactionId: expect.any(String),
      batchSize: 4,
      tokensUsed: expect.any(Number),
      systemCostCategory: 'reindex',
    })
    const record = await ledger.findById(String(response.body.transactionId))
    expect(record?.isSystemCost).toBe(true)
    expect(record?.systemCostCategory).toBe('reindex')
    expect(record?.scope).toEqual({ type: 'tenant', id: 'acme' })
    expect(record?.enforced).toBe(false)
    expect(record?.tags).toEqual(['resource:reindex-run', 'batch-size:4'])

    const systemCosts = await request(server)
      .get('/usage/system-costs')
      .query({ ...WINDOW, category: 'reindex' })
      .set('x-demo-user', 'ada')
      .expect(200)
    // Two seeded acme snapshots plus this live run.
    expect(systemCosts.body.items[0].records).toBe(3)

    const byType = await request(server)
      .get('/usage/by-type')
      .query({ ...WINDOW, scope: 'tenant' })
      .set('x-demo-user', 'ada')
      .expect(200)
    const features = (byType.body.items as { group: { feature: string } }[]).map(
      (item) => item.group.feature,
    )
    expect(features).not.toContain('system.reindex')
  })
})

describe('POST /system-jobs/agent-decision (matrix rows 85, 13)', () => {
  /**
   * The seventh transaction kind with its reserved metadata keys.
   *
   * The assist appends one user-attributed record whose reserved fields
   * carry the decision: correlationId = decisionId, strategy and
   * confidence as tags, isSystemCost with the agent-decision category;
   * the reasoning is echoed in the response but NEVER persisted; the
   * caller's wallet is untouched (platform-absorbed); and the row is
   * queryable through the ledger list by its feature.
   */
  it('records the assist with correlationId and tags, wallet untouched', async () => {
    const balanceBefore = await wallets.getBalance(adaRef)

    const response = await request(server)
      .post('/system-jobs/agent-decision')
      .set('x-demo-user', 'ada')
      .send({
        decisionId: 'dec-e2e-001',
        strategy: 'rebalance.v2',
        confidence: 0.85,
        reasoning: 'portfolio drift beyond threshold',
      })
      .expect(201)

    expect(response.body).toEqual({
      decisionId: 'dec-e2e-001',
      strategy: 'rebalance.v2',
      confidence: 0.85,
      reasoning: 'portfolio drift beyond threshold',
      transactionId: expect.any(String),
      tokensUsed: 25,
    })
    const record = await ledger.findById(String(response.body.transactionId))
    expect(record?.correlationId).toBe('dec-e2e-001')
    expect(record?.tags).toEqual(['strategy:rebalance.v2', 'confidence:0.85'])
    expect(record?.isSystemCost).toBe(true)
    expect(record?.systemCostCategory).toBe('agent-decision')
    expect(record?.totalTokens).toBe(25)
    // toJsonSafe first: a raw UsageRecord carries bigint money.
    expect(JSON.stringify(toJsonSafe(record))).not.toContain('portfolio drift')

    expect((await wallets.getBalance(adaRef)).nanoUsd).toBe(balanceBefore.nanoUsd)

    const listed = await request(server)
      .get('/ledger/transactions')
      .query({ feature: 'agent.decision-assist', isSystemCost: 'true' })
      .set('x-demo-user', 'ada')
      .expect(200)
    expect(listed.body.total).toBe(1)
    expect(listed.body.items[0].id).toBe(response.body.transactionId)

    const categories = await request(server)
      .get('/usage/system-costs')
      .query(WINDOW)
      .set('x-demo-user', 'ada')
      .expect(200)
    const byCategory = (categories.body.items as { group: { systemCostCategory: string } }[]).map(
      (item) => item.group.systemCostCategory,
    )
    expect(byCategory).toContain('agent-decision')
  })

  /**
   * Descriptor bounds.
   *
   * Out-of-range confidence and tag-unsafe strategies are 400 before any
   * record exists.
   */
  it('rejects malformed descriptors 400', async () => {
    const valid = {
      decisionId: 'dec-e2e-002',
      strategy: 'ok',
      confidence: 0.5,
      reasoning: 'why',
    }
    await request(server)
      .post('/system-jobs/agent-decision')
      .set('x-demo-user', 'ada')
      .send({ ...valid, confidence: 1.5 })
      .expect(400)
    await request(server)
      .post('/system-jobs/agent-decision')
      .set('x-demo-user', 'ada')
      .send({ ...valid, strategy: 'has space' })
      .expect(400)
  })
})
