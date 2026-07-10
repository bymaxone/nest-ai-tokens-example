/**
 * Unit tests for the mock inference catalog.
 *
 * Layer: unit.
 * Goal: pin the provider/model identifiers the pricing seed, the provider,
 * and the workspace DTOs all share, so an accidental rename surfaces here
 * instead of as a strict-pricing rate miss at runtime.
 * Mocks: none; the catalog is constant data.
 */
import { describe, expect, it } from '@jest/globals'

import {
  DEFAULT_CHAT_MODEL,
  MOCK_CHAT_LITE,
  MOCK_CHAT_MODELS,
  MOCK_CHAT_PRO,
  MOCK_EMBEDDING_MODEL,
  MOCK_PROVIDER_ID,
} from './mock-models.js'
import { MOCK_MODEL_PRICES } from '../pricing/mock-model-prices.js'

describe('mock model catalog', () => {
  /**
   * Identifier pinning.
   *
   * The exact ids are load-bearing: they are the price-resolution keys of
   * the seeded rate rows and the values the workspace DTOs accept.
   */
  it('pins the provider and model identifiers', () => {
    expect(MOCK_PROVIDER_ID).toBe('mock')
    expect(MOCK_CHAT_MODELS).toEqual(['mock-chat-pro', 'mock-chat-lite'])
    expect(DEFAULT_CHAT_MODEL).toBe(MOCK_CHAT_PRO)
    expect(MOCK_EMBEDDING_MODEL).toBe('mock-embed')
  })

  /**
   * Catalog/seed coherence.
   *
   * Every cataloged model must have a seeded price row (strict pricing
   * would 500 a call to an unpriced model), and vice versa.
   */
  it('matches the seeded price rows one to one', () => {
    const seeded = MOCK_MODEL_PRICES.map((row) => row.model)

    expect(seeded).toEqual([MOCK_CHAT_PRO, MOCK_CHAT_LITE, MOCK_EMBEDDING_MODEL])
    expect(MOCK_MODEL_PRICES.every((row) => row.provider === MOCK_PROVIDER_ID)).toBe(true)
  })
})
