/**
 * Unit tests for the shared ledger correlation tags.
 *
 * Layer: unit.
 * Goal: prove the tag renderers emit the documented, ledger-filterable
 * prefixes exactly (the contract every feature and the list endpoint's
 * `tags` filter share).
 * Mocks: none.
 */
import { describe, expect, it } from '@jest/globals'

import {
  BATCH_SIZE_TAG_PREFIX,
  RESOURCE_TAG_PREFIX,
  batchSizeTag,
  resourceTag,
} from './correlation-tags.js'

describe('correlation tags', () => {
  /**
   * Tag rendering.
   *
   * The prefixes are the ledger-filterable correlation contract: resource
   * references and batch sizes must render exactly as documented.
   */
  it('renders resource and batch-size tags with their prefixes', () => {
    expect(RESOURCE_TAG_PREFIX).toBe('resource:')
    expect(BATCH_SIZE_TAG_PREFIX).toBe('batch-size:')
    expect(resourceTag('doc-7')).toBe('resource:doc-7')
    expect(batchSizeTag(5)).toBe('batch-size:5')
  })
})
