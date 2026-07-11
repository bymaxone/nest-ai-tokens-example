/**
 * @fileoverview Shared component-test fixtures: builder functions for the
 * wire shapes with many required fields (`PriceRowView`, `UsageRecordView`),
 * each with sensible defaults so a test only overrides what it asserts on.
 * Test-only infrastructure, outside `src/lib` and `src/components`, so it
 * carries no coverage obligation of its own.
 *
 * @module test/fixtures
 */
import type { PriceRowView, UsageRecordView } from '@/lib/api-types'

/**
 * Builds a {@link PriceRowView} fixture (an open pricing window for
 * `mock-chat-standard`), overriding only the fields a test cares about.
 *
 * @param overrides Fields to override on the default row.
 * @returns The fixture.
 */
export function priceRowFixture(overrides: Partial<PriceRowView> = {}): PriceRowView {
  return {
    id: 'price-1',
    provider: 'mock',
    model: 'mock-chat-standard',
    operation: 'chat',
    serviceTier: 'standard',
    inputNanoUsdPerMillion: '1000000000',
    outputNanoUsdPerMillion: '2000000000',
    cacheReadNanoUsdPerMillion: '100000000',
    cacheWrite5mNanoUsdPerMillion: '1250000000',
    cacheWrite1hNanoUsdPerMillion: '2000000000',
    reasoningNanoUsdPerMillion: '2000000000',
    audioInNanoUsdPerMillion: '0',
    audioOutNanoUsdPerMillion: '0',
    imageInNanoUsdPerMillion: '0',
    imageOutNanoUsdPerMillion: '0',
    currency: 'USD',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
    source: 'seed',
    ...overrides,
  }
}

/**
 * Builds a {@link UsageRecordView} fixture (one posted ledger row),
 * overriding only the fields a test cares about.
 *
 * @param overrides Fields to override on the default row.
 * @returns The fixture.
 */
export function usageRecordFixture(overrides: Partial<UsageRecordView> = {}): UsageRecordView {
  return {
    id: 'txn-1',
    tenantId: 'acme',
    scope: { type: 'user', id: 'ada' },
    provider: 'mock',
    model: 'mock-chat-standard',
    operation: 'chat',
    serviceTier: 'standard',
    feature: 'workspace.translate',
    tags: [],
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    reasoningTokens: 0,
    audioInTokens: 0,
    audioOutTokens: 0,
    imageInTokens: 0,
    imageOutTokens: 0,
    totalTokens: 150,
    priceVersionId: 'price-1',
    rawCostNanoUsd: '1000000',
    surchargeNanoUsd: '0',
    billedCostNanoUsd: '1000000',
    markupMultiplier: 1,
    currency: 'USD',
    priceMissing: false,
    status: 'posted',
    idempotencyKey: 'idem-1',
    isSystemCost: false,
    enforced: true,
    occurredAt: '2026-07-01T12:00:00.000Z',
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
    ...overrides,
  }
}
