/**
 * Unit tests for the price history query DTO.
 *
 * Layer: unit.
 * Goal: prove the provider requirement, the chat default for the
 * operation, tier optionality, and enum rejections, plus the pipe opt-in.
 * Mocks: none (pure schema).
 */
import { describe, expect, it } from '@jest/globals'

import { PriceHistoryQueryDto, priceHistoryQuerySchema } from './price-history.query.js'

describe('priceHistoryQuerySchema', () => {
  /**
   * Defaults.
   *
   * Provider is the only required key; the operation defaults to chat (the
   * dashboard's primary tuple) and the tier stays absent (= all tiers).
   */
  it('requires the provider and defaults the operation to chat', () => {
    const query = priceHistoryQuerySchema.parse({ provider: 'mock' })

    expect(query).toEqual({ provider: 'mock', operation: 'chat' })
  })

  /**
   * Full parse.
   *
   * Explicit operation and tier pass through validated.
   */
  it('accepts an explicit operation and tier', () => {
    const query = priceHistoryQuerySchema.parse({
      provider: 'openai',
      operation: 'embeddings',
      serviceTier: 'batch',
    })

    expect(query).toEqual({ provider: 'openai', operation: 'embeddings', serviceTier: 'batch' })
  })

  /**
   * Rejections.
   *
   * A missing provider, an empty provider, and unknown enums are 400s.
   */
  it.each([
    ['a missing provider', {}],
    ['an empty provider', { provider: '' }],
    ['an unknown operation', { provider: 'mock', operation: 'telepathy' }],
    ['an unknown tier', { provider: 'mock', serviceTier: 'gold' }],
  ])('rejects %s', (_label, input) => {
    expect(priceHistoryQuerySchema.safeParse(input).success).toBe(false)
  })
})

describe('PriceHistoryQueryDto', () => {
  /**
   * Pipe opt-in.
   *
   * The global ZodValidationPipe recognizes the DTO by its static schema.
   */
  it('exposes the schema for the validation pipe', () => {
    expect(PriceHistoryQueryDto.schema).toBe(priceHistoryQuerySchema)
  })
})
