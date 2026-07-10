/**
 * Integration tests for the bound `PrismaAiTokensStore` (the store instance
 * production wires; see `src/ai/ai-store.module.ts`).
 *
 * Layer: e2e (real PostgreSQL via Testcontainers, migrated and seeded).
 * Goal: prove the binding against real data. Ledger half: aggregation
 * happens in the database (`sumCost` totals match sums computed from the
 * deterministic seed plan), the filter contract holds (scope, operation,
 * inclusive date bounds, limit/offset), and rows map to the library types
 * (bigint nano-USD, Decimal markup to number, Date fields). Pricing half:
 * the effective-dated window predicate, max-`effectiveFrom` overlap
 * resolution, atomic close-and-insert on update, concurrent-upsert race
 * safety (exactly one open row per tuple), and bigint rate round-trips.
 * Mocks: none. One container per spec file; the suite runs single-worker.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { PrismaAiTokensStore } from '@bymax-one/nest-ai-tokens/prisma'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import { buildSeedPlan } from '../../prisma/seed-plan.js'
import { runSeed } from '../../prisma/seed-runner.js'
import { createPrismaAiTokensStore } from '../../src/ai/ai-store.module.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'
import type { EnvConfig } from '../../src/config/env.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI, which reads prisma.config.ts). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** A complete typed env fixture pointing at the container database. */
function envFor(databaseUrl: string): EnvConfig {
  return {
    DATABASE_URL: databaseUrl,
    PORT: 0,
    AI_PROVIDER_MODE: 'mock',
    QUOTA_ENABLED: true,
    QUOTA_TOLERANCE: 1.2,
    QUOTA_MINIMUM_BALANCE: 0,
    TENANT_REQUIRED: false,
    PRICING_CACHE_TTL_MS: 300_000,
  }
}

const plan = buildSeedPlan()

/** The deterministic seed rows for one user scope within a tenant. */
function seededUserRows(tenantId: string, userId: string): typeof plan.usageRecords {
  return plan.usageRecords.filter(
    (row) => row.tenantId === tenantId && row.scopeType === 'user' && row.scopeId === userId,
  )
}

/**
 * The first element of a list of fixture rows, asserted present so tests
 * never index into possibly-empty data silently.
 *
 * @param rows The fixture rows.
 * @returns The first row.
 * @throws {Error} when the fixture slice is unexpectedly empty.
 */
function first<T>(rows: readonly T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('fixture slice is empty')
  return row
}

let container: StartedPostgreSqlContainer | undefined
let prisma: PrismaService | undefined
let store: PrismaAiTokensStore

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
  prisma = new PrismaService(envFor(databaseUrl))
  await runSeed(prisma)
  store = createPrismaAiTokensStore(prisma)
})

/** Teardown order matters: client pool first, then the container. */
afterAll(async () => {
  try {
    await prisma?.onModuleDestroy()
  } finally {
    await container?.stop()
  }
})

