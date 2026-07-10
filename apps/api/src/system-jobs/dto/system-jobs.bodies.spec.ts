/**
 * Unit tests for the system-jobs body DTOs.
 *
 * Layer: unit.
 * Goal: prove the reindex count bounds and default, the slug shape of the
 * tag-bound fields, the confidence range, and the reasoning bounds.
 * Mocks: none (schemas only).
 */
import { describe, expect, it } from '@jest/globals'

import {
  DEFAULT_REINDEX_COUNT,
  MAX_REINDEX_COUNT,
  agentDecisionBodySchema,
  reindexBodySchema,
} from './system-jobs.bodies.js'

describe('reindexBodySchema', () => {
  /**
   * Count bounds and default.
   *
   * An empty body embeds the default corpus slice; zero, negative,
   * fractional, and over-cap counts are rejected.
   */
  it('bounds the count with the documented default', () => {
    expect(reindexBodySchema.parse({}).count).toBe(DEFAULT_REINDEX_COUNT)
    expect(reindexBodySchema.parse({ count: MAX_REINDEX_COUNT }).count).toBe(MAX_REINDEX_COUNT)
    for (const count of [0, -1, 2.5, MAX_REINDEX_COUNT + 1]) {
      expect(reindexBodySchema.safeParse({ count }).success).toBe(false)
    }
  })
})

describe('agentDecisionBodySchema', () => {
  /** A fully valid descriptor reused across the rejection cases. */
  const valid = {
    decisionId: 'dec-001',
    strategy: 'rebalance.v2',
    confidence: 0.85,
    reasoning: 'portfolio drift beyond threshold',
  }

  /**
   * Happy path.
   *
   * Slug-shaped ids/strategies, an in-range confidence, and bounded
   * reasoning parse verbatim.
   */
  it('parses a full descriptor', () => {
    expect(agentDecisionBodySchema.parse(valid)).toEqual(valid)
  })

  /**
   * Tag-safety and range gates.
   *
   * Ids/strategies that could not travel as ledger tags (spaces, colons,
   * emptiness, oversize), out-of-range confidences, and unbounded
   * reasoning are all rejected.
   */
  it('rejects tag-unsafe fields, out-of-range confidence, and unbounded reasoning', () => {
    expect(agentDecisionBodySchema.safeParse({ ...valid, decisionId: 'has space' }).success).toBe(
      false,
    )
    expect(agentDecisionBodySchema.safeParse({ ...valid, strategy: 'a:b' }).success).toBe(false)
    expect(agentDecisionBodySchema.safeParse({ ...valid, strategy: 'x'.repeat(65) }).success).toBe(
      false,
    )
    expect(agentDecisionBodySchema.safeParse({ ...valid, confidence: 1.5 }).success).toBe(false)
    expect(agentDecisionBodySchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false)
    expect(agentDecisionBodySchema.safeParse({ ...valid, reasoning: '' }).success).toBe(false)
    expect(
      agentDecisionBodySchema.safeParse({ ...valid, reasoning: 'x'.repeat(2001) }).success,
    ).toBe(false)
  })
})
