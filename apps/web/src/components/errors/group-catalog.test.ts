/**
 * @fileoverview Unit tests for the error-catalog grouping helper.
 *
 * @layer components/errors
 */
import { describe, expect, it } from 'vitest'

import type { ErrorCatalogEntryView } from '@/lib/api-types'

import { groupCatalog } from './group-catalog.js'

/** Builds a catalog entry fixture, overriding only what a test cares about. */
function entry(overrides: Partial<ErrorCatalogEntryView> = {}): ErrorCatalogEntryView {
  return {
    code: 'ledger.transaction_not_found',
    source: 'app',
    httpStatus: 404,
    availability: 'trigger',
    summary: 'The transaction id is unknown.',
    ...overrides,
  }
}

describe('groupCatalog', () => {
  // scenario: a library code groups under "library" regardless of its code shape.
  it('groups a library code under "library"', () => {
    const groups = groupCatalog([entry({ code: 'AI_TOKENS_STORE_ERROR', source: 'library' })])
    expect(groups).toEqual([
      ['library', [entry({ code: 'AI_TOKENS_STORE_ERROR', source: 'library' })]],
    ])
  })

  // scenario: an app code groups by its dot-namespace prefix.
  it('groups an app code by its dot-namespace prefix', () => {
    const groups = groupCatalog([entry({ code: 'pricing.model_not_found' })])
    expect(groups[0]?.[0]).toBe('pricing')
  })

  // scenario: multiple entries in the same group are preserved in catalog order.
  it('preserves catalog order within a group', () => {
    const first = entry({ code: 'ledger.a' })
    const second = entry({ code: 'ledger.b' })
    const groups = groupCatalog([first, second])
    expect(groups).toEqual([['ledger', [first, second]]])
  })

  // scenario: distinct prefixes produce distinct groups, first-seen order.
  it('produces distinct groups in first-seen order', () => {
    const groups = groupCatalog([
      entry({ code: 'quota.disabled' }),
      entry({ code: 'ledger.transaction_not_found' }),
    ])
    expect(groups.map(([key]) => key)).toEqual(['quota', 'ledger'])
  })

  // scenario: an app code with no non-empty prefix (defensive: a leading-dot code) falls back to "app".
  it('falls back to "app" when the code has no non-empty prefix', () => {
    const groups = groupCatalog([entry({ code: '.leading_dot' })])
    expect(groups[0]?.[0]).toBe('app')
  })

  // scenario: an app code with no dot at all groups under its own full code (no prefix to extract).
  it('groups a dot-free app code under its full code', () => {
    const groups = groupCatalog([entry({ code: 'unknown_code' })])
    expect(groups[0]?.[0]).toBe('unknown_code')
  })
})
