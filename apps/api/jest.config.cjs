'use strict'

/**
 * Jest configuration for apps/api unit suites (ESM via ts-jest).
 *
 * Workers are bounded to half the cores as a memory guard: every worker loads
 * its own module graph, including the locally linked library, so an unbounded
 * pool multiplies peak memory.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  maxWorkers: '50%',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/prisma/**/*.spec.ts', '<rootDir>/src/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  // emitDecoratorMetadata stays off under test: every injection in this app
  // uses an explicit @Inject (so DI never needs emitted paramtypes) and the
  // emitted metadata would otherwise add unreachable `typeof` guard branches
  // to the coverage report. The production build (tsc) keeps it on.
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { useESM: true, tsconfig: { emitDecoratorMetadata: false } }],
  },
  // Strip the .js extension from relative imports so ts-jest resolves the
  // TypeScript sources (NodeNext emits .js specifiers).
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Coverage scope: every executable source, minus the bootstrap entrypoints
  // (`seed.ts` and `main.ts` only wire an entry and delegate to covered code).
  collectCoverageFrom: [
    'src/**/*.ts',
    'prisma/**/*.ts',
    '!src/main.ts',
    '!prisma/seed.ts',
    '!**/*.spec.ts',
  ],
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
  coverageReporters: ['text', 'text-summary', 'json-summary'],
  coverageDirectory: 'coverage',
}
