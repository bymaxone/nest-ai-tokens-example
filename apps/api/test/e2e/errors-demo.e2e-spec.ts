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

/**
 * The non-billing app provider triggers: the six throw-kind markers abort
 * inside the mock provider before any usage exists (the hold is released),
 * and the bad-json degrade is abandoned without recording.
 */
const APP_TRIGGERS: readonly TriggerExpectation[] = [
  {
    code: 'provider.rate_limited',
    status: 429,
    message: 'The mock provider simulated a rate limit.',
  },
  {
    code: 'provider.timeout',
    status: 504,
    message: 'The mock provider simulated an upstream timeout.',
  },
  {
    code: 'provider.empty_response',
    status: 502,
    message: 'The mock provider simulated an empty response.',
  },
  {
    code: 'provider.content_filter',
    status: 400,
    message: 'The mock provider simulated a content-filter rejection.',
  },
  {
    code: 'provider.api_key_invalid',
    status: 401,
    message: 'The mock provider simulated an invalid API key.',
  },
  {
    code: 'provider.unknown_error',
    status: 500,
    message: 'The mock provider simulated an unclassified failure.',
  },
  {
    code: 'provider.invalid_json',
    status: 502,
    message: 'The provider returned unparseable JSON; nothing was debited.',
  },
]

