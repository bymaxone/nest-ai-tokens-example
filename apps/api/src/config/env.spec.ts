/**
 * Unit tests for the typed environment configuration.
 *
 * Layer: unit.
 * Goal: prove the schema's defaults, coercions, and rejections, and that the
 * failure report never contains a received value.
 * Mocks: none; `parseEnv` is pure. `loadEnvFromProcess` runs against a
 * temporarily patched `process.env`.
 */
import { describe, expect, it } from '@jest/globals'

import {
  ENV_CONFIG,
  EnvValidationError,
  formatEnvIssues,
  loadEnvFromProcess,
  parseEnv,
} from './env.js'

const VALID_URL = 'postgresql://postgres:postgres@localhost:5432/ai_tokens_example'

describe('parseEnv', () => {
  /**
   * Happy path with only the mandatory variable set.
   *
   * Every optional variable must fall back to its documented default so a
   * bare `.env` with just DATABASE_URL boots the API.
   */
  it('applies the documented defaults when only DATABASE_URL is set', () => {
    const env = parseEnv({ DATABASE_URL: VALID_URL })

    expect(env).toEqual({
      DATABASE_URL: VALID_URL,
      PORT: 3001,
      AI_PROVIDER_MODE: 'mock',
      QUOTA_ENABLED: true,
      QUOTA_TOLERANCE: 1.2,
      QUOTA_MINIMUM_BALANCE: 0,
      TENANT_REQUIRED: false,
      PRICING_CACHE_TTL_MS: 300_000,
      MOCK_LATENCY_MS: 0,
    })
  })

  /**
   * Full override path.
   *
   * Every variable set to a non-default value must be coerced to its typed
   * form (numbers from strings, booleans from stringbools).
   */
  it('coerces and returns explicitly set values', () => {
    const env = parseEnv({
      DATABASE_URL: VALID_URL,
      PORT: '4000',
      AI_PROVIDER_MODE: 'openai-optin',
      QUOTA_ENABLED: 'false',
      QUOTA_TOLERANCE: '1.5',
      QUOTA_MINIMUM_BALANCE: '-5',
      TENANT_REQUIRED: 'true',
      PRICING_CACHE_TTL_MS: '60000',
      MOCK_LATENCY_MS: '250',
    })

    expect(env).toEqual({
      DATABASE_URL: VALID_URL,
      PORT: 4000,
      AI_PROVIDER_MODE: 'openai-optin',
      QUOTA_ENABLED: false,
      QUOTA_TOLERANCE: 1.5,
      QUOTA_MINIMUM_BALANCE: -5,
      TENANT_REQUIRED: true,
      PRICING_CACHE_TTL_MS: 60_000,
      MOCK_LATENCY_MS: 250,
    })
  })

  /**
   * Missing mandatory variable.
   *
   * DATABASE_URL has no default; its absence must fail validation and the
   * report must name the variable.
   */
  it('rejects a missing DATABASE_URL and names it in the report', () => {
    expect.assertions(2)
    try {
      parseEnv({})
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      expect((error as EnvValidationError).report.join('\n')).toContain('DATABASE_URL')
    }
  })

  /**
   * Wrong datasource protocol.
   *
   * The URL must be a postgres/postgresql URL; an http URL is a
   * misconfiguration that must fail fast rather than surface as a confusing
   * Prisma connection error later.
   */
  it('rejects a DATABASE_URL with a non-postgres protocol', () => {
    expect(() => parseEnv({ DATABASE_URL: 'https://example.com/db' })).toThrow(EnvValidationError)
  })

  /**
   * Value-free failure report (security invariant).
   *
   * A connection string may embed credentials; the aggregated report must
   * carry variable names and issue text only, never the received value.
   */
  it('never echoes received values in the failure report', () => {
    const secret = 'postgresql://user:SUPER_SECRET_PW@host:5432/db'
    expect.assertions(2)
    try {
      parseEnv({ DATABASE_URL: 'not a url', PORT: secret })
    } catch (error) {
      const report = (error as EnvValidationError).report.join('\n')
      expect(report).not.toContain('SUPER_SECRET_PW')
      expect(report).not.toContain('not a url')
    }
  })

  /**
   * Aggregated report (boundary).
   *
   * Multiple invalid variables must be reported together so an operator can
   * fix the whole environment in one pass instead of failing one at a time.
   */
  it('aggregates every offending variable into one report', () => {
    expect.assertions(2)
    try {
      parseEnv({ DATABASE_URL: 'nope', PORT: 'abc', PRICING_CACHE_TTL_MS: '-1' })
    } catch (error) {
      const { report } = error as EnvValidationError
      expect(report.length).toBeGreaterThanOrEqual(3)
      expect(report.every((line) => /^(?:[A-Z_.]+|\(root\)): /.test(line))).toBe(true)
    }
  })

  /**
   * Numeric boundaries.
   *
   * PORT must be an integer within the TCP range; QUOTA_TOLERANCE and
   * PRICING_CACHE_TTL_MS must be strictly positive; MOCK_LATENCY_MS must be
   * a non-negative integer.
   */
  it.each([
    ['PORT above the TCP range', { PORT: '70000' }],
    ['a fractional PORT', { PORT: '30.5' }],
    ['a zero QUOTA_TOLERANCE', { QUOTA_TOLERANCE: '0' }],
    ['a zero PRICING_CACHE_TTL_MS', { PRICING_CACHE_TTL_MS: '0' }],
    ['an unknown AI_PROVIDER_MODE', { AI_PROVIDER_MODE: 'real' }],
    ['a non-boolean QUOTA_ENABLED', { QUOTA_ENABLED: 'maybe' }],
    ['a negative MOCK_LATENCY_MS', { MOCK_LATENCY_MS: '-1' }],
    ['a fractional MOCK_LATENCY_MS', { MOCK_LATENCY_MS: '10.5' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => parseEnv({ DATABASE_URL: VALID_URL, ...overrides })).toThrow(EnvValidationError)
  })
})

describe('formatEnvIssues', () => {
  /**
   * Root-path fallback.
   *
   * An issue with an empty path (a top-level schema rejection) must be
   * labeled '(root)' so the report line is never blank before the colon.
   */
  it("labels empty-path issues with '(root)'", () => {
    expect(formatEnvIssues([{ path: [], message: 'Invalid input' }])).toEqual([
      '(root): Invalid input',
    ])
  })

  /**
   * Named-path rendering.
   *
   * Nested paths join with dots, mirroring how Zod addresses fields.
   */
  it('joins issue paths with dots', () => {
    expect(formatEnvIssues([{ path: ['PORT'], message: 'Too big' }])).toEqual(['PORT: Too big'])
  })
})

describe('EnvValidationError', () => {
  /**
   * Error shape.
   *
   * The error exposes its report and a joined message so both structured and
   * plain-text consumers can render it.
   */
  it('carries the report and a joined message', () => {
    const error = new EnvValidationError(['A: bad', 'B: worse'])

    expect(error.name).toBe('EnvValidationError')
    expect(error.report).toEqual(['A: bad', 'B: worse'])
    expect(error.message).toContain('A: bad')
  })
})

describe('loadEnvFromProcess', () => {
  /**
   * Single read point.
   *
   * The loader must parse the live `process.env` (the shell environment wins
   * over any `.env` file because dotenv never overwrites existing values).
   */
  it('parses process.env and honors already-set variables', () => {
    const previous = process.env.DATABASE_URL
    process.env.DATABASE_URL = VALID_URL
    try {
      const env = loadEnvFromProcess()
      expect(env.DATABASE_URL).toBe(VALID_URL)
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previous
    }
  })
})

describe('ENV_CONFIG', () => {
  /**
   * DI token identity.
   *
   * The token is a unique symbol; two imports must observe the same value so
   * providers and consumers always agree.
   */
  it('is a symbol usable as a DI token', () => {
    expect(typeof ENV_CONFIG).toBe('symbol')
  })
})
