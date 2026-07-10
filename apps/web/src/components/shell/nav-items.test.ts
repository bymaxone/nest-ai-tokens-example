/**
 * @fileoverview Unit tests for the nav item table and its lookup helper.
 *
 * @layer components/shell
 */
import { describe, expect, it } from 'vitest'

import { NAV_ITEMS, requireNavItem } from './nav-items.js'

describe('NAV_ITEMS', () => {
  // scenario: exactly the eight documented dashboard routes are registered.
  it('registers exactly the eight dashboard routes in order', () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      '/overview',
      '/playground',
      '/ledger',
      '/pricing',
      '/usage',
      '/quota',
      '/tenants',
      '/errors',
    ])
  })
})

describe('requireNavItem', () => {
  // scenario: a registered route resolves to its full entry.
  it('returns the matching entry for a registered route', () => {
    const item = requireNavItem('/ledger')
    expect(item.label).toBe('Ledger')
  })

  // scenario: an unregistered route throws rather than returning undefined silently.
  it('throws for an unregistered route', () => {
    expect(() => requireNavItem('/nope')).toThrow('No nav item registered for route "/nope".')
  })
})
