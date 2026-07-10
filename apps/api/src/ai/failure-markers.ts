/**
 * @fileoverview The deterministic failure-injection marker engine. A magic
 * marker embedded in request text (`@@fail:<name>@@`) makes the mock
 * inference layer produce the corresponding failure on demand: thrown
 * provider errors (rate limit, timeout, ...) or degraded-but-usable
 * responses (truncation, unparseable JSON, missing translations). This is
 * how every `provider.*` and `command.*` error path is reachable without a
 * real outage, a real key, or any network call.
 *
 * The `@@fail:...@@` prefix convention is deliberately implausible as user
 * text (double at-signs on both sides of a reserved word), so ordinary
 * demo prompts can never trigger a failure accidentally. Markers are
 * DEMO-ONLY sugar: a real consumer deletes this file along with the mock.
 *
 * Markers are stripped from the text before token math so the marker
 * characters themselves never count toward tokens or cost.
 *
 * @layer ai
 */

/** The reserved marker prefix (demo-only convention; see file overview). */
export const FAILURE_MARKER_PREFIX = '@@fail:'

/** A marker that makes the provider throw before producing any usage. */
export interface ThrowMarkerBehavior {
  readonly kind: 'throw'
  /** The dot-namespaced provider error code. */
  readonly code: string
  /** The HTTP status the error surfaces with. */
  readonly httpStatus: number
  /** The human-readable message (never echoes request text). */
  readonly message: string
}

/** The degraded-response modes (chat-only; embeddings ignore them). */
export type DegradeMode = 'truncate' | 'bad_json' | 'partial_translations'

/** A marker that degrades the response while keeping valid usage. */
export interface DegradeMarkerBehavior {
  readonly kind: 'degrade'
  readonly mode: DegradeMode
}

/** What a detected marker makes the provider do. */
export type MarkerBehavior = ThrowMarkerBehavior | DegradeMarkerBehavior

/**
 * Every failure marker and its behavior. Throw kinds abort the call before
 * any usage exists (no ledger row can result); degrade kinds return a
 * response with REAL usage so downstream layers still meter it.
 */
export const FAILURE_MARKERS: Readonly<Record<string, MarkerBehavior>> = {
  '@@fail:rate_limited@@': {
    kind: 'throw',
    code: 'provider.rate_limited',
    httpStatus: 429,
    message: 'The mock provider simulated a rate limit.',
  },
  '@@fail:timeout@@': {
    kind: 'throw',
    code: 'provider.timeout',
    httpStatus: 504,
    message: 'The mock provider simulated an upstream timeout.',
  },
  '@@fail:empty@@': {
    kind: 'throw',
    code: 'provider.empty_response',
    httpStatus: 502,
    message: 'The mock provider simulated an empty response.',
  },
  '@@fail:content_filter@@': {
    kind: 'throw',
    code: 'provider.content_filter',
    httpStatus: 400,
    message: 'The mock provider simulated a content-filter rejection.',
  },
  '@@fail:api_key_invalid@@': {
    kind: 'throw',
    code: 'provider.api_key_invalid',
    httpStatus: 401,
    message: 'The mock provider simulated an invalid API key.',
  },
  '@@fail:unknown@@': {
    kind: 'throw',
    code: 'provider.unknown_error',
    httpStatus: 500,
    message: 'The mock provider simulated an unclassified failure.',
  },
  '@@fail:truncate@@': { kind: 'degrade', mode: 'truncate' },
  '@@fail:bad_json@@': { kind: 'degrade', mode: 'bad_json' },
  '@@fail:partial_translations@@': { kind: 'degrade', mode: 'partial_translations' },
}

/** A detected marker: its literal token plus its behavior. */
export interface DetectedMarker {
  /** The literal marker text, e.g. `@@fail:timeout@@`. */
  readonly token: string
  /** What the provider must do. */
  readonly behavior: MarkerBehavior
}

/** The result of scanning one input text for markers. */
export interface MarkerDetection {
  /** The input with every occurrence of the detected marker removed. */
  readonly cleanInput: string
  /** The first known marker found, or `undefined` for marker-free input. */
  readonly marker?: DetectedMarker
}

/**
 * Scan one input text for failure markers. The FIRST known marker (in
 * catalog order) selects the behavior, and EVERY known marker token is
 * stripped from the returned text so token math never counts marker
 * characters, even when several different markers share one input.
 *
 * @param input The raw text (message content or embedding input).
 * @returns The cleaned text and the detected marker, if any.
 */
export function detectMarker(input: string): MarkerDetection {
  let marker: DetectedMarker | undefined
  let cleanInput = input
  for (const [token, behavior] of Object.entries(FAILURE_MARKERS)) {
    if (cleanInput.includes(token)) {
      marker ??= { token, behavior }
      cleanInput = cleanInput.split(token).join('')
    }
  }
  return marker === undefined ? { cleanInput } : { cleanInput, marker }
}
