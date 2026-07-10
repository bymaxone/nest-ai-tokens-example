/**
 * Unit tests for the strict-tenancy rejection.
 *
 * Layer: unit.
 * Goal: pin the canonical `tenant.required` envelope (code, 403 status,
 * value-free message) that the identity middleware and the module
 * scopeResolver both raise.
 * Mocks: none.
 */
import { describe, expect, it } from '@jest/globals'

import { TENANT_REQUIRED_ERROR_CODE, tenantRequiredError } from './tenant-policy.js'
import { ApiException } from '../common/api-exception.js'
import type { ApiErrorResponse } from '../common/api-exception.js'

describe('tenantRequiredError', () => {
  /**
   * Canonical envelope shape.
   *
   * The rejection must be the one documented error for strict tenancy:
   * `tenant.required`, HTTP 403, the `{ error: { code, message } }`
   * envelope, and a message that names the knob without echoing any
   * request content.
   */
  it('builds the canonical tenant.required 403 envelope', () => {
    const error = tenantRequiredError()

    expect(error).toBeInstanceOf(ApiException)
    expect(error.code).toBe(TENANT_REQUIRED_ERROR_CODE)
    expect(error.getStatus()).toBe(403)
    const body = error.getResponse() as ApiErrorResponse
    expect(body.error.code).toBe('tenant.required')
    expect(body.error.message).toContain('TENANT_REQUIRED')
  })
})
