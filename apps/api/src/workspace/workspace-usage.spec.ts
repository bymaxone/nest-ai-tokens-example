/**
 * Unit tests for the workspace metering glue.
 *
 * Layer: unit.
 * Goal: prove the context builder pins the payer scope, the tenant
 * fallback, the feature label, and the correlation tags (deliberately no
 * idempotency key), and that the usage view renders bigint money as
 * decimal strings plus the library formatting.
 * Mocks: none.
 */
import { describe, expect, it } from '@jest/globals'

import { batchSizeTag, buildMeteringContext, resourceTag, usageViewOf } from './workspace-usage.js'
import { GLOBAL_TENANT_ID } from '../ai/ai-tokens.config.js'
import { recordWith } from '../../test/fixtures/usage-record.fixture.js'

describe('tags', () => {
  /**
   * Tag rendering.
   *
   * The prefixes are the ledger-filterable correlation contract: resource
   * references and batch sizes must render exactly as documented.
   */
  it('renders resource and batch-size tags with their prefixes', () => {
    expect(resourceTag('doc-7')).toBe('resource:doc-7')
    expect(batchSizeTag(5)).toBe('batch-size:5')
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

describe('usageViewOf', () => {
  /**
   * JSON-safe cost projection.
   *
   * bigint nano-USD must cross the HTTP boundary as decimal strings, with
   * the library's display formatting beside them and the token split
   * copied verbatim.
   */
  it('projects tokens and bigint costs into the response view', () => {
    const view = usageViewOf(
      recordWith({
        id: 'txn-9',
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
        rawCostNanoUsd: 6_000n,
        billedCostNanoUsd: 7_500n,
      }),
    )

    expect(view).toEqual({
      transactionId: 'txn-9',
      model: 'mock-chat-pro',
      tokensUsed: { input: 10, output: 4, total: 14 },
      cost: { rawNanoUsd: '6000', billedNanoUsd: '7500', formatted: '$0.000008' },
    })
  })
})
