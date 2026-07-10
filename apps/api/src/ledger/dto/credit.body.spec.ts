/**
 * Unit tests for the credit body DTO.
 *
 * Layer: unit.
 * Goal: prove the money path is strict: positive integer nano-USD decimal
 * strings become bigint (never Number); zero, negatives, decimals,
 * exponents, leading zeros, oversized widths, and non-numerics are all
 * rejected; the type enum and optional fields validate their bounds.
 * Mocks: none (schema only).
 */
import { describe, expect, it } from '@jest/globals'

import { creditBodySchema } from './credit.body.js'

describe('creditBodySchema', () => {
  /**
   * Happy path with the bigint transform.
   *
   * A digit-only positive amount becomes bigint and the optional fields
   * survive verbatim.
   */
  it('parses a full credit and transforms the amount to bigint', () => {
    const parsed = creditBodySchema.parse({
      amountNanoUsd: '2500000000',
      type: 'purchase',
      description: 'demo top-up',
      idempotencyKey: 'webhook-evt-001',
    })

    expect(parsed.amountNanoUsd).toBe(2_500_000_000n)
    expect(parsed.type).toBe('purchase')
    expect(parsed.description).toBe('demo top-up')
    expect(parsed.idempotencyKey).toBe('webhook-evt-001')
  })

  /**
   * Strict amount rejections (rows 22-23 money-path hardening).
   *
   * Zero, negative, decimal, exponent, leading-zero, oversized, and
   * non-numeric amounts never reach the wallet: each fails the pattern.
   */
  it('rejects zero, negative, fractional, oversized, and malformed amounts', () => {
    for (const bad of ['0', '-1', '+1', '1.5', '1e9', '01', '', 'abc', '9'.repeat(16)]) {
      const result = creditBodySchema.safeParse({ amountNanoUsd: bad, type: 'purchase' })
      expect(result.success).toBe(false)
    }
  })

  /**
   * Type whitelist.
   *
   * Only the three seeded credit kinds are recordable; `refund` (a
   * different flow) and arbitrary strings are rejected.
   */
  it('accepts only the three credit types', () => {
    for (const type of ['purchase', 'monthly_allocation', 'trial_allocation']) {
      expect(creditBodySchema.safeParse({ amountNanoUsd: '1', type }).success).toBe(true)
    }
    expect(creditBodySchema.safeParse({ amountNanoUsd: '1', type: 'refund' }).success).toBe(false)
  })

  /**
   * Optional field bounds.
   *
   * Empty descriptions and too-short idempotency keys are rejected (a
   * short key defeats its collision-resistance purpose).
   */
  it('bounds the optional description and idempotency key', () => {
    expect(
      creditBodySchema.safeParse({ amountNanoUsd: '1', type: 'purchase', description: '' }).success,
    ).toBe(false)
    expect(
      creditBodySchema.safeParse({ amountNanoUsd: '1', type: 'purchase', idempotencyKey: 'x' })
        .success,
    ).toBe(false)
  })
})
