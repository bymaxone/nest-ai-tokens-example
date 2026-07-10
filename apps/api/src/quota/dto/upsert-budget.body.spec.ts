/**
 * Unit tests for the budget upsert body DTO.
 *
 * Layer: unit.
 * Goal: prove the money path is strict (digit-only decimal string ->
 * bigint, no sign, no decimals, bounded width), zero is a legal hard
 * block, at least one limit dimension is required, and the enum/bounds
 * validation rejects out-of-range values before any service code runs.
 * Mocks: none (schema only).
 */
import { describe, expect, it } from '@jest/globals'

import { MAX_LIMIT_COUNT, MAX_LIMIT_TOKENS, upsertBudgetBodySchema } from './upsert-budget.body.js'

describe('upsertBudgetBodySchema', () => {
  /**
   * Full happy path with the bigint money transform.
   *
   * A digit-only nano-USD string becomes a bigint (never a Number), and
   * every optional field survives verbatim.
   */
  it('parses a full definition and transforms the money limit to bigint', () => {
    const parsed = upsertBudgetBodySchema.parse({
      scopeType: 'user',
      scopeId: 'ada',
      limitNanoUsd: '5000000000',
      limitTokens: 10_000,
      limitCount: 5,
      window: 'day',
      policy: 'block',
      features: ['workspace.custom'],
    })

    expect(parsed.limitNanoUsd).toBe(5_000_000_000n)
    expect(parsed).toMatchObject({
      scopeType: 'user',
      scopeId: 'ada',
      limitTokens: 10_000,
      limitCount: 5,
      window: 'day',
      policy: 'block',
      features: ['workspace.custom'],
    })
  })

  /**
   * Zero is a legal hard block.
   *
   * The library's normative rule: a PRESENT limit of 0 blocks everything;
   * only absence means unlimited. The DTO must not confuse the two.
   */
  it('accepts a zero limit (the documented hard block)', () => {
    const parsed = upsertBudgetBodySchema.parse({
      scopeType: 'tenant',
      scopeId: 'acme',
      limitNanoUsd: '0',
    })

    expect(parsed.limitNanoUsd).toBe(0n)
    expect(parsed.window).toBe('month')
  })

  /**
   * Strict money-string rejections.
   *
   * Signs, decimals, exponents, empty strings, non-digits, and widths
   * beyond 15 digits are all rejected by the pattern: nothing that could
   * surprise BigInt (or overflow the sane cap) reaches the library.
   */
  it('rejects malformed nano-USD strings', () => {
    for (const bad of ['-5', '+5', '1.5', '1e9', '', 'abc', '9'.repeat(16)]) {
      const result = upsertBudgetBodySchema.safeParse({
        scopeType: 'user',
        scopeId: 'ada',
        limitNanoUsd: bad,
      })
      expect(result.success).toBe(false)
    }
  })

  /**
   * At-least-one-limit refinement.
   *
   * A budget without any limit dimension is meaningless; the DTO rejects
   * it before the library's own validation would.
   */
  it('rejects a definition with no limit dimension', () => {
    const result = upsertBudgetBodySchema.safeParse({ scopeType: 'user', scopeId: 'ada' })

    expect(result.success).toBe(false)
  })

  /**
   * Numeric bounds and enum whitelists.
   *
   * Negative or over-cap token/count limits, unknown windows, policies,
   * and scope types are rejected.
   */
  it('rejects out-of-range numerics and unknown enums', () => {
    const base = { scopeType: 'user', scopeId: 'ada', limitTokens: 1 }
    expect(upsertBudgetBodySchema.safeParse({ ...base, limitTokens: -1 }).success).toBe(false)
    expect(
      upsertBudgetBodySchema.safeParse({ ...base, limitTokens: MAX_LIMIT_TOKENS + 1 }).success,
    ).toBe(false)
    expect(
      upsertBudgetBodySchema.safeParse({ ...base, limitCount: MAX_LIMIT_COUNT + 1 }).success,
    ).toBe(false)
    expect(upsertBudgetBodySchema.safeParse({ ...base, window: 'year' }).success).toBe(false)
    expect(upsertBudgetBodySchema.safeParse({ ...base, policy: 'warn' }).success).toBe(false)
    expect(upsertBudgetBodySchema.safeParse({ ...base, scopeType: 'key' }).success).toBe(false)
    expect(upsertBudgetBodySchema.safeParse({ ...base, features: [] }).success).toBe(false)
  })
})
