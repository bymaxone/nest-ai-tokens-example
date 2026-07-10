/**
 * E2E proofs of the library's transaction guarantees (spec §4.3 contracts
 * 1, 3, and 5) against the real store.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: exactly ONE ledger row per command/embed call, ONE aggregate row
 * per batch embed (batch size recorded), truncated responses still debit
 * what the response reports, unparseable JSON never debits, and the
 * resourceId correlation lands in the persisted tags. Costs are exact
 * integer nano-USD end to end (the "fractional amounts" concern of the
 * drafted contract 3 reconciles to bigint math: the billed value on the
 * record equals the decimal string in the response, no rounding drift).
 * All counting goes through the SAME `LedgerService` port consumers use
 * (module ref), never raw SQL.
 * Mocks: none. One container stack per run; the suite runs single-worker.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { LedgerService } from '@bymax-one/nest-ai-tokens'
import type { LedgerFilter } from '@bymax-one/nest-ai-tokens'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import request from 'supertest'
import type { App } from 'supertest/types.js'

import { createApp } from '../../src/bootstrap.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

let container: StartedPostgreSqlContainer | undefined
let app: INestApplication | undefined
let server: App
let ledger: LedgerService

/** Container up, migrate, boot the production wiring (no listener). */
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
  server = app.getHttpServer() as App
  ledger = app.get(LedgerService)
})

/** App first (pools, timers), then the container; both guarded. */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

/** The caller every proof charges (ada at acme). */
const scopeFilter: Pick<LedgerFilter, 'tenantId' | 'scope'> = {
  tenantId: 'acme',
  scope: { type: 'user', id: 'ada' },
}

/** Row count for one feature through the consumer-facing ledger port. */
async function rowsFor(feature: string): Promise<number> {
  const summary = await ledger.sumCost({ ...scopeFilter, feature })
  return summary.records
}

describe('one transaction per call (contract 1; matrix row 43)', () => {
  const commandCalls = [
    {
      name: 'translate',
      url: '/workspace/translate',
      payload: { text: 'Guarantee one', targetLanguages: ['pt'], resourceId: 'doc-g1' },
      feature: 'workspace.translate',
    },
    {
      name: 'summarize',
      url: '/workspace/summarize',
      payload: { text: 'Guarantee two words', resourceId: 'doc-g2' },
      feature: 'workspace.summarize',
    },
    {
      name: 'rewrite',
      url: '/workspace/rewrite',
      payload: { text: 'Guarantee three', resourceId: 'doc-g3' },
      feature: 'workspace.rewrite',
    },
    {
      name: 'analyze',
      url: '/workspace/analyze',
      payload: { text: 'Guarantee four', resourceId: 'doc-g4' },
      feature: 'workspace.analyze',
    },
    {
      name: 'custom',
      url: '/workspace/custom',
      payload: { userPrompt: 'Guarantee five', resourceId: 'doc-g5' },
      feature: 'workspace.custom',
    },
    {
      name: 'embed',
      url: '/workspace/embed',
      payload: { text: 'Guarantee six', resourceId: 'doc-g6' },
      feature: 'workspace.embed',
    },
  ] as const

  /**
   * Per-call ledger delta of exactly one.
   *
   * Each command (and the single embed) appends EXACTLY one row, and the
   * row carries the response's model, token totals, exact billed cost,
   * and the resource tag: the record and the response tell one story.
   */
  it.each(commandCalls)('$name appends exactly one row', async ({ url, payload, feature }) => {
    const before = await rowsFor(feature)

    const response = await request(server)
      .post(url)
      .set('x-demo-user', 'ada')
      .send(payload)
      .expect(200)

    const after = await rowsFor(feature)
    const record = await ledger.findById(String(response.body.usage.transactionId))

    expect(after - before).toBe(1)
    expect(record).not.toBeNull()
    expect(record?.model).toBe(response.body.usage.model)
    expect(record?.totalTokens).toBe(response.body.usage.tokensUsed.total)
    expect(record?.billedCostNanoUsd.toString()).toBe(response.body.usage.cost.billedNanoUsd)
    expect(record?.tags).toContain(`resource:${payload.resourceId}`)
  })
})

