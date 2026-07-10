/**
 * Unit tests for the workspace error vocabulary.
 *
 * Layer: unit.
 * Goal: pin each outcome's code, HTTP status, and billing evidence: the
 * debited outcomes carry the transaction id, the not-debited outcome
 * carries none.
 * Mocks: none.
 */
import { describe, expect, it } from '@jest/globals'

import {
  WORKSPACE_ERROR_CODES,
  invalidJsonError,
  missingTranslationsError,
  responseTruncatedError,
} from './workspace-errors.js'

describe('workspace errors', () => {
  /**
   * Truncation outcome (debited).
   *
   * 502 provider.response_truncated carrying the transaction id of the
   * record that debited the produced tokens.
   */
  it('responseTruncatedError is a 502 carrying the transaction id', () => {
    const error = responseTruncatedError('txn-1')

    expect(error.getStatus()).toBe(502)
    expect(error.code).toBe(WORKSPACE_ERROR_CODES.RESPONSE_TRUNCATED)
    expect(error.getResponse()).toMatchObject({ error: { details: { transactionId: 'txn-1' } } })
  })

  /**
   * Invalid-JSON outcome (NOT debited).
   *
   * 502 provider.invalid_json with NO details: there is no transaction to
   * reference because nothing was recorded (contract 5).
   */
  it('invalidJsonError is a 502 without a transaction reference', () => {
    const error = invalidJsonError()

    expect(error.getStatus()).toBe(502)
    expect(error.code).toBe(WORKSPACE_ERROR_CODES.INVALID_JSON)
    expect(error.getResponse()).toEqual({
      error: {
        code: 'provider.invalid_json',
        message: 'The provider returned unparseable JSON; nothing was debited.',
      },
    })
  })

  /**
   * Partial-translations outcome (debited).
   *
   * 502 command.missing_translations naming the absent languages and the
   * debiting transaction.
   */
  it('missingTranslationsError names the missing languages and the debit', () => {
    const error = missingTranslationsError(['es'], 'txn-2')

    expect(error.getStatus()).toBe(502)
    expect(error.code).toBe(WORKSPACE_ERROR_CODES.MISSING_TRANSLATIONS)
    expect(error.getResponse()).toMatchObject({
      error: { details: { missing: ['es'], transactionId: 'txn-2' } },
    })
  })
})
