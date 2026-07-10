/**
 * E2E proofs of the errors-demo trigger surface (spec §19; matrix rows
 * 60-62, 77-79).
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: walk every code `POST /errors-demo/:code` can raise in this
 * task's scope with a table test asserting the documented HTTP status,
 * the canonical `{ error: { code, message, details? } }` envelope, the
 * shipped library message verbatim, and zero internal leakage (no stack
 * frames, SQL, or paths). Also proves the demo-infrastructure policy
 * (unknown code 404 with the supported list, reserved code 501 with an
 * honest reason) and the state-safety contract: non-billing triggers move
 * neither the caller's balance nor the settled ledger, while the
 * documented billing trigger debits exactly once.
 * Mocks: none. One container stack per run.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import request from 'supertest'
import type { App } from 'supertest/types.js'

import { runSeed } from '../../prisma/seed-runner.js'
import { createApp } from '../../src/bootstrap.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The canonical envelope every trigger response must carry. */
interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> }
}

/** One table row: a triggerable code and its documented status + message. */
interface TriggerExpectation {
  readonly code: string
  readonly status: number
  /** The exact message the shipped library/app throw site uses. */
  readonly message: string
}

/**
 * The non-billing library triggers of this scope, with the SHIPPED v0.1.0
 * canonical messages (the library pins them per version; the app links the
 * library by exact version, so verbatim assertions are stable).
 */
const LIBRARY_TRIGGERS: readonly TriggerExpectation[] = [
  {
    code: 'AI_TOKENS_INVALID_CONFIG',
    status: 500,
    message:
      'The AI tokens module configuration is invalid; check markup, limits, currency/fx, and store port methods.',
  },
  {
    code: 'AI_TOKENS_UNKNOWN_PROVIDER',
    status: 400,
    message:
      'Raw usage was provided without a preset or normalizer and is not already a NormalizedUsage.',
  },
  {
    code: 'AI_TOKENS_USAGE_MALFORMED',
    status: 422,
    message: 'The provider usage payload is missing required token fields.',
  },
  {
    code: 'AI_TOKENS_PRICE_NOT_FOUND',
    status: 422,
    message:
      'No effective-dated price was found for the requested model, operation, and service tier.',
  },
  {
    code: 'AI_TOKENS_BUDGET_EXCEEDED',
    status: 402,
    message: 'A hard spend budget blocks this call.',
  },
  {
    code: 'AI_TOKENS_QUOTA_EXCEEDED',
    status: 429,
    message: 'A hard token or operation-count quota blocks this call.',
  },
  {
    code: 'AI_TOKENS_INSUFFICIENT_CREDITS',
    status: 402,
    message: 'The wallet balance, including any overdraft, is below the required amount.',
  },
  {
    code: 'AI_TOKENS_HOLD_NOT_FOUND',
    status: 404,
    message: 'The referenced hold does not exist for this tenant and scope.',
  },
  {
    code: 'AI_TOKENS_HOLD_ALREADY_SETTLED',
    status: 409,
    message: 'The referenced hold was already released and cannot be captured.',
  },
  {
    code: 'AI_TOKENS_IDEMPOTENCY_CONFLICT',
    status: 409,
    message:
      'The idempotency key was reused with a different payload, or the record was already reversed.',
  },
  {
    code: 'AI_TOKENS_STREAM_USAGE_MISSING',
    status: 422,
    message: 'The stream ended without provider usage and no tokenizer fallback was available.',
  },
  {
    code: 'AI_TOKENS_STORE_ERROR',
    status: 502,
    message: 'The persistence adapter raised an unexpected error.',
  },
]

/** Internal details that must never leak through any envelope. */
const LEAK_PATTERN =
  /\bat\s+\w+\.|SELECT |INSERT |postgres(?:ql)?:\/\/|node_modules|\/Users\/|\/home\//

let container: StartedPostgreSqlContainer | undefined
let app: INestApplication | undefined
let server: App

/** Container up, migrate + seed, boot the production wiring (no listener). */
beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('ai_tokens_example')
    .start()
  const databaseUrl = container.getConnectionUri()
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: APP_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  })
  process.env.DATABASE_URL = databaseUrl
  process.env.PORT = '0'
  app = await createApp()
  await runSeed(app.get(PrismaService))
  server = app.getHttpServer() as App
})

/** App first (pools, timers), then the container; both guarded. */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

/** Trigger one code as ada and return the response. */
async function triggerAs(code: string): Promise<request.Response> {
  return request(server).post(`/errors-demo/${code}`).set('x-demo-user', 'ada')
}

/** Fetch ada's balance (nano-USD) and settled-ledger total. */
async function adaFootprint(): Promise<{ balance: string; ledgerTotal: number }> {
  const balance = await request(server).get('/usage/balance').set('x-demo-user', 'ada').expect(200)
  const ledger = await request(server)
    .get('/ledger/transactions')
    .query({ limit: 1 })
    .set('x-demo-user', 'ada')
    .expect(200)
  return { balance: balance.body.nanoUsd as string, ledgerTotal: ledger.body.total as number }
}

