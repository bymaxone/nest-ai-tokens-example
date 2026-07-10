/**
 * Unit tests for the refund body DTO.
 *
 * Layer: unit.
 * Goal: prove the refund targets an id within bounds and never carries an
 * amount (the server derives everything from the original record), with
 * the optional reason bounded.
 * Mocks: none (schema only).
 */
import { describe, expect, it } from '@jest/globals'

import { refundBodySchema } from './refund.body.js'

describe('refundBodySchema', () => {
  /**
   * Happy path.
   *
   * The id and optional reason parse verbatim; there is no amount field
   * for a client to manipulate.
   */
  it('parses the transaction id and optional reason', () => {
    expect(refundBodySchema.parse({ transactionId: 'txn-1' })).toEqual({
      transactionId: 'txn-1',
    })
    expect(refundBodySchema.parse({ transactionId: 'txn-1', reason: 'duplicate charge' })).toEqual({
      transactionId: 'txn-1',
      reason: 'duplicate charge',
    })
  })

  /**
   * Bounds.
   *
   * Empty and oversized ids/reasons are rejected before any lookup.
   */
  it('rejects empty and oversized fields', () => {
    expect(refundBodySchema.safeParse({ transactionId: '' }).success).toBe(false)
    expect(refundBodySchema.safeParse({ transactionId: 'x'.repeat(65) }).success).toBe(false)
    expect(
      refundBodySchema.safeParse({ transactionId: 'txn-1', reason: 'x'.repeat(501) }).success,
    ).toBe(false)
  })
})
