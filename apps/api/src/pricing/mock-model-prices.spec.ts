/**
 * Unit tests for the mock model price rows.
 *
 * Layer: unit.
 * Goal: pin the invariants downstream demos rely on: exactly three mock
 * models under the mock provider, rates that match the seeded ledger
 * history's flat demo rates, and a provenance marker distinct from the
 * library snapshot.
 * Mocks: none (pure data).
 */
import { describe, expect, it } from '@jest/globals'

import { MOCK_MODEL_PRICES, MOCK_PRICE_SOURCE } from './mock-model-prices.js'
import { MOCK_PROVIDER_ID } from '../ai/mock-models.js'

describe('MOCK_MODEL_PRICES', () => {
  /**
   * Catalog shape.
   *
   * The demo domain prices exactly three mock models, all under the mock
   * provider with the mock provenance marker (so the boot seed and the
   * pricing endpoints can tell them apart from snapshot rows).
   */
  it('defines the three mock models under the mock provider', () => {
    expect(MOCK_MODEL_PRICES.map((row) => `${row.model}:${row.operation}`)).toEqual([
      'mock-chat-pro:chat',
      'mock-chat-lite:chat',
      'mock-embed:embeddings',
    ])
    expect(MOCK_MODEL_PRICES.every((row) => row.provider === MOCK_PROVIDER_ID)).toBe(true)
    expect(MOCK_MODEL_PRICES.every((row) => row.source === MOCK_PRICE_SOURCE)).toBe(true)
  })

  /**
   * Rate coherence with the seeded ledger history.
   *
   * The flagship chat rates (0.60 / 2.40 USD per million) and the embedding
   * rate (0.10) must equal the flat rates the deterministic seed used to
   * cost historical records, so charts and live calls share one price
   * story.
   */
  it('matches the flat demo rates baked into the seed plan', () => {
    const [pro, lite, embed] = MOCK_MODEL_PRICES

    expect(pro?.inputNanoUsdPerMillion).toBe(600_000_000n)
    expect(pro?.outputNanoUsdPerMillion).toBe(2_400_000_000n)
    expect(lite?.inputNanoUsdPerMillion).toBe(150_000_000n)
    expect(lite?.outputNanoUsdPerMillion).toBe(600_000_000n)
    expect(embed?.inputNanoUsdPerMillion).toBe(100_000_000n)
    expect(embed?.outputNanoUsdPerMillion).toBe(0n)
  })
})
