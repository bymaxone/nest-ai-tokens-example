/**
 * Unit tests for the failure-injection marker engine.
 *
 * Layer: unit.
 * Goal: prove the catalog maps every marker to its documented behavior,
 * detection finds and strips markers without touching surrounding text,
 * and marker-free input passes through untouched.
 * Mocks: none; the engine is pure.
 */
import { describe, expect, it } from '@jest/globals'

import { FAILURE_MARKERS, FAILURE_MARKER_PREFIX, detectMarker } from './failure-markers.js'

describe('FAILURE_MARKERS', () => {
  /**
   * Catalog completeness and shape.
   *
   * Every documented marker is present, every token wears the reserved
   * demo-only prefix, and each maps to its spec-pinned behavior: the
   * table the provider integration spec walks.
   */
  it('maps every documented marker to its behavior', () => {
    expect(Object.keys(FAILURE_MARKERS)).toEqual([
      '@@fail:rate_limited@@',
      '@@fail:timeout@@',
      '@@fail:empty@@',
      '@@fail:content_filter@@',
      '@@fail:api_key_invalid@@',
      '@@fail:unknown@@',
      '@@fail:truncate@@',
      '@@fail:bad_json@@',
      '@@fail:partial_translations@@',
    ])
    expect(Object.keys(FAILURE_MARKERS).every((t) => t.startsWith(FAILURE_MARKER_PREFIX))).toBe(
      true,
    )
  })

  /**
   * Throw-kind status mapping.
   *
   * Each thrown provider failure surfaces with its documented HTTP status
   * (429/504/502/400/401/500): the contract the errors demo relies on.
   */
  it('pins the documented HTTP status per throw marker', () => {
    const statuses = Object.values(FAILURE_MARKERS)
      .filter((b) => b.kind === 'throw')
      .map((b) => [b.code, b.httpStatus])

    expect(statuses).toEqual([
      ['provider.rate_limited', 429],
      ['provider.timeout', 504],
      ['provider.empty_response', 502],
      ['provider.content_filter', 400],
      ['provider.api_key_invalid', 401],
      ['provider.unknown_error', 500],
    ])
  })
})

describe('detectMarker', () => {
  /**
   * Detection and stripping.
   *
   * The marker is found anywhere in the text and EVERY occurrence is
   * stripped, so marker characters never reach token math.
   */
  it('finds a marker and strips all its occurrences', () => {
    const detection = detectMarker('Hello @@fail:timeout@@ world @@fail:timeout@@!')

    expect(detection.marker?.token).toBe('@@fail:timeout@@')
    expect(detection.marker?.behavior).toMatchObject({ kind: 'throw', code: 'provider.timeout' })
    expect(detection.cleanInput).toBe('Hello  world !')
  })

  /**
   * Marker-free passthrough.
   *
   * Ordinary text (including at-signs that do not form a known marker)
   * must pass through untouched with no marker reported: the prefix
   * convention cannot fire accidentally.
   */
  it('passes marker-free input through untouched', () => {
    const detection = detectMarker('email me @@ home about @@fail:not_a_marker@@')

    expect(detection.marker).toBeUndefined()
    expect(detection.cleanInput).toBe('email me @@ home about @@fail:not_a_marker@@')
  })

  /**
   * Degrade-kind detection.
   *
   * A degrade marker reports its mode so the provider can shape the
   * response instead of throwing.
   */
  it('reports degrade markers with their mode', () => {
    expect(detectMarker('x @@fail:truncate@@').marker?.behavior).toEqual({
      kind: 'degrade',
      mode: 'truncate',
    })
  })
})
