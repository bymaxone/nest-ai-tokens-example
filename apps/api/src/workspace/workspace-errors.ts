/**
 * @fileoverview The workspace command-outcome error vocabulary. These are
 * HOST codes (the shipped library catalog has no provider/command codes):
 * they describe what the app decided about a provider response, in the
 * same envelope shape as every library error.
 *
 * Billing semantics are load-bearing here (spec §4.3 contract 5):
 * - `provider.response_truncated` and `command.missing_translations` fire
 *   AFTER the usage was recorded — real tokens were produced, so the call
 *   debits what the response reported, and the error carries the
 *   `transactionId` proving it;
 * - `provider.invalid_json` fires INSTEAD of recording — an unparseable
 *   result is worthless, so it never debits and carries no transaction.
 *
 * @layer workspace
 */
import { HttpStatus } from '@nestjs/common'

import { ApiException } from '../common/api-exception.js'

/** Every workspace command-outcome error code. */
export const WORKSPACE_ERROR_CODES = {
  /** The provider cut the response (`finish_reason: 'length'`). */
  RESPONSE_TRUNCATED: 'provider.response_truncated',
  /** A JSON-mode response failed to parse or match its schema. */
  INVALID_JSON: 'provider.invalid_json',
  /** A translate response is missing requested languages. */
  MISSING_TRANSLATIONS: 'command.missing_translations',
} as const

/**
 * The truncation outcome: raised AFTER the debit, carrying the recorded
 * transaction id.
 *
 * @param transactionId The id of the usage record that debited the call.
 * @returns The typed 502 exception.
 */
export function responseTruncatedError(transactionId: string): ApiException {
  return new ApiException(
    WORKSPACE_ERROR_CODES.RESPONSE_TRUNCATED,
    HttpStatus.BAD_GATEWAY,
    'The provider truncated the response; the produced tokens were debited.',
    { transactionId },
  )
}

/**
 * The unparseable-result outcome: raised INSTEAD of recording, so it never
 * carries a transaction id.
 *
 * @returns The typed 502 exception.
 */
export function invalidJsonError(): ApiException {
  return new ApiException(
    WORKSPACE_ERROR_CODES.INVALID_JSON,
    HttpStatus.BAD_GATEWAY,
    'The provider returned unparseable JSON; nothing was debited.',
  )
}

/**
 * The partial-translations outcome: raised AFTER the debit (real tokens
 * were produced for the languages that did arrive).
 *
 * @param missing The requested languages absent from the response.
 * @param transactionId The id of the usage record that debited the call.
 * @returns The typed 502 exception.
 */
export function missingTranslationsError(
  missing: readonly string[],
  transactionId: string,
): ApiException {
  return new ApiException(
    WORKSPACE_ERROR_CODES.MISSING_TRANSLATIONS,
    HttpStatus.BAD_GATEWAY,
    'The provider returned translations for only part of the requested languages.',
    { missing: [...missing], transactionId },
  )
}
