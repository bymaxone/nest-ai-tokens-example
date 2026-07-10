/**
 * Unit tests for the ledger list query DTO.
 *
 * Layer: unit.
 * Goal: prove the schema's defaults, coercions, comma-separated lists,
 * bounded pagination, and the date-window refinement, plus the pipe opt-in
 * (static schema on the class).
 * Mocks: none (pure schema).
 */
import { describe, expect, it } from '@jest/globals'

import {
  DEFAULT_PAGE_SIZE,
  ListTransactionsQueryDto,
  MAX_PAGE_SIZE,
  listTransactionsQuerySchema,
} from './list-transactions.query.js'

describe('listTransactionsQuerySchema', () => {
  /**
   * Defaults.
   *
   * An empty query is valid and yields the bounded default page (never an
   * unbounded listing).
   */
  it('applies bounded pagination defaults to an empty query', () => {
    const query = listTransactionsQuerySchema.parse({})

    expect(query).toEqual({ limit: DEFAULT_PAGE_SIZE, offset: 0 })
  })

  /**
   * Full parse with coercions.
   *
   * Query strings arrive as strings: numbers coerce, dates coerce from ISO,
   * stringbool handles the flag, and comma-separated lists split into
   * validated arrays.
   */
  it('parses and coerces every filter field', () => {
    const query = listTransactionsQuerySchema.parse({
      feature: 'demo.chat',
      features: 'demo.chat, demo.embeddings',
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      serviceTier: 'standard',
      status: 'posted,reversed',
      isSystemCost: 'false',
      systemCostCategory: 'reindex',
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-06-01T00:00:00.000Z',
      limit: '50',
      offset: '10',
    })

    expect(query.features).toEqual(['demo.chat', 'demo.embeddings'])
    expect(query.status).toEqual(['posted', 'reversed'])
    expect(query.isSystemCost).toBe(false)
    expect(query.from).toEqual(new Date('2026-05-01T00:00:00.000Z'))
    expect(query.to).toEqual(new Date('2026-06-01T00:00:00.000Z'))
    expect(query.limit).toBe(50)
    expect(query.offset).toBe(10)
  })

  /**
   * Pagination bounds.
   *
   * Zero, oversized, fractional, and negative page parameters are rejected
   * so no request can force an unbounded or nonsensical page.
   */
  it.each([
    ['a zero limit', { limit: '0' }],
    ['an oversized limit', { limit: String(MAX_PAGE_SIZE + 1) }],
    ['a fractional limit', { limit: '2.5' }],
    ['a negative offset', { offset: '-1' }],
  ])('rejects %s', (_label, input) => {
    expect(listTransactionsQuerySchema.safeParse(input).success).toBe(false)
  })

  /**
   * Enum and list validation.
   *
   * Unknown operations and unknown statuses inside a comma list are
   * rejected; an all-empty comma list is rejected rather than silently
   * matching nothing.
   */
  it.each([
    ['an unknown operation', { operation: 'telepathy' }],
    ['an unknown status inside a list', { status: 'posted,unknown' }],
    ['an empty status list', { status: ' , ' }],
  ])('rejects %s', (_label, input) => {
    expect(listTransactionsQuerySchema.safeParse(input).success).toBe(false)
  })

  /**
   * Date-window refinement.
   *
   * An inverted window (from after to) is a client error, not an empty
   * result.
   */
  it('rejects an inverted date window', () => {
    const result = listTransactionsQuerySchema.safeParse({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-05-01T00:00:00.000Z',
    })

    expect(result.success).toBe(false)
  })

  /**
   * Malformed dates.
   *
   * A non-date `from` fails coercion instead of producing an Invalid Date
   * filter.
   */
  it('rejects a malformed date', () => {
    expect(listTransactionsQuerySchema.safeParse({ from: 'not-a-date' }).success).toBe(false)
  })
})

describe('ListTransactionsQueryDto', () => {
  /**
   * Pipe opt-in.
   *
   * The global ZodValidationPipe recognizes DTOs by their static schema;
   * the class must expose exactly the schema above.
   */
  it('exposes the schema for the validation pipe', () => {
    expect(ListTransactionsQueryDto.schema).toBe(listTransactionsQuerySchema)
  })
})
