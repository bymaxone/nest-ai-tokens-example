/**
 * @fileoverview Unit tests for the categorical chart series color rotation.
 *
 * @layer components/charts
 */
import { describe, expect, it } from 'vitest'

import { CHART_SERIES_COLORS, seriesColor } from './chart-colors.js'

describe('seriesColor', () => {
  // scenario: indices within range map to the palette directly.
  it('returns the color at the given index', () => {
    expect(seriesColor(0)).toBe(CHART_SERIES_COLORS[0])
    expect(seriesColor(1)).toBe(CHART_SERIES_COLORS[1])
  })

  // scenario: an index past the palette length wraps around.
  it('cycles when the index exceeds the palette length', () => {
    expect(seriesColor(CHART_SERIES_COLORS.length)).toBe(CHART_SERIES_COLORS[0])
  })

  // scenario: the palette never includes the reserved "bad" red.
  it('never includes the error-reserved red', () => {
    expect(CHART_SERIES_COLORS).not.toContain('#ef4444')
  })
})
