/**
 * Unit tests for the price update body DTO.
 *
 * Layer: unit.
 * Goal: prove money is accepted only as digit strings (bigint-exact, no
 * float laundering), the at-least-one-rate refinement, unitRates mapping,
 * and enum validation, plus the pipe opt-in.
 * Mocks: none (pure schema).
 */
import { describe, expect, it } from '@jest/globals'

import { UpdatePriceBodyDto, updatePriceBodySchema } from './update-price.body.js'

describe('updatePriceBodySchema', () => {
  /**
   * Digit-string money.
   *
   * Rates arrive as digit strings and parse to exact bigint, including
   * values beyond Number's 2^53 integer range.
   */
  it('parses digit-string rates to exact bigint', () => {
    const body = updatePriceBodySchema.parse({
      provider: 'mock',
      operation: 'chat',
      inputNanoUsdPerMillion: '700000000',
      outputNanoUsdPerMillion: '9007199254740993',
      unitRates: { web_search_requests: '10000000' },
    })

    expect(body.inputNanoUsdPerMillion).toBe(700_000_000n)
    expect(body.outputNanoUsdPerMillion).toBe(9_007_199_254_740_993n)
    expect(body.unitRates).toEqual({ web_search_requests: 10_000_000n })
  })

  /**
   * Money format rejections.
   *
   * JSON numbers (float precision loss), negatives, fractions, and empty
   * strings never reach the store.
   */
  it.each([
    ['a JSON number rate', { inputNanoUsdPerMillion: 700000000 }],
    ['a negative rate', { inputNanoUsdPerMillion: '-1' }],
    ['a fractional rate', { inputNanoUsdPerMillion: '1.5' }],
    ['a non-numeric rate', { inputNanoUsdPerMillion: 'free' }],
    ['an empty-string rate', { inputNanoUsdPerMillion: '' }],
  ])('rejects %s', (_label, rate) => {
    const result = updatePriceBodySchema.safeParse({
      provider: 'mock',
      operation: 'chat',
      ...rate,
    })

    expect(result.success).toBe(false)
  })

  /**
   * At-least-one-rate refinement.
   *
   * The store defaults absent rates to zero, so a rate-free body would
   * silently zero a model's pricing; it must be a 400 instead.
   */
  it('rejects a body without any rate field', () => {
    const result = updatePriceBodySchema.safeParse({ provider: 'mock', operation: 'chat' })

    expect(result.success).toBe(false)
  })

  /**
   * Key and enum validation.
   *
   * Missing provider and unknown operations or tiers are rejected before
   * any store call.
   */
  it.each([
    ['a missing provider', { operation: 'chat', inputNanoUsdPerMillion: '1' }],
    [
      'an unknown operation',
      { provider: 'mock', operation: 'telepathy', inputNanoUsdPerMillion: '1' },
    ],
    [
      'an unknown tier',
      { provider: 'mock', operation: 'chat', serviceTier: 'gold', inputNanoUsdPerMillion: '1' },
    ],
  ])('rejects %s', (_label, input) => {
    expect(updatePriceBodySchema.safeParse(input).success).toBe(false)
  })
})

describe('UpdatePriceBodyDto', () => {
  /**
   * Pipe opt-in.
   *
   * The global ZodValidationPipe recognizes the DTO by its static schema.
   */
  it('exposes the schema for the validation pipe', () => {
    expect(UpdatePriceBodyDto.schema).toBe(updatePriceBodySchema)
  })
})