describe('ledger half (3.1): aggregation in the database and the filter contract', () => {
  /**
   * Database-side aggregation vs the deterministic plan.
   *
   * `sumCost` runs `SUM`/`COUNT` in SQL; its totals must equal the sums
   * computed independently from the seed plan for ada's scope, proving the
   * aggregate reflects every row without fetching the table.
   */
  it('sumCost matches plan-computed totals for a user scope', async () => {
    const rows = seededUserRows('acme', 'ada')
    const expectedBilled = rows.reduce((sum, row) => sum + BigInt(row.billedCostNanoUsd ?? 0n), 0n)
    const expectedRaw = rows.reduce((sum, row) => sum + BigInt(row.rawCostNanoUsd ?? 0n), 0n)
    const expectedTokens = rows.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0)

    const summary = await store.sumCost({
      tenantId: 'acme',
      scope: { type: 'user', id: 'ada' },
    })

    expect(summary.records).toBe(rows.length)
    expect(summary.billedCostNanoUsd).toBe(expectedBilled)
    expect(summary.rawCostNanoUsd).toBe(expectedRaw)
    expect(summary.totalTokens).toBe(expectedTokens)
  })

  /**
   * Aggregation over an empty match.
   *
   * An unknown tenant matches nothing; the summary must coalesce to exact
   * zeros (bigint zero, not null) so callers never special-case emptiness.
   */
  it('sumCost coalesces an empty match to zero totals', async () => {
    const summary = await store.sumCost({ tenantId: 'nowhere' })

    expect(summary).toEqual({
      rawCostNanoUsd: 0n,
      billedCostNanoUsd: 0n,
      surchargeNanoUsd: 0n,
      totalTokens: 0,
      records: 0,
    })
  })

  /**
   * Operation filter.
   *
   * The embeddings subset of grace's history is a strict, plan-computable
   * slice; `query` must return exactly those rows.
   */
  it('query honors the operation filter', async () => {
    const expected = seededUserRows('acme', 'grace').filter((row) => row.operation === 'embeddings')

    const records = await store.query({
      tenantId: 'acme',
      scope: { type: 'user', id: 'grace' },
      operation: 'embeddings',
    })

    expect(records).toHaveLength(expected.length)
    expect(records.every((record) => record.operation === 'embeddings')).toBe(true)
  })

  /**
   * Inclusive date bounds.
   *
   * Filtering with `from` and `to` both equal to one seeded row's
   * `occurredAt` must still return that row: both bounds are inclusive.
   */
  it('query treats from and to as inclusive bounds', async () => {
    const sample = first(seededUserRows('globex', 'linus'))
    const occurredAt = new Date(sample.occurredAt ?? 0)

    const records = await store.query({
      tenantId: 'globex',
      scope: { type: 'user', id: 'linus' },
      from: occurredAt,
      to: occurredAt,
    })

    expect(records.some((record) => record.id === sample.id)).toBe(true)
  })

  /**
   * System-cost isolation.
   *
   * `isSystemCost: false` must exclude the seeded reindex snapshots, and
   * the tenant-wide unfiltered count must equal users plus system rows,
   * proving the flag partitions the tenant ledger cleanly.
   */
  it('query and sumCost partition system costs from user traffic', async () => {
    const acmeRows = plan.usageRecords.filter((row) => row.tenantId === 'acme')
    const systemRows = acmeRows.filter((row) => row.isSystemCost === true)

    const userOnly = await store.sumCost({ tenantId: 'acme', isSystemCost: false })
    const all = await store.sumCost({ tenantId: 'acme' })

    expect(userOnly.records).toBe(acmeRows.length - systemRows.length)
    expect(all.records).toBe(acmeRows.length)
  })

  /**
   * Pagination window.
   *
   * `limit`/`offset` must bound the page in SQL: a five-row page exists,
   * and an offset beyond the scope's row count yields an empty page.
   */
  it('query honors limit and offset', async () => {
    const scopeRowCount = seededUserRows('acme', 'ada').length

    const page = await store.query({
      tenantId: 'acme',
      scope: { type: 'user', id: 'ada' },
      limit: 5,
      offset: 5,
    })
    const pastEnd = await store.query({
      tenantId: 'acme',
      scope: { type: 'user', id: 'ada' },
      offset: scopeRowCount,
    })

    expect(page).toHaveLength(5)
    expect(pastEnd).toHaveLength(0)
  })

  /**
   * Boundary mapping of one row.
   *
   * `findById` must return the library's `UsageRecord` shape: bigint
   * nano-USD money, the `Decimal(10,4)` markup as a plain number, and Date
   * instances, proving type conversion happens at the store boundary.
   */
  it('findById maps money, markup, and dates at the boundary', async () => {
    const sample = first(seededUserRows('acme', 'ada'))

    const record = await store.findById(sample.id ?? '')

    expect(record).not.toBeNull()
    if (record === null) throw new Error('seeded record must exist')
    expect(typeof record.billedCostNanoUsd).toBe('bigint')
    expect(typeof record.rawCostNanoUsd).toBe('bigint')
    expect(record.markupMultiplier).toBe(1.25)
    expect(record.occurredAt).toBeInstanceOf(Date)
    expect(record.occurredAt.toISOString()).toBe(new Date(sample.occurredAt ?? 0).toISOString())
    expect(record.scope).toEqual({ type: 'user', id: 'ada' })
  })

  /**
   * Missing-row contract.
   *
   * An unknown id resolves to `null` (never throws), the shape the reversal
   * and detail-endpoint paths rely on.
   */
  it('findById returns null for an unknown id', async () => {
    await expect(store.findById('00000000-0000-4000-8000-000000000000')).resolves.toBeNull()
  })
})
