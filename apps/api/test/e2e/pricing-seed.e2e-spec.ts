/**
 * E2E tests for boot pricing-seed idempotency.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: prove the boot seed writes the library snapshot plus the mock
 * models exactly once per database. A second sequential boot changes
 * nothing (row count and full row snapshot stay identical), a concurrent
 * double boot tolerates the race (advisory lock plus re-check), and the
 * seeded rows resolve through the library's PricingService.
 * Mocks: none. One container per spec file; boots run one at a time except
 * the deliberate concurrent-race case.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { PricingService } from '@bymax-one/nest-ai-tokens'
import { MODEL_PRICES_SEED } from '@bymax-one/nest-ai-tokens/prices'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import { createApp } from '../../src/bootstrap.js'
import { MOCK_MODEL_PRICES } from '../../src/pricing/mock-model-prices.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI, which reads prisma.config.ts). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Every row the boot seed owns. */
const EXPECTED_SEED_ROWS = MODEL_PRICES_SEED.length + MOCK_MODEL_PRICES.length

/** A stable, comparable snapshot of one price row. */
interface PriceRowSnapshot {
  id: string
  provider: string
  model: string
  effectiveFrom: string
  effectiveTo: string | null
  inputNanoUsdPerMillion: bigint
}

let container: StartedPostgreSqlContainer | undefined
let app: INestApplication | undefined

/**
 * Read a deterministic snapshot of the whole price table through the app's
 * Prisma client, ordered so two reads compare positionally.
 *
 * @param application The booted application owning the client.
 * @returns One snapshot row per price row.
 */
async function priceTableSnapshot(application: INestApplication): Promise<PriceRowSnapshot[]> {
  const prisma = application.get(PrismaService)
  const rows = await prisma.aiModelPrice.findMany({
    orderBy: [{ provider: 'asc' }, { model: 'asc' }, { operation: 'asc' }, { serviceTier: 'asc' }],
  })
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    model: row.model,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo === null ? null : row.effectiveTo.toISOString(),
    inputNanoUsdPerMillion: row.inputNanoUsdPerMillion,
  }))
}

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
})

/** Teardown order matters: app first (pools), then the container. */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

describe('boot pricing seed', () => {
  /**
   * First boot seeds exactly once.
   *
   * The price table must hold exactly the library snapshot plus the three
   * mock models, every row an open window anchored at the epoch.
   */
  it('seeds the snapshot and the mock models on first boot', async () => {
    if (app === undefined) throw new Error('app must be booted')

    const snapshot = await priceTableSnapshot(app)

    expect(snapshot).toHaveLength(EXPECTED_SEED_ROWS)
    expect(snapshot.every((row) => row.effectiveTo === null)).toBe(true)
    expect(snapshot.every((row) => row.effectiveFrom === new Date(0).toISOString())).toBe(true)
  })

  /**
   * Sequential double boot is a strict no-op.
   *
   * A restart against the already-seeded database must leave the table
   * byte-identical: same count, same row ids, same window fields (the
   * schema is append-only with no updated timestamp, so identical ids and
   * values prove no row was rewritten).
   */
  it('changes nothing on a second sequential boot', async () => {
    if (app === undefined) throw new Error('app must be booted')
    const before = await priceTableSnapshot(app)

    const secondBoot = await createApp()
    try {
      const after = await priceTableSnapshot(secondBoot)
      expect(after).toEqual(before)
    } finally {
      await secondBoot.close()
    }
  })

  /**
   * Race condition: concurrent boots.
   *
   * Two applications booting at once against one database serialize on the
   * transaction-scoped advisory lock; the loser re-checks and skips, so the
   * table still holds exactly one row per seeded tuple.
   */
  it('tolerates a concurrent double boot', async () => {
    if (app === undefined) throw new Error('app must be booted')

    const [bootA, bootB] = await Promise.all([createApp(), createApp()])
    try {
      const snapshot = await priceTableSnapshot(bootA)
      expect(snapshot).toHaveLength(EXPECTED_SEED_ROWS)
    } finally {
      await bootA.close()
      await bootB.close()
    }
  })

  /**
   * Seeded rows resolve through the library.
   *
   * A shipped snapshot model (gpt-5-mini) and the demo flagship
   * (mock-chat-pro) must both resolve a current rate via PricingService,
   * proving the app-owned seed feeds the library's resolution chain.
   */
  it('resolves a snapshot model and a mock model at now', async () => {
    if (app === undefined) throw new Error('app must be booted')
    const pricing = app.get(PricingService)

    const snapshotRate = await pricing.resolveRate({
      provider: 'openai',
      model: 'gpt-5-mini',
      operation: 'chat',
      at: new Date(),
    })
    const mockRate = await pricing.resolveRate({
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      at: new Date(),
    })

    expect(snapshotRate?.source).toBe('snapshot')
    expect(mockRate?.inputNanoUsdPerMillion).toBe(600_000_000n)
  })

  /**
   * Snapshot completeness.
   *
   * Every row of the shipped MODEL_PRICES_SEED must be present with the
   * snapshot provenance, none duplicated (count equals the constant's
   * length).
   */
  it('persists exactly one row per shipped snapshot entry', async () => {
    if (app === undefined) throw new Error('app must be booted')
    const prisma = app.get(PrismaService)

    const snapshotRows = await prisma.aiModelPrice.count({ where: { source: 'snapshot' } })

    expect(snapshotRows).toBe(MODEL_PRICES_SEED.length)
  })
})
