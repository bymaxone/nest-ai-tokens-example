/**
 * @fileoverview The categorical series palette every chart on the Usage and
 * Overview pages draws from, ported from the design tokens
 * (`src/styles/tokens.css`): no new palette, only the existing semantic
 * hex values. `--red` is intentionally excluded from the rotation: the
 * design system reserves red for "bad" deltas and error states (§08), so a
 * chart series must never accidentally read as a failure signal.
 *
 * @layer components/charts
 */

/** The rotation a multi-series chart (donut slices, grouped bars) cycles through. */
export const CHART_SERIES_COLORS: readonly string[] = [
  '#ff6224', // --primary
  '#60a5fa', // --blue
  '#22c55e', // --green
  '#f59e0b', // --amber
  '#a855f7', // --purple
]

/**
 * The series color for the given zero-based index, cycling through
 * {@link CHART_SERIES_COLORS} for any number of categories.
 *
 * @param index The category's position.
 * @returns A hex color from the rotation.
 */
export function seriesColor(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length] as string
}
