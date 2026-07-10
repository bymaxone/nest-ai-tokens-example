/**
 * Unit tests for the pricing catalog service.
 *
 * Layer: unit.
 * Goal: prove the current listing filters and orders IN the database (call
 * shape: `where effectiveTo null` + orderBy, never a full-table fetch), the
 * history delegation and empty-tuple 404, the admin gate on updates, the
 * exact `NewPriceVersion` construction (provided fields only, server-forced
 * manual provenance), and JSON-safe money mapping.
 * Mocks: the Prisma client and the library PricingService.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, jest } from '@jest/globals'
import type { PriceVersion, PricingService } from '@bymax-one/nest-ai-tokens'
import type { AiModelPrice } from '@prisma/client'

import { updatePriceBodySchema } from './dto/update-price.body.js'
import {
  PRICING_ADMIN_USER_ID,
  PricingCatalogService,
  buildNewPriceVersion,
} from './pricing-catalog.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'

/** A complete open Prisma price row fixture. */
function priceRowWith(overrides: Partial<AiModelPrice> = {}): AiModelPrice {
  return {
    id: 'price-row-1',
    provider: 'mock',
    model: 'mock-chat-pro',
    operation: 'chat',
    serviceTier: 'standard',
    inputNanoUsdPerMillion: 600_000_000n,
    outputNanoUsdPerMillion: 2_400_000_000n,
    cacheReadNanoUsdPerMillion: 0n,
    cacheWrite5mNanoUsdPerMillion: 0n,
    cacheWrite1hNanoUsdPerMillion: 0n,
    reasoningNanoUsdPerMillion: 2_400_000_000n,
    audioInNanoUsdPerMillion: 0n,
    audioOutNanoUsdPerMillion: 0n,
    imageInNanoUsdPerMillion: 0n,
    imageOutNanoUsdPerMillion: 0n,
    tierThresholdTokens: null,
    tierInputNanoUsdPerMillion: null,
    tierOutputNanoUsdPerMillion: null,
    unitRates: null,
    currency: 'USD',
    effectiveFrom: new Date(0),
    effectiveTo: null,
    source: 'seed:mock',
    ...overrides,
  }
}

/** A complete library price version fixture. */
function versionWith(overrides: Partial<PriceVersion> = {}): PriceVersion {
  return {
    id: 'version-1',
    provider: 'mock',
    model: 'mock-chat-pro',
    operation: 'chat',
    serviceTier: 'standard',
    inputNanoUsdPerMillion: 600_000_000n,
    outputNanoUsdPerMillion: 2_400_000_000n,
    cacheReadNanoUsdPerMillion: 0n,
    cacheWrite5mNanoUsdPerMillion: 0n,
    cacheWrite1hNanoUsdPerMillion: 0n,
    reasoningNanoUsdPerMillion: 2_400_000_000n,
    audioInNanoUsdPerMillion: 0n,
    audioOutNanoUsdPerMillion: 0n,
    imageInNanoUsdPerMillion: 0n,
    imageOutNanoUsdPerMillion: 0n,
    currency: 'USD',
    effectiveFrom: new Date(0),
    effectiveTo: null,
    source: 'seed:mock',
    ...overrides,
  }
}

/** The service under test plus its doubles. */
function serviceWith(rows: AiModelPrice[], versions: PriceVersion[]) {
  const findMany = jest
    .fn<(args: { where: unknown; orderBy: unknown }) => Promise<AiModelPrice[]>>()
    .mockResolvedValue(rows)
  const getPriceHistory = jest.fn<PricingService['getPriceHistory']>().mockResolvedValue(versions)
  const upsertPrice = jest
    .fn<PricingService['upsertPrice']>()
    .mockResolvedValue(versionWith({ id: 'version-2', source: 'manual' }))
  const prisma = { aiModelPrice: { findMany } } as unknown as PrismaService
  const pricing = { getPriceHistory, upsertPrice } as unknown as PricingService
  return {
    service: new PricingCatalogService(prisma, pricing),
    findMany,
    getPriceHistory,
    upsertPrice,
  }
}

