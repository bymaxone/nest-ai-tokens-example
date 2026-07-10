/**
 * Unit tests for the shared identity-to-context builder.
 *
 * Layer: unit.
 * Goal: prove the context builder pins the payer scope, the tenant
 * fallback, the feature label, and the correlation tags (deliberately no
 * idempotency key), and that the tenant accessor mirrors the module
 * scopeResolver's global-tenant mapping.
 * Mocks: none.
 */
import { describe, expect, it } from '@jest/globals'

import { GLOBAL_TENANT_ID } from './ai-tokens.config.js'
import { buildMeteringContext, tenantIdOf } from './metering-context.js'

describe('tenantIdOf', () => {
  /**
   * Tenant passthrough and fallback.
   *
   * A tenant-scoped identity keeps its tenant; a null-tenant identity maps
   * to the global tenant, mirroring the scopeResolver exactly so every
   * library call and read filter agree on the tenant.
   */
  it('returns the identity tenant or the global fallback', () => {
    expect(tenantIdOf({ id: 'ada', tenantId: 'acme' })).toBe('acme')
    expect(tenantIdOf({ id: 'root', tenantId: null })).toBe(GLOBAL_TENANT_ID)
  })
})

describe('buildMeteringContext', () => {
  /**
   * Payer scope and correlation.
   *
   * The context pins the caller as the user-scoped payer, carries the
   * feature and tags, and MUST NOT set an idempotency key: repeated
   * identical calls are distinct work and each must append its own row.
   */
  it('pins scope, feature, and tags without an idempotency key', () => {
    const context = buildMeteringContext({ id: 'ada', tenantId: 'acme' }, 'workspace.translate', [
      'resource:doc-1',
    ])

    expect(context).toEqual({
      tenantId: 'acme',
      scope: { type: 'user', id: 'ada' },
      feature: 'workspace.translate',
      tags: ['resource:doc-1'],
    })
    expect(context.idempotencyKey).toBeUndefined()
  })

  /**
   * Global-tenant fallback.
   *
   * Null-tenant identities meter under the global tenant, mirroring the
   * module scopeResolver's mapping exactly.
   */
  it('falls back to the global tenant for null-tenant identities', () => {
    const context = buildMeteringContext({ id: 'root', tenantId: null }, 'workspace.custom', [])

    expect(context.tenantId).toBe(GLOBAL_TENANT_ID)
  })
})
