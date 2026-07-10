/**
 * Unit tests for the app-owned typed HTTP exception.
 *
 * Layer: unit.
 * Goal: prove the envelope mirrors the library's canonical
 * `{ error: { code, message, details? } }` shape and carries the given
 * HTTP status, with details present only when supplied.
 * Mocks: none.
 */
import { describe, expect, it } from '@jest/globals'

import { ApiException } from './api-exception.js'

describe('ApiException', () => {
  /**
   * Canonical envelope with details.
   *
   * The response body must match the library's error shape so clients
   * parse one format for library and app errors alike.
   */
  it('serializes the canonical envelope with details and status', () => {
    const exception = new ApiException('provider.timeout', 504, 'Upstream timed out.', {
      marker: '@@fail:timeout@@',
    })

    expect(exception.getStatus()).toBe(504)
    expect(exception.code).toBe('provider.timeout')
    expect(exception.getResponse()).toEqual({
      error: {
        code: 'provider.timeout',
        message: 'Upstream timed out.',
        details: { marker: '@@fail:timeout@@' },
      },
    })
  })

  /**
   * Details omission.
   *
   * Without details the envelope must not carry a details key at all
   * (absent, not undefined/null), keeping serialized bodies minimal.
   */
  it('omits the details key when none are given', () => {
    const exception = new ApiException('command.missing_translations', 502, 'Missing languages.')

    expect(exception.getResponse()).toEqual({
      error: { code: 'command.missing_translations', message: 'Missing languages.' },
    })
  })
})