describe('batch embeddings aggregate (contract 1; matrix row 47)', () => {
  /**
   * ONE aggregate row per batch with the batch size recorded.
   *
   * Five texts embed as one provider call and ONE ledger row whose tags
   * carry `batch-size:5` (the reconciled home of `metadata.batchSize`).
   */
  it('a 5-text batch appends exactly one row tagged batch-size:5', async () => {
    const before = await rowsFor('workspace.embed.batch')

    const response = await request(server)
      .post('/workspace/embed/batch')
      .set('x-demo-user', 'ada')
      .send({ texts: ['g1', 'g2', 'g3', 'g4', 'g5'], resourceId: 'doc-batch' })
      .expect(200)

    const after = await rowsFor('workspace.embed.batch')
    const record = await ledger.findById(String(response.body.usage.transactionId))

    expect(after - before).toBe(1)
    expect(record?.tags).toEqual(['resource:doc-batch', 'batch-size:5'])
  })
})

describe('truncated responses still debit (contract 5; matrix row 44)', () => {
  /**
   * Truncation: ledger +1 AND 502 provider.response_truncated.
   *
   * The cut response reports real usage, so the call debits what the
   * response reports BEFORE the error surfaces; the error's details name
   * the debiting transaction, and that record exists with the truncated
   * (smaller) token count.
   */
  it('translate under @@fail:truncate@@ debits then returns 502', async () => {
    const before = await rowsFor('workspace.translate')

    const response = await request(server)
      .post('/workspace/translate')
      .set('x-demo-user', 'ada')
      .send({ text: 'Cut me @@fail:truncate@@', targetLanguages: ['pt'], resourceId: 'doc-cut' })
      .expect(502)

    const after = await rowsFor('workspace.translate')
    const transactionId = response.body.error.details.transactionId as string
    const record = await ledger.findById(transactionId)

    expect(response.body.error.code).toBe('provider.response_truncated')
    expect(after - before).toBe(1)
    expect(record?.status).toBe('posted')
    expect(record?.outputTokens).toBeGreaterThan(0)
    expect(record?.tags).toContain('resource:doc-cut')
  })
})

describe('invalid JSON never debits (contract 5; matrix row 45)', () => {
  /**
   * Bad JSON: ledger +0 AND 502 provider.invalid_json.
   *
   * An unparseable analyze result is worthless, so NOTHING is recorded:
   * the delta is zero and the error carries no transaction reference.
   */
  it('analyze under @@fail:bad_json@@ returns 502 without a ledger row', async () => {
    const before = await rowsFor('workspace.analyze')

    const response = await request(server)
      .post('/workspace/analyze')
      .set('x-demo-user', 'ada')
      .send({ text: 'Break me @@fail:bad_json@@', resourceId: 'doc-bad' })
      .expect(502)

    const after = await rowsFor('workspace.analyze')

    expect(response.body.error.code).toBe('provider.invalid_json')
    expect(response.body.error.details).toBeUndefined()
    expect(after - before).toBe(0)
  })
})

describe('resourceId correlation (matrix row 52)', () => {
  /**
   * The resource tag is filterable through the ledger port.
   *
   * A call correlated to doc-row52 is retrievable by its tag via the same
   * `LedgerFilter.tags` predicate the ledger endpoints expose.
   */
  it('finds the record by its resource tag', async () => {
    const response = await request(server)
      .post('/workspace/rewrite')
      .set('x-demo-user', 'ada')
      .send({ text: 'Correlate me', resourceId: 'doc-row52' })
      .expect(200)

    const rows = await ledger.query({ ...scopeFilter, tags: ['resource:doc-row52'] })

    expect(rows.map((row) => row.id)).toContain(response.body.usage.transactionId)
    expect(rows).toHaveLength(1)
  })
})
