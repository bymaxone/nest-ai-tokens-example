/**
 * @fileoverview Unit tests for the nano-USD display helper.
 *
 * @layer lib
 */
import { describe, expect, it } from 'vitest'

import { formatMoney } from './money.js'

describe('formatMoney', () => {
  // scenario: a whole-cent style value renders through the library's own formatter.
  it('formats a well-formed nano-USD string to 6 decimals', () => {
    expect(formatMoney('5000000')).toBe('$0.005000')
  })

  // scenario: zero is a valid amount, not a malformed one.
  it('formats zero', () => {
    expect(formatMoney('0')).toBe('$0.000000')
  })

  // scenario: a large value stays exact (bigint math, no float rounding).
  it('formats a large amount without precision loss', () => {
    expect(formatMoney('123456789012345')).toBe('$123456.789012')
  })

  // scenario: a non-numeric string is rejected rather than crashing the render.
  it('renders a placeholder for a non-digit string', () => {
    expect(formatMoney('not-a-number')).toBe('—')
  })

  // scenario: a negative sign is not a valid wire nano-USD string (the wire never sends one).
  it('renders a placeholder for a negative-looking string', () => {
    expect(formatMoney('-100')).toBe('—')
  })

  // scenario: an empty string is rejected.
  it('renders a placeholder for an empty string', () => {
    expect(formatMoney('')).toBe('—')
  })
})
