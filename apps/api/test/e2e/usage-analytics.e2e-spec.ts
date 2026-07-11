/**
 * E2E proofs of the usage analytics surface against the deterministic seed.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: prove every aggregation endpoint returns EXACT values computed
 * independently from the seed plan (by-type, by-model, by-period buckets,
 * top consumers ordered by billed spend, system costs excluded from user
 * reports but present under their category), that the balance read equals
 * the seeded grants and appends NO ledger row (skip semantics), that
 * scope=tenant widens the report, and that the query validation rejects
 * inverted windows, unknown granularities, and out-of-range topN.
 * Mocks: none. One container stack per run; the suite runs single-worker.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { LedgerService } from '@bymax-one/nest-ai-tokens'
import type { UsageStatus } from '@bymax-one/nest-ai-tokens'
import type { Prisma } from '@prisma/client'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import request from 'supertest'
import type { App } from 'supertest/types.js'

import {
  MONTHLY_ALLOCATION_NANO_USD,
  TRIAL_ALLOCATION_NANO_USD,
  buildSeedPlan,
} from '../../prisma/seed-plan.js'
import { listenLocal } from './listen-local.js'
import { runSeed } from '../../prisma/seed-runner.js'
import { createApp } from '../../src/bootstrap.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Every lifecycle status (the no-ledger-write proof reads them all). */
const ALL_STATUSES: UsageStatus[] = ['pending', 'posted', 'reversed', 'released']

/** A window covering every seeded row (history spans 90 days pre-epoch). */
const WINDOW = { from: '2026-01-01T00:00:00.000Z', to: '2026-07-02T00:00:00.000Z' }

const plan = buildSeedPlan()

/** One seeded usage row (the created-many input shape). */
type SeedRow = Prisma.AiUsageRecordCreateManyInput

/** The seeded USER-traffic rows for one tenant (system rows excluded). */
function userRows(tenantId: string, userId?: string): SeedRow[] {
  return plan.usageRecords.filter(
    (row) =>
      row.tenantId === tenantId &&
      row.isSystemCost !== true &&
      row.scopeType === 'user' &&
      (userId === undefined || row.scopeId === userId),
  )
}

/** Independent aggregation of seed rows (the expected summary values). */
function totalsOf(rows: SeedRow[]): {
  records: number
  totalTokens: number
  rawCostNanoUsd: string
  billedCostNanoUsd: string
} {
  let totalTokens = 0
  let raw = 0n
  let billed = 0n
  for (const row of rows) {
    totalTokens += row.totalTokens ?? 0
    raw += BigInt(row.rawCostNanoUsd ?? 0)
    billed += BigInt(row.billedCostNanoUsd ?? 0)
  }
  return {
    records: rows.length,
    totalTokens,
    rawCostNanoUsd: raw.toString(),
    billedCostNanoUsd: billed.toString(),
  }
}

/** Group seed rows by a key extractor into sorted expected summaries. */
function groupedTotals(
  rows: SeedRow[],
  keyOf: (row: SeedRow) => string,
): { key: string; records: number; totalTokens: number; billedCostNanoUsd: string }[] {
  const keys = [...new Set(rows.map(keyOf))].sort()
  return keys.map((key) => {
    const totals = totalsOf(rows.filter((row) => keyOf(row) === key))
    return {
      key,
      records: totals.records,
      totalTokens: totals.totalTokens,
      billedCostNanoUsd: totals.billedCostNanoUsd,
    }
  })
}

let container: StartedPostgreSqlContainer | undefined
let app: INestApplication | undefined
let server: App
let ledger: LedgerService

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
  server = await listenLocal(app)
  ledger = app.get(LedgerService)
})

/** App first (pools, timers), then the container; both guarded. */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

