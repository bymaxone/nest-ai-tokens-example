/**
 * @fileoverview Vitest configuration for the web unit tier. A minimal
 * node-environment config lands here so `lib/**` tests (fetch-mocked, no
 * DOM) are runnable as each task ships; the jsdom environment, Testing
 * Library setup, and enforced coverage thresholds land with the switcher
 * and CI wiring in a later task.
 *
 * @module vitest.config
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    maxWorkers: '50%',
  },
})
