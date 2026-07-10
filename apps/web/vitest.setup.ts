/**
 * @fileoverview Vitest global setup: registers jest-dom matchers so
 * component tests can assert on rendered markup (`toBeInTheDocument`,
 * `toHaveAttribute`, etc.).
 *
 * @module vitest.setup
 */
import '@testing-library/jest-dom/vitest'