describe('GET /errors-demo', () => {
  /**
   * Catalog discovery.
   *
   * The listing exposes the full catalog (both sources) plus the
   * triggerable code set, so clients can drive the walk without a
   * hardcoded list.
   */
  it('lists the catalog and the triggerable codes', async () => {
    const response = await request(server).get('/errors-demo').set('x-demo-user', 'ada').expect(200)

    const entries = response.body.entries as { code: string; source: string }[]
    const triggerable = response.body.triggerable as string[]
    expect(entries.some((entry) => entry.source === 'library')).toBe(true)
    expect(entries.some((entry) => entry.source === 'app')).toBe(true)
    for (const code of triggerable) {
      expect(entries.map((entry) => entry.code)).toContain(code)
    }
  })
})

describe('POST /errors-demo/:code library table walk', () => {
  let before: { balance: string; ledgerTotal: number }

  /** Snapshot ada's money/ledger footprint before the walk. */
  beforeAll(async () => {
    before = await adaFootprint()
  })

  it.each(LIBRARY_TRIGGERS)(
    /**
     * Each library trigger returns its documented status and the shipped
     * canonical envelope, verbatim, with zero internal leakage. The
     * scenario per row is documented in the trigger registry.
     */
    'raises $code with status $status and the canonical envelope',
    async ({ code, status, message }) => {
      const response = await triggerAs(code)

      expect(response.status).toBe(status)
      const body = response.body as ErrorEnvelope
      expect(Object.keys(body)).toEqual(['error'])
      expect(body.error.code).toBe(code)
      expect(body.error.message).toBe(message)
      expect(JSON.stringify(body)).not.toMatch(LEAK_PATTERN)
    },
  )

  /**
   * State-safety contract.
   *
   * The whole library walk is non-billing: ada's wallet balance and her
   * settled ledger total must be EXACTLY what they were before the walk
   * (the only row any trigger may write is a voided hold, which is
   * excluded from settled reads and never bills).
   */
  it('moves neither the balance nor the settled ledger', async () => {
    const after = await adaFootprint()

    expect(after.balance).toBe(before.balance)
    expect(after.ledgerTotal).toBe(before.ledgerTotal)
  })
})

describe('POST /errors-demo/command.missing_translations (billing trigger)', () => {
  /**
   * Documented billing semantics (spec §4.3 contract 5).
   *
   * The partial-translations outcome fires AFTER the debit: the response
   * is the app's 502 envelope carrying the missing languages and the
   * transaction id, and ada's balance dropped (real tokens were produced
   * and billed).
   */
  it('debits, then raises the 502 with the transaction id', async () => {
    const before = await adaFootprint()

    const response = await triggerAs('command.missing_translations')

    expect(response.status).toBe(502)
    const body = response.body as ErrorEnvelope
    // The degrade marker drops the LAST requested language ('es' here).
    expect(body.error.code).toBe('command.missing_translations')
    expect(body.error.details?.missing).toEqual(['es'])
    expect(typeof body.error.details?.transactionId).toBe('string')
    expect(JSON.stringify(body)).not.toMatch(LEAK_PATTERN)

    const after = await adaFootprint()
    expect(BigInt(after.balance)).toBeLessThan(BigInt(before.balance))
    expect(after.ledgerTotal).toBe(before.ledgerTotal + 1)
  })
})

describe('POST /errors-demo/:code demo-infrastructure policy', () => {
  /**
   * Unknown code (value-free 404).
   *
   * A code outside the catalog answers 404 with the supported list; the
   * received value is never echoed back.
   */
  it('answers 404 with the supported list for an unknown code', async () => {
    const response = await triggerAs('mallory.probe_code')

    expect(response.status).toBe(404)
    const body = response.body as ErrorEnvelope
    expect(body.error.code).toBe('errors_demo.unknown_code')
    expect(body.error.details?.supported).toContain('AI_TOKENS_PRICE_NOT_FOUND')
    expect(JSON.stringify(body)).not.toContain('mallory')
  })

  /**
   * Reserved code (honest 501).
   *
   * `AI_TOKENS_NOT_CONFIGURED` is never raised by v0.1.0; the endpoint
   * says so instead of faking it.
   */
  it('answers 501 with the honest reason for the reserved code', async () => {
    const response = await triggerAs('AI_TOKENS_NOT_CONFIGURED')

    expect(response.status).toBe(501)
    const body = response.body as ErrorEnvelope
    expect(body.error.code).toBe('errors_demo.not_triggerable')
    expect(body.error.details).toMatchObject({
      code: 'AI_TOKENS_NOT_CONFIGURED',
      availability: 'reserved',
    })
  })

  /**
   * Identity requirement.
   *
   * Triggers are identity-scoped (they run in the caller's tenant); an
   * anonymous call is rejected with 401 before any dispatch.
   */
  it('answers 401 without a demo identity', async () => {
    const response = await request(server).post('/errors-demo/AI_TOKENS_PRICE_NOT_FOUND')

    expect(response.status).toBe(401)
  })
})
