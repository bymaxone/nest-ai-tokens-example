/**
 * Unit tests for the workspace spend-hold estimators.
 *
 * Layer: unit.
 * Goal: prove the estimators are pure functions of their inputs (identical
 * inputs, identical outputs; no clock, request, or store access), that the
 * token math mirrors the mock provider's ceil(chars / 4) rule, and that the
 * QUOTA_TOLERANCE scaling rounds UP at the documented boundary so a
 * fractional product never under-reserves.
 * Mocks: none (pure functions).
 */
import { describe, expect, it } from '@jest/globals'

import {
  CHARS_PER_TOKEN,
  chatHoldEstimate,
  embeddingHoldEstimate,
  estimateBatchTokens,
  estimateTextTokens,
  estimateTranslateTokens,
  withTolerance,
} from './workspace-estimators.js'

describe('estimateTextTokens', () => {
  /**
   * Body-size rule.
   *
   * The estimate is ceil(chars / 4), mirroring the mock provider's token
   * math, so an 8-char text costs 2 tokens and a 9-char text costs 3.
   */
  it('applies the ceil(chars / 4) rule', () => {
    expect(CHARS_PER_TOKEN).toBe(4)
    expect(estimateTextTokens('12345678')).toBe(2)
    expect(estimateTextTokens('123456789')).toBe(3)
  })

  /**
   * Empty-input floor edge case.
   *
   * An empty text still reserves one token (the mock charges at least one
   * prompt token), so a hold is never sized zero by an empty string.
   */
  it('never estimates below one token', () => {
    expect(estimateTextTokens('')).toBe(1)
  })

  /**
   * Purity invariant.
   *
   * The same input always yields the same output: the estimator reads no
   * clock, request, or store, so enforcement decisions are reproducible.
   */
  it('is deterministic for identical inputs', () => {
    const first = estimateTextTokens('deterministic input')
    const second = estimateTextTokens('deterministic input')

    expect(first).toBe(second)
  })
})

describe('estimateTranslateTokens', () => {
  /**
   * Per-language scaling.
   *
   * Each target language produces its own output, so the text estimate
   * multiplies by the language count (3 tokens x 2 languages = 6).
   */
  it('scales the text estimate by the target-language count', () => {
    expect(estimateTranslateTokens('Hello world', 2)).toBe(6)
  })

  /**
   * Zero-language floor edge case.
   *
   * A non-positive language count clamps to one so the estimate never
   * collapses to zero (the DTO enforces >= 1 upstream; this is the pure
   * function's own guard).
   */
  it('clamps the language count to at least one', () => {
    expect(estimateTranslateTokens('Hello world', 0)).toBe(3)
  })
})

describe('estimateBatchTokens', () => {
  /**
   * Batch aggregation.
   *
   * The batch is ONE provider call, so the estimate is the sum of the
   * per-text estimates (2 + 1 + 3 here), not a per-call flat rate.
   */
  it('sums the per-text estimates', () => {
    expect(estimateBatchTokens(['12345', 'a', '123456789'])).toBe(6)
  })

  /**
   * Empty-batch edge case.
   *
   * No texts, no tokens: the sum of an empty batch is zero (the DTO
   * rejects empty batches upstream).
   */
  it('returns zero for an empty batch', () => {
    expect(estimateBatchTokens([])).toBe(0)
  })
})

describe('withTolerance', () => {
  /**
   * Exact-multiple boundary (matrix row 65 reconciled host-side).
   *
   * At tolerance 1.2 an even 1000-token estimate scales to exactly 1200:
   * no rounding artifact inflates an exact product.
   */
  it('keeps an exact product unrounded', () => {
    expect(withTolerance(1000, 1.2)).toBe(1200)
  })

  /**
   * Fractional boundary rounds UP.
   *
   * One token more (1001 x 1.2 = 1201.2) must reserve 1202: rounding down
   * would under-reserve and let a capture exceed the checked headroom.
   */
  it('rounds a fractional product up, never down', () => {
    expect(withTolerance(1001, 1.2)).toBe(1202)
  })

  /**
   * Neutral tolerance passthrough.
   *
   * Tolerance 1 leaves the estimate untouched (the disabled-headroom
   * configuration).
   */
  it('is the identity at tolerance 1', () => {
    expect(withTolerance(777, 1)).toBe(777)
  })
})

describe('chatHoldEstimate', () => {
  /**
   * Rated chat estimate shape.
   *
   * The estimate names the mock provider, the requested model, and the
   * chat operation, with the scaled tokens applied symmetrically to input
   * and output headroom (the mock's canned output grows with the input).
   */
  it('builds the rated estimate with symmetric scaled tokens', () => {
    expect(chatHoldEstimate('mock-chat-lite', 100, 1.2)).toEqual({
      provider: 'mock',
      model: 'mock-chat-lite',
      operation: 'chat',
      inputTokens: 120,
      maxOutputTokens: 120,
    })
  })
})

describe('embeddingHoldEstimate', () => {
  /**
   * Rated embedding estimate shape.
   *
   * Embeddings bill prompt tokens only, so output headroom is zero while
   * the input carries the scaled estimate.
   */
  it('builds the rated estimate with zero output tokens', () => {
    expect(embeddingHoldEstimate('mock-embed', 50, 1.2)).toEqual({
      provider: 'mock',
      model: 'mock-embed',
      operation: 'embeddings',
      inputTokens: 60,
      maxOutputTokens: 0,
    })
  })
})
