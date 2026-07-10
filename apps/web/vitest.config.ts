/**
 * @fileoverview Vitest configuration for the web unit tier: jsdom
 * environment plus Testing Library for component tests, the `@` path alias
 * mirroring `tsconfig.json`, and v8 coverage gated at 100% on `lib/**` and
 * `components/**` (the surfaces this phase implements). `api-types.ts` is a
 * pure-declaration file with no executable statements and Next.js route
 * shells (`app/**`) are thin composition only, so both are excluded from
 * the coverage denominator, matching the sibling apps' convention.
 *
 * @module vitest.config
 */
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    maxWorkers: '50%',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
      include: ['src/lib/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
      exclude: [
        // Pure type declarations: zero executable statements to cover.
        'src/lib/api-types.ts',
        // Test files are subjects-under-test, never counted as coverage source.
        '**/*.{test,spec}.{ts,tsx}',
      ],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
})
