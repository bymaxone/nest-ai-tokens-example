/**
 * E2E tests for the workspace surface: the five command happy paths (plus
 * embeddings and the models info route), content determinism, and the
 * validation/identity boundaries.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: prove each endpoint returns its deterministic content with the
 * full cost breakdown and a transaction id, that repeated identical calls
 * return identical content and cost (while appending distinct ledger
 * rows), and that identity and validation reject before any metering.
 * Mocks: none. One container stack per run; the suite runs single-worker.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { LedgerService } from '@bymax-one/nest-ai-tokens'
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
})

/** App first (pools, timers), then the container; both guarded. */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

/** The usage-view shape every workspace response must embed. */
const usageShape = {
  transactionId: expect.any(String),
  model: expect.any(String),
  tokensUsed: {
    input: expect.any(Number),
    output: expect.any(Number),
    total: expect.any(Number),
  },
  cost: {
    rawNanoUsd: expect.stringMatching(/^\d+$/),
    billedNanoUsd: expect.stringMatching(/^\d+$/),
    formatted: expect.stringMatching(/^\$\d/),
  },
}

describe('workspace commands (happy paths)', () => {
  /**
   * Translate end to end (matrix row 37, scenario 1).
   *
   * The canned per-language translations arrive with the full usage view;
   * the model defaults to the flagship chat model.
   */
  it('POST /workspace/translate returns translations and the usage view', async () => {
    const response = await request(server)
      .post('/workspace/translate')
      .set('x-demo-user', 'ada')
      .send({ text: 'Hello world', targetLanguages: ['pt', 'es'], resourceId: 'doc-1' })
      .expect(200)

    expect(response.body).toEqual({
      resourceId: 'doc-1',
      translations: { pt: '[pt] HELLO WORLD', es: '[es] HELLO WORLD' },
      usage: usageShape,
    })
    expect(response.body.usage.model).toBe('mock-chat-pro')
  })

  /**
   * Summarize with the style picker (matrix row 39).
   *
   * The style-tagged summary arrives with the usage view.
   */
  it('POST /workspace/summarize returns the styled summary', async () => {
    const response = await request(server)
      .post('/workspace/summarize')
      .set('x-demo-user', 'ada')
      .send({ text: 'one two three four five', style: 'tldr', maxLength: 3 })
      .expect(200)

    expect(response.body.summary).toBe('[summary:tldr] TL;DR: one two three ...')
    expect(response.body.usage).toEqual(usageShape)
  })

  /**
   * Rewrite (matrix row 40).
   *
   * The style-tagged rewrite arrives with the usage view.
   */
  it('POST /workspace/rewrite returns the tagged rewrite', async () => {
    const response = await request(server)
      .post('/workspace/rewrite')
      .set('x-demo-user', 'ada')
      .send({ text: 'Hello there', style: 'formal' })
      .expect(200)

    expect(response.body.rewritten).toBe('[rewrite:formal] Hello there')
    expect(response.body.usage).toEqual(usageShape)
  })

  /**
   * Analyze with the fixed schema (matrix row 41).
   *
   * The typed sentiment/entities analysis arrives with the usage view.
   */
  it('POST /workspace/analyze returns the typed analysis', async () => {
    const response = await request(server)
      .post('/workspace/analyze')
      .set('x-demo-user', 'ada')
      .send({ text: 'Alice met Bob in Paris' })
      .expect(200)

    expect(response.body.analysis).toEqual({
      sentiment: expect.stringMatching(/^(negative|neutral|positive)$/),
      entities: ['Alice', 'Bob', 'Paris'],
    })
    expect(response.body.usage).toEqual(usageShape)
  })

  /**
   * Custom with model override (matrix rows 42, 51).
   *
   * The escape hatch echoes deterministically on the overridden model and
   * the usage view reports that model (pricing followed it).
   */
  it('POST /workspace/custom honors the model override', async () => {
    const response = await request(server)
      .post('/workspace/custom')
      .set('x-demo-user', 'ada')
      .send({ userPrompt: 'Say hi', model: 'mock-chat-lite' })
      .expect(200)

    expect(response.body.content).toBe('[mock:mock-chat-lite] Say hi')
    expect(response.body.usage.model).toBe('mock-chat-lite')
  })
})

