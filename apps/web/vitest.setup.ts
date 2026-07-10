/**
 * @fileoverview Vitest global setup: registers jest-dom matchers so
 * component tests can assert on rendered markup (`toBeInTheDocument`,
 * `toHaveAttribute`, etc.), and polyfills `ResizeObserver` (absent in
 * jsdom) so Recharts' `ResponsiveContainer` can mount in a chart test
 * without a real layout engine.
 *
 * @module vitest.setup
 */
import '@testing-library/jest-dom/vitest'

/** A no-op ResizeObserver: charts render at the container's (zero) jsdom size; tests assert on markup, not pixels. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// Installed only when jsdom provides no implementation, so a real (or
// previously stubbed) observer is never clobbered.
globalThis.ResizeObserver ??= ResizeObserverStub
