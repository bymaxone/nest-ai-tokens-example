/**
 * Unit tests for the demo user registry.
 *
 * Layer: unit.
 * Goal: prove the registry mirrors the seeded demo domain plus the global
 * admin, and that lookups behave for hits and misses.
 * Mocks: none; the registry is static data.
 */
import { describe, expect, it } from '@jest/globals'

import { DEMO_USERS, DEMO_USER_IDS, findDemoUser } from './demo-users.js'

describe('DEMO_USERS', () => {
  /**
   * Registry contract.
   *
   * The registry must match the phase-seeded users (ada/grace at acme,
   * linus at globex) plus the spec's global null-tenant admin (root), since
   * ledger flows and charts assert against exactly these identities.
   */
  it('contains the seeded users and the global admin', () => {
    expect(DEMO_USERS).toEqual([
      { id: 'ada', tenantId: 'acme' },
      { id: 'grace', tenantId: 'acme' },
      { id: 'linus', tenantId: 'globex' },
      { id: 'root', tenantId: null },
    ])
  })

  /**
   * Derived id list.
   *
   * DEMO_USER_IDS feeds the value-free 401 body; it must stay in sync with
   * the registry.
   */
  it('exposes the ids in registry order', () => {
    expect(DEMO_USER_IDS).toEqual(['ada', 'grace', 'linus', 'root'])
  })
})

describe('findDemoUser', () => {
  /**
   * Lookup hit.
   *
   * A registered id resolves to its full record, including the default
   * tenant the middleware falls back to.
   */
  it('returns the registered user for a known id', () => {
    expect(findDemoUser('linus')).toEqual({ id: 'linus', tenantId: 'globex' })
  })

  /**
   * Lookup miss.
   *
   * Unknown ids return undefined so the middleware can reject with 401.
   */
  it('returns undefined for an unknown id', () => {
    expect(findDemoUser('mallory')).toBeUndefined()
  })
})