describe('PricingCatalogService.current', () => {
  /**
   * In-database filtering and ordering.
   *
   * The catalog read must select ONLY the open windows and order in SQL:
   * the call shape carries `effectiveTo: null` and the four-key orderBy, so
   * no full-table fetch or in-memory sort can regress in.
   */
  it('selects only open windows with database-side ordering', async () => {
    const { service, findMany } = serviceWith([priceRowWith()], [])

    await service.current()

    expect(findMany).toHaveBeenCalledWith({
      where: { effectiveTo: null },
      orderBy: [
        { provider: 'asc' },
        { model: 'asc' },
        { operation: 'asc' },
        { serviceTier: 'asc' },
      ],
    })
  })

  /**
   * JSON-safe money.
   *
   * Bigint rate columns must render as decimal strings so the payload
   * survives JSON.stringify without precision loss.
   */
  it('maps bigint rates to decimal strings', async () => {
    const { service } = serviceWith([priceRowWith()], [])

    const { items } = await service.current()

    expect(items[0]?.inputNanoUsdPerMillion).toBe('600000000')
    expect(items[0]?.outputNanoUsdPerMillion).toBe('2400000000')
  })
})

describe('PricingCatalogService.history', () => {
  /**
   * Tuple delegation.
   *
   * The path model joins the query's provider/operation/tier exactly as
   * the library's getPriceHistory signature expects.
   */
  it('delegates the tuple to the library history', async () => {
    const { service, getPriceHistory } = serviceWith([], [versionWith()])

    const { items } = await service.history('mock-chat-pro', {
      provider: 'mock',
      operation: 'chat',
      serviceTier: 'standard',
    })

    expect(getPriceHistory).toHaveBeenCalledWith('mock', 'mock-chat-pro', 'chat', 'standard')
    expect(items[0]?.inputNanoUsdPerMillion).toBe('600000000')
  })

  /**
   * Unknown tuple.
   *
   * An empty history means the model was never priced for that tuple; the
   * endpoint answers 404 instead of an empty 200 that dashboards would
   * render as a broken timeline.
   */
  it('throws 404 when the tuple has no history', async () => {
    const { service } = serviceWith([], [])

    await expect(
      service.history('ghost-model', { provider: 'mock', operation: 'chat' }),
    ).rejects.toThrow(NotFoundException)
  })
})

describe('PricingCatalogService.update', () => {
  const body = updatePriceBodySchema.parse({
    provider: 'mock',
    operation: 'chat',
    inputNanoUsdPerMillion: '700000000',
  })

  /**
   * Admin gate.
   *
   * Price updates are admin plane; any identity other than the demo admin
   * is rejected with 403 BEFORE the library is called.
   */
  it('rejects non-admin identities with 403', async () => {
    const { service, upsertPrice } = serviceWith([], [])

    await expect(
      service.update({ id: 'ada', tenantId: 'acme' }, 'mock-chat-pro', body),
    ).rejects.toThrow(ForbiddenException)
    expect(upsertPrice).not.toHaveBeenCalled()
  })

  /**
   * Admin update delegation.
   *
   * The demo admin's update reaches upsertPrice with the exact
   * NewPriceVersion and the JSON-safe successor row is returned.
   */
  it('upserts for the demo admin and returns the successor', async () => {
    const { service, upsertPrice } = serviceWith([], [])

    const version = await service.update(
      { id: PRICING_ADMIN_USER_ID, tenantId: null },
      'mock-chat-pro',
      body,
    )

    expect(upsertPrice).toHaveBeenCalledWith({
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      inputNanoUsdPerMillion: 700_000_000n,
      source: 'manual',
    })
    expect(version.id).toBe('version-2')
    expect(version.source).toBe('manual')
  })
})

describe('buildNewPriceVersion', () => {
  /**
   * Provided-fields-only construction.
   *
   * Absent optional fields must be omitted (the store owns the defaults),
   * provided ones pass through as bigint, and provenance is always the
   * server-forced 'manual', never client input.
   */
  it('carries provided fields, omits absent ones, and forces manual provenance', () => {
    const full = buildNewPriceVersion(
      'mock-chat-pro',
      updatePriceBodySchema.parse({
        provider: 'mock',
        operation: 'chat',
        serviceTier: 'batch',
        tierThresholdTokens: 200_000,
        unitRates: { web_search_requests: '10000000' },
        inputNanoUsdPerMillion: '700000000',
        outputNanoUsdPerMillion: '2800000000',
      }),
    )
    const minimal = buildNewPriceVersion(
      'mock-chat-pro',
      updatePriceBodySchema.parse({
        provider: 'mock',
        operation: 'chat',
        inputNanoUsdPerMillion: '700000000',
      }),
    )

    expect(full).toEqual({
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      serviceTier: 'batch',
      tierThresholdTokens: 200_000,
      unitRates: { web_search_requests: 10_000_000n },
      inputNanoUsdPerMillion: 700_000_000n,
      outputNanoUsdPerMillion: 2_800_000_000n,
      source: 'manual',
    })
    expect(minimal).toEqual({
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      inputNanoUsdPerMillion: 700_000_000n,
      source: 'manual',
    })
  })
})
