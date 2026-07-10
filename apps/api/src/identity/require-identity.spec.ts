/**
 * Unit tests for the identity guard helper.
 *
 * Layer: unit.
 * Goal: prove identity-scoped routes receive the attached identity and
 * anonymous requests are rejected with 401 naming the header (no received
 * values echoed).
 * Mocks: request stubs.
 */
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it } from '@jest/globals'

import { requireIdentity } from './require-identity.js'
import type { AuthenticatedRequest } from './identity.middleware.js'

describe('requireIdentity', () => {
  /**
   * Attached identity.
   *
   * The helper returns exactly what the middleware attached, so handlers
   * never re-derive identity from headers.
   */
  it('returns the attached identity', () => {
    const request = { user: { id: 'ada', tenantId: 'acme' } } as AuthenticatedRequest

    expect(requireIdentity(request)).toEqual({ id: 'ada', tenantId: 'acme' })
  })

  /**
   * Missing identity.
   *
   * Anonymous requests are rejected with 401; the message names the header
   * to send without echoing any received value.
   */
  it('throws 401 when no identity is attached', () => {
    const request = {} as AuthenticatedRequest

    expect(() => requireIdentity(request)).toThrow(UnauthorizedException)
    expect(() => requireIdentity(request)).toThrow(/x-demo-user/)
  })
})
