/**
 * Unit tests for the application factory and boot sequence.
 *
 * Layer: unit (boots the real module graph in-process, no port by default).
 * Goal: prove `createApp()` assembles the production wiring, `bootstrap()`
 * listens on the configured port, and boot failures are reported value-free
 * with a non-zero exit code.
 * Mocks: none; `process.env` is patched per test (PORT=0 lets the OS pick a
 * free port so the suite never collides with a running dev server).
 */
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { bootstrap, createApp, reportBootFailure } from './bootstrap.js'
import { ENV_CONFIG, EnvValidationError } from './config/env.js'
import type { EnvConfig } from './config/env.js'

const VALID_URL = 'postgresql://postgres:postgres@localhost:5432/ai_tokens_example'

const savedEnv = { ...process.env }
const savedExitCode = process.exitCode

beforeEach(() => {
  process.env.DATABASE_URL = VALID_URL
  process.env.PORT = '0'
})

afterEach(() => {
  process.env = { ...savedEnv }
  process.exitCode = savedExitCode
  jest.restoreAllMocks()
})

describe('createApp', () => {
  /**
   * Production wiring seam.
   *
   * `createApp()` must return an initialized application exposing the typed
   * env via the DI token, without opening any port (the e2e harness relies
   * on exactly this behavior).
   */
  it('boots the module graph and exposes the typed env without listening', async () => {
    const app = await createApp()
    try {
      const env = app.get<EnvConfig>(ENV_CONFIG)
      expect(env.DATABASE_URL).toBe(VALID_URL)
      expect(env.PORT).toBe(0)
    } finally {
      await app.close()
    }
  })

  /**
   * Fail-fast on invalid environment.
   *
   * A missing DATABASE_URL must reject application creation before any
   * listener could open.
   */
  it('rejects with EnvValidationError when the environment is invalid', async () => {
    // A malformed value (rather than deletion) also shields the test from any
    // developer-local .env file: dotenv never overwrites a set variable.
    process.env.DATABASE_URL = 'not-a-postgres-url'

    await expect(createApp()).rejects.toBeInstanceOf(EnvValidationError)
  })
})

describe('reportBootFailure', () => {
  /**
   * Non-Error failure branch.
   *
   * A thrown non-Error value (possible from third-party code) must still be
   * reported with a generic message instead of crashing the reporter.
   */
  it('reports thrown non-Error values with a generic message', () => {
    const lines: string[] = []
    jest.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
      lines.push(String(message))
    })

    reportBootFailure('a string throw')

    expect(lines).toEqual(['Unknown boot failure'])
  })

  /**
   * Plain Error branch.
   *
   * A generic Error is reported by message only (no stack, no values), the
   * shape operators see for non-configuration failures.
   */
  it('reports a plain Error by its message', () => {
    const lines: string[] = []
    jest.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
      lines.push(String(message))
    })

    reportBootFailure(new Error('listener failed'))

    expect(lines).toEqual(['listener failed'])
  })
})

describe('bootstrap', () => {
  /**
   * Happy boot.
   *
   * `bootstrap()` must listen on the configured port (0 = ephemeral) and
   * return the running application.
   */
  it('listens on the configured port and returns the app', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    const app = await bootstrap()
    try {
      const server = app.getHttpServer() as { listening: boolean }
      expect(server.listening).toBe(true)
      expect(logSpy).toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  /**
   * Env-failure reporting (security invariant).
   *
   * On an invalid environment, bootstrap must print the value-free report,
   * set a non-zero exit code, and rethrow for the entry point. The received
   * value must never appear in the log output.
   */
  it('reports env failures value-free and sets a non-zero exit code', async () => {
    process.env.DATABASE_URL = 'postgresql-but-actually-SECRET'
    const lines: string[] = []
    jest.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
      lines.push(String(message))
    })

    await expect(bootstrap()).rejects.toBeInstanceOf(EnvValidationError)
    expect(process.exitCode).toBe(1)
    expect(lines.join('\n')).toContain('DATABASE_URL')
    expect(lines.join('\n')).not.toContain('SECRET')
  })

  /**
   * Non-env failure reporting.
   *
   * Any other boot failure must be reported by message only and still set
   * the exit code (regression guard for the generic error branch).
   */
  it('reports non-env boot failures by message only', async () => {
    // Deterministic generic failure: listening on a port that is already in
    // use fails after env validation succeeded, exercising the non-env branch.
    const first = await bootstrap()
    const address = first.getHttpServer().address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    process.env.PORT = String(port)
    const lines: string[] = []
    jest.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
      lines.push(String(message))
    })

    try {
      await expect(bootstrap()).rejects.toThrow()
      expect(process.exitCode).toBe(1)
      expect(lines.length).toBeGreaterThan(0)
    } finally {
      await first.close()
    }
  })
})