describe('embeddings and models', () => {
  /**
   * Single embed end to end (matrix row 46).
   *
   * The deterministic 8-dimension unit vector arrives with the usage view
   * (prompt tokens only: embeddings produce no output tokens).
   */
  it('POST /workspace/embed returns the vector and the usage view', async () => {
    const response = await request(server)
      .post('/workspace/embed')
      .set('x-demo-user', 'ada')
      .send({ text: 'embed me', resourceId: 'doc-5' })
      .expect(200)

    expect(response.body.vector).toHaveLength(8)
    expect(response.body.usage).toEqual(usageShape)
    expect(response.body.usage.model).toBe('mock-embed')
    expect(response.body.usage.tokensUsed.output).toBe(0)
  })

  /**
   * Batch embed writes ONE aggregate record (contract 1, matrix row 47,
   * scenario 2).
   *
   * Five texts produce five vectors but exactly ONE new ledger row,
   * carrying the `batch-size:5` tag: counted through the same
   * `LedgerService` port consumers use, before and after the call.
   */
  it('POST /workspace/embed/batch writes exactly one aggregate ledger row', async () => {
    const ledger = (app as INestApplication).get(LedgerService)
    const filter = { tenantId: 'acme', feature: 'workspace.embed.batch' }
    const before = await ledger.sumCost(filter)

    const response = await request(server)
      .post('/workspace/embed/batch')
      .set('x-demo-user', 'ada')
      .send({ texts: ['a', 'b', 'c', 'd', 'e'], resourceId: 'doc-6' })
      .expect(200)

    const after = await ledger.sumCost(filter)
    const rows = await ledger.query(filter)
    const batchRow = rows.find((row) => row.id === response.body.usage.transactionId)

    expect(response.body.embeddings).toHaveLength(5)
    expect(response.body.batchSize).toBe(5)
    expect(after.records - before.records).toBe(1)
    expect(batchRow?.tags).toEqual(['resource:doc-6', 'batch-size:5'])
  })

  /**
   * Models info without an identity (matrix row 49).
   *
   * The read composes default models with current pricing badges and
   * needs no identity header (the unguarded read).
   */
  it('GET /workspace/models serves defaults and pricing identity-free', async () => {
    const response = await request(server).get('/workspace/models').expect(200)

    expect(response.body.command.model).toBe('mock-chat-pro')
    expect(response.body.command.models).toEqual(['mock-chat-pro', 'mock-chat-lite'])
    expect(response.body.command.pricing).toMatchObject({
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      inputNanoUsdPerMillion: '600000000',
      effectiveTo: null,
    })
    expect(response.body.embedding).toMatchObject({
      model: 'mock-embed',
      pricing: { operation: 'embeddings', inputNanoUsdPerMillion: '100000000' },
    })
  })
})

describe('determinism (repeated calls)', () => {
  /**
   * Same input, same content, same cost, DIFFERENT transactions.
   *
   * Two identical translate calls must return byte-identical content and
   * cost (the determinism invariant: pure function of the input) while appending
   * distinct ledger rows (contract 1: one transaction per call).
   */
  it('returns identical content and cost with distinct transaction ids', async () => {
    const payload = { text: 'Determinism check', targetLanguages: ['pt'], resourceId: 'doc-2' }
    const first = await request(server)
      .post('/workspace/translate')
      .set('x-demo-user', 'ada')
      .send(payload)
      .expect(200)
    const second = await request(server)
      .post('/workspace/translate')
      .set('x-demo-user', 'ada')
      .send(payload)
      .expect(200)

    expect(second.body.translations).toEqual(first.body.translations)
    expect(second.body.usage.tokensUsed).toEqual(first.body.usage.tokensUsed)
    expect(second.body.usage.cost).toEqual(first.body.usage.cost)
    expect(second.body.usage.transactionId).not.toBe(first.body.usage.transactionId)
  })
})

describe('boundaries', () => {
  /**
   * Identity requirement.
   *
   * Without a demo identity the command rejects 401 (metered endpoints
   * need a payer) through the exact production middleware + helper path.
   */
  it('rejects identity-less command calls with 401', async () => {
    await request(server)
      .post('/workspace/translate')
      .send({ text: 'Hi', targetLanguages: ['pt'] })
      .expect(401)
  })

  /**
   * Validation before metering.
   *
   * An unknown model rejects 400 through the global Zod pipe with the
   * value-free issue body (nothing reaches the provider or the ledger).
   */
  it('rejects an unknown model with the value-free 400 body', async () => {
    const response = await request(server)
      .post('/workspace/translate')
      .set('x-demo-user', 'ada')
      .send({ text: 'Hi', targetLanguages: ['pt'], model: 'gpt-4o' })
      .expect(400)

    expect(response.body.message).toBe('Validation failed')
    expect(JSON.stringify(response.body)).not.toContain('gpt-4o')
  })

  /**
   * Provider failure envelope.
   *
   * A throw marker surfaces the app's canonical error envelope with the
   * documented status, proving the failure-injection path end to end.
   */
  it('surfaces provider failures with the canonical envelope', async () => {
    const response = await request(server)
      .post('/workspace/summarize')
      .set('x-demo-user', 'ada')
      .send({ text: 'Hi @@fail:rate_limited@@' })
      .expect(429)

    expect(response.body).toEqual({
      error: {
        code: 'provider.rate_limited',
        message: expect.any(String),
        details: { marker: '@@fail:rate_limited@@' },
      },
    })
  })
})
