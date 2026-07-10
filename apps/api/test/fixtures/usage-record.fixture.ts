/**
 * @fileoverview Shared test fixture: a complete library `UsageRecord` with
 * overridable fields, matching the shape of one seeded chat row so unit
 * specs across features assert against one canonical record.
 *
 * @layer test
 */
import type { UsageRecord } from '@bymax-one/nest-ai-tokens'

/**
 * Build a complete usage record with overrides.
 *
 * @param overrides Fields to replace on the canonical fixture.
 * @returns The fixture record.
 */
export function recordWith(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    id: 'seed-usage-0001',
    tenantId: 'acme',
    scope: { type: 'user', id: 'ada' },
    provider: 'mock',
    model: 'mock-chat-pro',
    operation: 'chat',
    serviceTier: 'standard',
    feature: 'demo.chat',
    tags: ['seed'],
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
    priceVersionId: null,
    rawCostNanoUsd: 180_000n,
    surchargeNanoUsd: 0n,
    billedCostNanoUsd: 225_000n,
    markupMultiplier: 1.25,
    currency: 'USD',
    priceMissing: false,
    status: 'posted',
    idempotencyKey: 'seed-usage-0001',
    isSystemCost: false,
    enforced: false,
    occurredAt: new Date('2026-06-01T00:00:00.000Z'),
    createdAt: new Date('2026-06-01T00:00:01.000Z'),
    updatedAt: new Date('2026-06-01T00:00:01.000Z'),
    ...overrides,
  }
}