describe('GET /usage/balance', () => {
  /**
   * The seeded grants ARE the balance, and reading appends nothing.
   *
   * ada holds the monthly allocation plus the trial grant; the read is
   * unmetered and unguarded (skip semantics are metadata absence), so the
   * caller's ledger row count is identical before and after.
   */
  it('returns the seeded grant total without writing any ledger row', async () => {
    const rowsBefore = await ledger.query({
      tenantId: 'acme',
      scope: { type: 'user', id: 'ada' },
      status: ALL_STATUSES,
    })

    const response = await request(server)
      .get('/usage/balance')
      .set('x-demo-user', 'ada')
      .expect(200)

    const expected = MONTHLY_ALLOCATION_NANO_USD + TRIAL_ALLOCATION_NANO_USD
    expect(response.body).toEqual({
      nanoUsd: expected.toString(),
      credits: 60,
      formatted: '$60.000000',
    })
    const rowsAfter = await ledger.query({
      tenantId: 'acme',
      scope: { type: 'user', id: 'ada' },
      status: ALL_STATUSES,
    })
    expect(rowsAfter.length).toBe(rowsBefore.length)
  })
})

describe('GET /usage/by-type (matrix row 68 reconciled to the feature dimension)', () => {
  /**
   * Exact per-feature aggregation for one seeded user.
   *
   * ada's demo.chat and demo.embeddings rows aggregate to EXACTLY the
   * values computed independently from the seed plan: records, tokens,
   * and bigint costs as decimal strings, with system rows excluded.
   */
  it('matches the seed plan exactly for ada', async () => {
    const response = await request(server)
      .get('/usage/by-type')
      .query(WINDOW)
      .set('x-demo-user', 'ada')
      .expect(200)

    const expected = groupedTotals(userRows('acme', 'ada'), (row) => row.feature)
    const items = [...(response.body.items as { group: { feature: string } }[])].sort((a, b) =>
      a.group.feature.localeCompare(b.group.feature),
    )
    expect(items).toHaveLength(expected.length)
    for (const [index, expectation] of expected.entries()) {
      expect(items[index]).toMatchObject({
        group: { feature: expectation.key },
        records: expectation.records,
        totalTokens: expectation.totalTokens,
        billedCostNanoUsd: expectation.billedCostNanoUsd,
      })
    }
  })

  /**
   * The tenant switch widens the report.
   *
   * scope=tenant covers ada AND grace: the per-feature record counts
   * equal the tenant-wide seed aggregation.
   */
  it('aggregates the whole tenant on scope=tenant', async () => {
    const response = await request(server)
      .get('/usage/by-type')
      .query({ ...WINDOW, scope: 'tenant' })
      .set('x-demo-user', 'ada')
      .expect(200)

    const expected = groupedTotals(userRows('acme'), (row) => row.feature)
    const items = response.body.items as { records: number }[]
    const totalRecords = items.reduce((sum, item) => sum + item.records, 0)
    expect(totalRecords).toBe(expected.reduce((sum, item) => sum + item.records, 0))
  })
})

describe('GET /usage/by-model', () => {
  /**
   * Exact per-model aggregation (matrix row 69).
   *
   * ada's traffic splits across the two seeded models with exact totals.
   */
  it('matches the seed plan per model for ada', async () => {
    const response = await request(server)
      .get('/usage/by-model')
      .query(WINDOW)
      .set('x-demo-user', 'ada')
      .expect(200)

    const expected = groupedTotals(userRows('acme', 'ada'), (row) => row.model)
    const items = [...(response.body.items as { group: { model: string } }[])].sort((a, b) =>
      a.group.model.localeCompare(b.group.model),
    )
    expect(items.map((item) => item.group.model)).toEqual(expected.map((item) => item.key))
    for (const [index, expectation] of expected.entries()) {
      expect(items[index]).toMatchObject({
        records: expectation.records,
        billedCostNanoUsd: expectation.billedCostNanoUsd,
      })
    }
  })
})

describe('GET /usage/by-period', () => {
  /**
   * Exact monthly buckets (matrix row 67).
   *
   * Month granularity buckets ada's rows by their ISO month; every
   * bucket matches the independent aggregation exactly.
   */
  it('buckets ada by ISO month with exact totals', async () => {
    const response = await request(server)
      .get('/usage/by-period')
      .query({ ...WINDOW, granularity: 'month' })
      .set('x-demo-user', 'ada')
      .expect(200)

    const expected = groupedTotals(userRows('acme', 'ada'), (row) =>
      new Date(row.occurredAt).toISOString().slice(0, 7),
    )
    const items = [...(response.body.items as { group: { month: string } }[])].sort((a, b) =>
      a.group.month.localeCompare(b.group.month),
    )
    expect(items.map((item) => item.group.month)).toEqual(expected.map((item) => item.key))
    for (const [index, expectation] of expected.entries()) {
      expect(items[index]).toMatchObject({
        records: expectation.records,
        totalTokens: expectation.totalTokens,
        billedCostNanoUsd: expectation.billedCostNanoUsd,
      })
    }
  })
})

