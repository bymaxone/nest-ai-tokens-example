/**
 * Unit tests for the workspace response glue.
 *
 * Layer: unit.
 * Goal: prove the correlation tags render with their documented prefixes
 * and that the usage view renders bigint money as decimal strings plus
 * the library formatting.
 * Mocks: none.
 */
import { describe, expect, it } from '@jest/globals'

import { batchSizeTag, resourceTag, usageViewOf } from './workspace-usage.js'
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
