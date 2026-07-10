'use strict'

/**
 * Jest configuration for the apps/api e2e tier (ESM via ts-jest).
 *
 * One worker, on purpose: the suite runs exactly one Testcontainers Postgres
 * stack at a time and boots the real application against it, so parallel
 * workers would multiply containers and peak memory (each worker reloads the
 * module graph including the locally linked library).
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  maxWorkers: 1,
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  // emitDecoratorMetadata stays ON here, matching the production build: the
  // global ZodValidationPipe discovers DTO schemas through the emitted
  // design:paramtypes metatype, and this tier must exercise the exact
  // request-validation semantics that ship. (The unit config disables the
  // emit for branch-accurate coverage; unit specs call handlers directly.)
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { useESM: true }],
  },
  // Strip the .js extension from relative imports so ts-jest resolves the
  // TypeScript sources (NodeNext emits .js specifiers).
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Container pull + migrate + boot comfortably exceed the default timeout.
  testTimeout: 120_000,
  // Coverage scope and bar mirror the unit config; the gated 100% run is the
  // unit tier (`test:cov`), the e2e tier proves behavior end to end.
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!**/*.spec.ts'],
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
  coverageReporters: ['text', 'text-summary', 'json-summary'],
  coverageDirectory: 'coverage-e2e',
}
