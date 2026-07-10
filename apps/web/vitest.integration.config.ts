/**
 * @fileoverview Vitest configuration for the web integration tier: the
 * live api round-trip smoke, kept OUT of the unit `include` glob (and out
 * of `test:cov`) because it boots a real Postgres via Testcontainers and a
 * live NestJS server. Node environment (no DOM): the api client's `fetch`
 * calls a real listening server, nothing is mocked.
 *
 * @module vitest.integration.config
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // A single Postgres container and one live server per run: no benefit
    // to parallel workers, and Testcontainers is heavier under contention.
    maxWorkers: 1,
  },
})
