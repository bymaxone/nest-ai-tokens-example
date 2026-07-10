/**
 * Unit tests for the error catalog.
 *
 * Layer: unit.
 * Goal: prove the catalog is exhaustive over the shipped library code
 * union, free of duplicates, honest about availability, and consistent
 * with the trigger registry (every trigger key is a catalog row marked
 * `trigger`).
 * Mocks: none.
 */
import { describe, expect, it } from '@jest/globals'
import { AI_TOKENS_ERROR_CODES } from '@bymax-one/nest-ai-tokens'

import { ERROR_CATALOG, ERROR_CATALOG_BY_CODE } from './error-catalog.js'
import { TRIGGERS } from './trigger-registry.js'

describe('ERROR_CATALOG', () => {
  /**
   * Library exhaustiveness.
   *
   * Every code of the shipped `AI_TOKENS_ERROR_CODES` union must appear as
   * a `library` row exactly once: the catalog is the app's honest mirror
   * of the real error surface, not a drafted list.
   */
  it('covers every shipped library code exactly once', () => {
    const libraryRows = ERROR_CATALOG.filter((entry) => entry.source === 'library')
    const shipped = Object.keys(AI_TOKENS_ERROR_CODES).sort()

    expect(libraryRows.map((entry) => entry.code).sort()).toEqual(shipped)
  })

  /**
   * No duplicate codes.
   *
   * A code appearing twice would make the lookup map silently drop a row.
   */
  it('has unique codes and a matching lookup map', () => {
    const codes = ERROR_CATALOG.map((entry) => entry.code)

    expect(new Set(codes).size).toBe(codes.length)
    expect(ERROR_CATALOG_BY_CODE.size).toBe(codes.length)
    for (const entry of ERROR_CATALOG) {
      expect(ERROR_CATALOG_BY_CODE.get(entry.code)).toBe(entry)
    }
  })

  /**
   * Registry consistency.
   *
   * Every trigger key must be a catalog row whose availability is
   * `trigger`: the registry can never raise a code the catalog does not
   * document as on-demand.
   */
  it('marks every registry trigger as trigger-available', () => {
    for (const code of Object.keys(TRIGGERS)) {
      expect(ERROR_CATALOG_BY_CODE.get(code)?.availability).toBe('trigger')
    }
  })

  /**
   * Honest reservations.
   *
   * `AI_TOKENS_NOT_CONFIGURED` is defined by the shipped catalog but never
   * raised by v0.1.0; the catalog must say so instead of faking a trigger.
   */
  it('documents AI_TOKENS_NOT_CONFIGURED as reserved', () => {
    expect(ERROR_CATALOG_BY_CODE.get('AI_TOKENS_NOT_CONFIGURED')?.availability).toBe('reserved')
  })

  /**
   * Documented statuses stay canonical.
   *
   * Spot-pin the library statuses the e2e also asserts end to end, so a
   * silent catalog edit cannot drift from the library's status map.
   */
  it('pins the canonical library statuses', () => {
    const statusOf = (code: string): number | undefined =>
      ERROR_CATALOG_BY_CODE.get(code)?.httpStatus

    expect(statusOf('AI_TOKENS_BUDGET_EXCEEDED')).toBe(402)
    expect(statusOf('AI_TOKENS_QUOTA_EXCEEDED')).toBe(429)
    expect(statusOf('AI_TOKENS_INSUFFICIENT_CREDITS')).toBe(402)
    expect(statusOf('AI_TOKENS_HOLD_NOT_FOUND')).toBe(404)
    expect(statusOf('AI_TOKENS_HOLD_EXPIRED')).toBe(410)
    expect(statusOf('AI_TOKENS_HOLD_ALREADY_SETTLED')).toBe(409)
    expect(statusOf('AI_TOKENS_IDEMPOTENCY_CONFLICT')).toBe(409)
    expect(statusOf('AI_TOKENS_STORE_ERROR')).toBe(502)
  })
})