describe('POST /errors-demo/:code provider table walk', () => {
  let before: { balance: string; ledgerTotal: number }

  /** Snapshot ada's money/ledger footprint before the provider walk. */
  beforeAll(async () => {
    before = await adaFootprint()
  })

  it.each(APP_TRIGGERS)(
    /**
     * Each provider trigger returns its documented status and the app's
     * mirrored canonical envelope, verbatim, with zero internal leakage.
     * The marker-driven scenario per row is documented in the registry.
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
   * State-safety contract for the provider walk.
   *
   * Throw markers fire BEFORE usage exists and the bad-json outcome is
   * abandoned instead of recorded, so neither the balance nor the settled
   * ledger may move (matrix row 78: failed calls never debit).
   */
  it('moves neither the balance nor the settled ledger', async () => {
    const after = await adaFootprint()

    expect(after.balance).toBe(before.balance)
    expect(after.ledgerTotal).toBe(before.ledgerTotal)
  })
})

describe('POST /errors-demo/provider.response_truncated (billing trigger)', () => {
  /**
   * Documented billing semantics (spec §4.3 contract 5).
   *
   * Truncation fires AFTER the debit: real tokens were produced, so the
   * 502 envelope carries the transaction id and ada's balance dropped by
   * exactly one settled record.
   */
  it('debits, then raises the 502 with the transaction id', async () => {
    const before = await adaFootprint()

    const response = await triggerAs('provider.response_truncated')

    expect(response.status).toBe(502)
    const body = response.body as ErrorEnvelope
    expect(body.error.code).toBe('provider.response_truncated')
    expect(body.error.message).toBe(
      'The provider truncated the response; the produced tokens were debited.',
    )
    expect(typeof body.error.details?.transactionId).toBe('string')
    expect(JSON.stringify(body)).not.toMatch(LEAK_PATTERN)

    const after = await adaFootprint()
    expect(BigInt(after.balance)).toBeLessThan(BigInt(before.balance))
    expect(after.ledgerTotal).toBe(before.ledgerTotal + 1)
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

describe('POST /errors-demo/helpers/backdated-cost (spec §13 scenario 4)', () => {
  /** The helper request for one million tokens each way (exact math). */
  const MILLION_TOKENS = {
    model: 'mock-chat-pro',
    promptTokens: 1_000_000,
    completionTokens: 1_000_000,
  }

  /**
   * Exact historical rating against the seeded rate.
   *
   * One million tokens each way at the seeded mock-chat-pro rate
   * (600/2400 nano-USD per million-fraction) must cost exactly
   * 600 + 2400 = 3000 nano-USD-per-million units raw and 1.25x billed —
   * BigInt-exact, no float ever touches the money.
   */
  it('prices a call at a past date with the exact seeded rate', async () => {
    const response = await request(server)
      .post('/errors-demo/helpers/backdated-cost')
      .set('x-demo-user', 'ada')
      .send({ ...MILLION_TOKENS, date: '2026-01-15T00:00:00.000Z' })
      .expect(200)

    expect(response.body.pricing).toMatchObject({
      provider: 'mock',
      model: 'mock-chat-pro',
      inputNanoUsdPerMillion: '600000000',
      outputNanoUsdPerMillion: '2400000000',
    })
    // 1M input at 600e6/M + 1M output at 2400e6/M = 3_000_000_000 raw.
    expect(response.body.cost).toEqual({
      rawCostNanoUsd: '3000000000',
      billedCostNanoUsd: '3750000000',
    })
  })

  /**
   * Point-in-time pricing across a price update.
   *
   * After the admin doubles the rate, a backdated estimate BEFORE the
   * update still resolves the OLD window (past records are never
   * re-rated), while an estimate at "now" resolves the new one. The
   * historical date sits 10 minutes back so it lands in a different
   * rate-cache TTL bucket than "now" (the cache keys `at` by TTL bucket).
   */
  it('keeps historical dates on the old window after a price update', async () => {
    const beforeUpdate = new Date(Date.now() - 600_000).toISOString()
    await request(server)
      .put('/pricing/mock-chat-pro')
      .set('x-demo-user', 'root')
      .send({
        provider: 'mock',
        operation: 'chat',
        inputNanoUsdPerMillion: '1200000000',
        outputNanoUsdPerMillion: '4800000000',
      })
      .expect(200)

    const historical = await request(server)
      .post('/errors-demo/helpers/backdated-cost')
      .set('x-demo-user', 'ada')
      .send({ ...MILLION_TOKENS, date: beforeUpdate })
      .expect(200)
    const current = await request(server)
      .post('/errors-demo/helpers/backdated-cost')
      .set('x-demo-user', 'ada')
      .send({ ...MILLION_TOKENS, date: new Date().toISOString() })
      .expect(200)

    expect(historical.body.pricing.inputNanoUsdPerMillion).toBe('600000000')
    expect(historical.body.cost.rawCostNanoUsd).toBe('3000000000')
    expect(current.body.pricing.inputNanoUsdPerMillion).toBe('1200000000')
    expect(current.body.cost.rawCostNanoUsd).toBe('6000000000')
    expect(current.body.pricing.id).not.toBe(historical.body.pricing.id)
  })

  /**
   * Strict miss through the helper.
   *
   * A model with no price raises the library's PRICE_NOT_FOUND through
   * the helper too — the same canonical envelope as the trigger walk.
   */
  it('raises AI_TOKENS_PRICE_NOT_FOUND for an unpriced model', async () => {
    const response = await request(server)
      .post('/errors-demo/helpers/backdated-cost')
      .set('x-demo-user', 'ada')
      .send({ ...MILLION_TOKENS, model: 'ghost-model', date: '2026-01-15T00:00:00.000Z' })
      .expect(422)

    expect((response.body as ErrorEnvelope).error.code).toBe('AI_TOKENS_PRICE_NOT_FOUND')
  })

  /**
   * Read-only contract.
   *
   * The helper writes nothing: ada's balance and settled ledger are
   * untouched by the whole backdate exercise.
   */
  it('never writes to the ledger', async () => {
    const before = await adaFootprint()

    await request(server)
      .post('/errors-demo/helpers/backdated-cost')
      .set('x-demo-user', 'ada')
      .send({ ...MILLION_TOKENS, date: '2026-02-01T00:00:00.000Z' })
      .expect(200)

    const after = await adaFootprint()
    expect(after).toEqual(before)
  })
})

describe('error catalog coverage summary', () => {
  /**
   * The reconciled catalog counts (the drafted "22 of 24" reconciled onto
   * the shipped surface): 26 total codes; 21 raised on demand by this
   * suite's walks; 3 proven by dedicated e2e boots (hold expiry, the
   * ledger-only 503, the strict-tenancy 403); 1 boot-variant code; 1
   * honestly reserved.
   */
  it('accounts for every code of the combined surface', async () => {
    const response = await request(server).get('/errors-demo').set('x-demo-user', 'ada').expect(200)

    const entries = response.body.entries as { availability: string }[]
    const triggerable = response.body.triggerable as string[]
    const countOf = (availability: string): number =>
      entries.filter((entry) => entry.availability === availability).length

    expect(entries).toHaveLength(26)
    expect(triggerable).toHaveLength(21)
    expect(countOf('trigger')).toBe(21)
    expect(countOf('e2e-only')).toBe(3)
    expect(countOf('boot-variant')).toBe(1)
    expect(countOf('reserved')).toBe(1)
    expect(LIBRARY_TRIGGERS.length + APP_TRIGGERS.length + 2).toBe(triggerable.length)
  })
})