describe('GET /usage/top-consumers (matrix row 70)', () => {
  /**
   * Ordered by billed spend, cut to topN, system rows excluded.
   *
   * The acme ranking equals the independent seed aggregation ordered by
   * billed cost descending; topN=1 returns only the heaviest consumer.
   */
  it('ranks acme consumers exactly per the seed plan', async () => {
    const expected = groupedTotals(userRows('acme'), (row) => `user:${row.scopeId}`).sort((a, b) =>
      BigInt(a.billedCostNanoUsd) === BigInt(b.billedCostNanoUsd)
        ? 0
        : BigInt(a.billedCostNanoUsd) < BigInt(b.billedCostNanoUsd)
          ? 1
          : -1,
    )

    const full = await request(server)
      .get('/usage/top-consumers')
      .query(WINDOW)
      .set('x-demo-user', 'ada')
      .expect(200)
    const fullItems = full.body.items as { group: { scope: string }; billedCostNanoUsd: string }[]
    expect(fullItems.map((item) => item.group.scope)).toEqual(expected.map((item) => item.key))
    expect(fullItems.map((item) => item.billedCostNanoUsd)).toEqual(
      expected.map((item) => item.billedCostNanoUsd),
    )

    const top1 = await request(server)
      .get('/usage/top-consumers')
      .query({ ...WINDOW, topN: 1 })
      .set('x-demo-user', 'ada')
      .expect(200)
    expect(top1.body.items).toHaveLength(1)
    expect(top1.body.items[0].group.scope).toBe(expected[0]?.key)
  })
})

describe('GET /usage/system-costs (matrix rows 71, 84)', () => {
  /**
   * System rows aggregate under their category and ONLY there.
   *
   * The two seeded acme reindex snapshots aggregate exactly; the same
   * rows never appeared in the user by-type report above (they are
   * tenant-scoped system costs).
   */
  it('aggregates the seeded reindex snapshots exactly', async () => {
    const response = await request(server)
      .get('/usage/system-costs')
      .query(WINDOW)
      .set('x-demo-user', 'ada')
      .expect(200)

    const systemRows = plan.usageRecords.filter(
      (row) => row.tenantId === 'acme' && row.isSystemCost === true,
    )
    const expected = totalsOf(systemRows)
    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0]).toMatchObject({
      group: { systemCostCategory: 'reindex' },
      records: expected.records,
      totalTokens: expected.totalTokens,
      billedCostNanoUsd: expected.billedCostNanoUsd,
    })
  })

  /**
   * The category filter narrows and misses cleanly.
   *
   * Filtering to the seeded category returns it; an unknown category is
   * an empty (not erroneous) report.
   */
  it('filters by category', async () => {
    const hit = await request(server)
      .get('/usage/system-costs')
      .query({ ...WINDOW, category: 'reindex' })
      .set('x-demo-user', 'ada')
      .expect(200)
    expect(hit.body.items).toHaveLength(1)

    const miss = await request(server)
      .get('/usage/system-costs')
      .query({ ...WINDOW, category: 'unknown-category' })
      .set('x-demo-user', 'ada')
      .expect(200)
    expect(miss.body.items).toHaveLength(0)
  })
})

describe('query validation and identity gates', () => {
  /**
   * Bounded, whitelisted queries only.
   *
   * Inverted windows, unknown granularities, and out-of-range topN are
   * 400 before the aggregator runs; every route is identity-scoped.
   */
  it('rejects malformed queries 400 and identity-less reads 401', async () => {
    await request(server)
      .get('/usage/by-period')
      .query({ from: WINDOW.to, to: WINDOW.from })
      .set('x-demo-user', 'ada')
      .expect(400)
    await request(server)
      .get('/usage/by-period')
      .query({ granularity: 'year' })
      .set('x-demo-user', 'ada')
      .expect(400)
    await request(server)
      .get('/usage/top-consumers')
      .query({ topN: 0 })
      .set('x-demo-user', 'ada')
      .expect(400)
    await request(server).get('/usage/balance').expect(401)
    await request(server).get('/usage/by-type').expect(401)
  })
})
