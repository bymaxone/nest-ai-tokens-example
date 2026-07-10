/**
 * @fileoverview The `MockAiProvider` failure-injection markers
 * (`apps/api/src/ai/failure-markers.ts`, spec §12): a magic token anywhere
 * in a command's input text deterministically routes the mock provider
 * through one documented failure path. The Playground's FailureHelper reads
 * this table to build its picker and to explain what each marker
 * demonstrates.
 *
 * @layer lib
 */

/** One failure-injection marker and the outcome it demonstrates. */
export interface FailureMarker {
  /** The literal token, appended verbatim to a command's input text. */
  readonly token: string
  /** One-line explanation of the failure path the marker triggers. */
  readonly explanation: string
}

/**
 * Every documented `@@fail:*@@` marker, in the api's catalog order (throw
 * markers first, then the degrade markers that still produce billable
 * usage).
 */
export const FAILURE_MARKERS: readonly FailureMarker[] = [
  {
    token: '@@fail:rate_limited@@',
    explanation: 'Throws provider.rate_limited (429). No usage is recorded.',
  },
  {
    token: '@@fail:timeout@@',
    explanation: 'Throws provider.timeout (504). No usage is recorded.',
  },
  {
    token: '@@fail:empty@@',
    explanation: 'Throws provider.empty_response (502). No usage is recorded.',
  },
  {
    token: '@@fail:content_filter@@',
    explanation: 'Throws provider.content_filter (400). No usage is recorded.',
  },
  {
    token: '@@fail:api_key_invalid@@',
    explanation: 'Throws provider.api_key_invalid (401). No usage is recorded.',
  },
  {
    token: '@@fail:unknown@@',
    explanation: 'Throws provider.unknown_error (500). No usage is recorded.',
  },
  {
    token: '@@fail:truncate@@',
    explanation:
      'Returns finish_reason "length"; real tokens were produced, so the call still debits (provider.response_truncated, 502).',
  },
  {
    token: '@@fail:bad_json@@',
    explanation:
      'A JSON-mode response fails to parse; nothing is debited (provider.invalid_json, 502).',
  },
  {
    token: '@@fail:partial_translations@@',
    explanation:
      'A translate response is missing requested languages; the languages that arrived still debit (command.missing_translations, 502).',
  },
] as const
