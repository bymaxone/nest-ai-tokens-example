/**
 * Unit tests for the idempotent boot price seed.
 *
 * Layer: unit.
 * Goal: prove the lock-check-insert protocol (advisory lock first, skip when
 * seed-sourced rows exist, duplicate-safe insert of snapshot plus mock rows)
 * and the exact row mapping (bigint rates, decimal-string unitRates, epoch
 * effectiveFrom, tier fields only when present).
 * Mocks: a Prisma client double whose $transaction hands the callback a
 * recording transaction client; no database is touched.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { MODEL_PRICES_SEED } from '@bymax-one/nest-ai-tokens/prices'

import { MOCK_MODEL_PRICES, MOCK_PRICE_SOURCE } from './mock-model-prices.js'
import {
  PRICING_SEED_LOCK_KEY,
  PricingSeedService,
  SEED_EFFECTIVE_FROM,
  SEED_SOURCES,
  buildPricingSeedRows,
  toPriceCreateInput,
} from './pricing-seed.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'

/** Call log plus the Prisma double handed to the service under test. */
interface PrismaDouble {
  prisma: PrismaService
  calls: string[]
  countMock: jest.Mock<(args: { where: unknown }) => Promise<number>>
  createManyMock: jest.Mock<
    (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<{ count: number }>
  >
  executeRawMock: jest.Mock<(...args: unknown[]) => Promise<number>>
}

/**
 * Build a Prisma double: `$transaction` invokes the callback with a
 * transaction client that records call order and returns the given count.
 *
 * @param existingCount Result of the existence check inside the transaction.
 * @returns The double and its recording mocks.
 */
function prismaDouble(existingCount: number): PrismaDouble {
  const calls: string[] = []
  const executeRawMock = jest.fn<(...args: unknown[]) => Promise<number>>((...args) => {
    const template = Array.isArray(args[0]) ? args[0] : []
    calls.push(`executeRaw:${String(template[0] ?? '')}`)
    return Promise.resolve(0)
  })
  const countMock = jest.fn<(args: { where: unknown }) => Promise<number>>(() => {
    calls.push('count')
    return Promise.resolve(existingCount)
  })
  const createManyMock = jest.fn<
    (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<{ count: number }>
  >((args) => {
    calls.push('createMany')
    return Promise.resolve({ count: args.data.length })
  })
  const tx = {
    $executeRaw: executeRawMock,
    aiModelPrice: { count: countMock, createMany: createManyMock },
  }
  const prisma = {
    $transaction: (callback: (client: typeof tx) => Promise<number>) => callback(tx),
  } as unknown as PrismaService
  return { prisma, calls, countMock, createManyMock, executeRawMock }
}

describe('PricingSeedService.seed', () => {
  /**
   * First boot on an empty registry.
   *
   * The seed must take the advisory lock BEFORE checking existence (so a
   * concurrent boot waits and re-checks), then insert every snapshot and
   * mock row with skipDuplicates as the final race backstop.
   */
  it('locks, checks, then inserts every seed row once', async () => {
    const double = prismaDouble(0)
    const service = new PricingSeedService(double.prisma)

    const inserted = await service.seed()

    expect(inserted).toBe(MODEL_PRICES_SEED.length + MOCK_MODEL_PRICES.length)
    expect(double.calls[0]).toContain('pg_advisory_xact_lock')
    expect(double.calls[1]).toBe('count')
    expect(double.calls[2]).toBe('createMany')
    expect(double.executeRawMock.mock.calls[0]).toContain(PRICING_SEED_LOCK_KEY)
    expect(double.countMock).toHaveBeenCalledWith({ where: { source: { in: [...SEED_SOURCES] } } })
    expect(double.createManyMock).toHaveBeenCalledWith({
      data: buildPricingSeedRows(),
      skipDuplicates: true,
    })
  })

  /**
   * Later boot (or the loser of a concurrent race after the lock releases).
   *
   * Any existing seed-sourced row means the seed already ran; nothing may
   * be written, keeping restarts byte-stable.
   */
  it('skips the insert when seed-sourced rows already exist', async () => {
    const double = prismaDouble(21)
    const service = new PricingSeedService(double.prisma)

    const inserted = await service.seed()

    expect(inserted).toBe(0)
    expect(double.createManyMock).not.toHaveBeenCalled()
  })
})

describe('PricingSeedService.onApplicationBootstrap', () => {
  /**
   * Boot hook delegation, seeding path.
   *
   * The lifecycle hook runs the seed and logs the inserted count once.
   */
  it('runs the seed on bootstrap', async () => {
    const double = prismaDouble(0)
    const service = new PricingSeedService(double.prisma)

    await service.onApplicationBootstrap()

    expect(double.createManyMock).toHaveBeenCalledTimes(1)
  })

  /**
   * Boot hook delegation, already-seeded path.
   *
   * A no-op seed stays silent (no misleading "seeded" log on every boot).
   */
  it('stays silent when the seed was a no-op', async () => {
    const double = prismaDouble(21)
    const service = new PricingSeedService(double.prisma)

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
    expect(double.createManyMock).not.toHaveBeenCalled()
  })
})

describe('toPriceCreateInput', () => {
  /**
   * Full-field mapping.
   *
   * Bigint rates pass through untouched, unitRates become decimal strings
   * (the JSON wire format the store adapter reads back into bigint), the
   * long-context tier fields are kept, and every seeded window opens at the
   * epoch.
   */
  it('maps rates as bigint, unitRates as decimal strings, and anchors the window', () => {
    const input = toPriceCreateInput({
      provider: 'openai',
      model: 'sample-model',
      operation: 'chat',
      serviceTier: 'standard',
      inputNanoUsdPerMillion: 1n,
      outputNanoUsdPerMillion: 2n,
      cacheReadNanoUsdPerMillion: 3n,
      cacheWrite5mNanoUsdPerMillion: 4n,
      cacheWrite1hNanoUsdPerMillion: 5n,
      reasoningNanoUsdPerMillion: 6n,
      audioInNanoUsdPerMillion: 7n,
      audioOutNanoUsdPerMillion: 8n,
      imageInNanoUsdPerMillion: 9n,
      imageOutNanoUsdPerMillion: 10n,
      tierThresholdTokens: 200_000,
      tierInputNanoUsdPerMillion: 11n,
      tierOutputNanoUsdPerMillion: 12n,
      unitRates: { web_search_requests: 10_000_000n },
      currency: 'USD',
      source: 'snapshot',
    })

    expect(input).toEqual({
      provider: 'openai',
      model: 'sample-model',
      operation: 'chat',
      serviceTier: 'standard',
      inputNanoUsdPerMillion: 1n,
      outputNanoUsdPerMillion: 2n,
      cacheReadNanoUsdPerMillion: 3n,
      cacheWrite5mNanoUsdPerMillion: 4n,
      cacheWrite1hNanoUsdPerMillion: 5n,
      reasoningNanoUsdPerMillion: 6n,
      audioInNanoUsdPerMillion: 7n,
      audioOutNanoUsdPerMillion: 8n,
      imageInNanoUsdPerMillion: 9n,
      imageOutNanoUsdPerMillion: 10n,
      tierThresholdTokens: 200_000,
      tierInputNanoUsdPerMillion: 11n,
      tierOutputNanoUsdPerMillion: 12n,
      unitRates: { web_search_requests: '10000000' },
      currency: 'USD',
      effectiveFrom: SEED_EFFECTIVE_FROM,
      effectiveTo: null,
      source: 'snapshot',
    })
  })

  /**
   * Optional-field omission.
   *
   * Absent tier fields and unitRates must be omitted (not null-stuffed), so
   * the insert relies on the schema defaults exactly like the library's own
   * writer.
   */
  it('omits absent tier fields and unitRates', () => {
    const input = toPriceCreateInput({
      provider: 'mock',
      model: 'mock-embed',
      operation: 'embeddings',
      serviceTier: 'standard',
      inputNanoUsdPerMillion: 100_000_000n,
      outputNanoUsdPerMillion: 0n,
      cacheReadNanoUsdPerMillion: 0n,
      cacheWrite5mNanoUsdPerMillion: 0n,
      cacheWrite1hNanoUsdPerMillion: 0n,
      reasoningNanoUsdPerMillion: 0n,
      audioInNanoUsdPerMillion: 0n,
      audioOutNanoUsdPerMillion: 0n,
      imageInNanoUsdPerMillion: 0n,
      imageOutNanoUsdPerMillion: 0n,
      currency: 'USD',
      source: MOCK_PRICE_SOURCE,
    })

    expect(input).not.toHaveProperty('tierThresholdTokens')
    expect(input).not.toHaveProperty('tierInputNanoUsdPerMillion')
    expect(input).not.toHaveProperty('tierOutputNanoUsdPerMillion')
    expect(input).not.toHaveProperty('unitRates')
  })
})

describe('buildPricingSeedRows', () => {
  /**
   * Seed composition.
   *
   * The boot seed is exactly the library snapshot followed by the three
   * mock models; every row opens at the epoch so any backdated cost
   * calculation finds a window.
   */
  it('concatenates the snapshot and the mock models in stable order', () => {
    const rows = buildPricingSeedRows()

    expect(rows).toHaveLength(MODEL_PRICES_SEED.length + MOCK_MODEL_PRICES.length)
    expect(rows.every((row) => row.effectiveFrom === SEED_EFFECTIVE_FROM)).toBe(true)
    expect(rows.slice(MODEL_PRICES_SEED.length).map((row) => row.model)).toEqual([
      'mock-chat-pro',
      'mock-chat-lite',
      'mock-embed',
    ])
  })
})
