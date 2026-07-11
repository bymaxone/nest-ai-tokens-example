/**
 * E2E route-inventory and error-code completeness gates.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: hold the whole documented surface accountable. ROUTE_INVENTORY
 * lists every HTTP route the application serves with a probe exercising
 * its happy path plus its main failure; a completeness assertion diffs the
 * inventory against the routes the LIVE Express router actually registered
 * (both directions), so adding a route without an inventory entry, or
 * documenting a route that no longer exists, fails this suite. A second
 * gate walks the error catalog and asserts every code is named by at least
 * one e2e source file, so no catalog code can silently lose its proof.
 * Mocks: none. One container stack per run; the suite runs single-worker.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import request from 'supertest'
import type { App } from 'supertest/types.js'

import { listenLocal } from './listen-local.js'
import { runSeed } from '../../prisma/seed-runner.js'
import { createApp } from '../../src/bootstrap.js'
import type { ErrorCatalogEntry } from '../../src/errors-demo/error-catalog.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The directory holding every e2e source (scanned by the code gate). */
const E2E_DIR = path.dirname(fileURLToPath(import.meta.url))

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
  server = await listenLocal(app)
})

/** App first (pools, timers), then the container; both guarded. */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

/** One inventory row: a served route and the probe proving its contract. */
interface RouteProbe {
  /** The HTTP method exactly as registered. */
  readonly method: 'GET' | 'POST' | 'PUT'
  /** The Express path template exactly as registered. */
  readonly path: string
  /** Exercises the happy path plus the route's main failure. */
  readonly probe: () => Promise<void>
}

/** A valid pricing update body (all three chat rates, admin plane). */
const PRICING_UPDATE_BODY = {
  provider: 'mock',
  operation: 'chat',
  inputNanoUsdPerMillion: '710000000',
  outputNanoUsdPerMillion: '2810000000',
  reasoningNanoUsdPerMillion: '2810000000',
}

/**
 * Every route the application serves, in a state-safe walking order.
 * The completeness test below diffs this list against the live router,
 * so a route missing here is a FAILING TEST, not an oversight.
 */
const ROUTE_INVENTORY: readonly RouteProbe[] = [
  {
    method: 'GET',
    path: '/',
    // Identity-free hello naming the example and the library under test.
    probe: async () => {
      const response = await request(server).get('/').expect(200)
      expect(response.body.library).toBe('@bymax-one/nest-ai-tokens')
    },
  },
  {
    method: 'GET',
    path: '/health/live',
    // Liveness is unconditional.
    probe: async () => {
      await request(server).get('/health/live').expect(200)
    },
  },
  {
    method: 'GET',
    path: '/health/ready',
    // Readiness proves the database round-trip.
    probe: async () => {
      await request(server).get('/health/ready').expect(200)
    },
  },
  {
    method: 'GET',
    path: '/health/wiring',
    // The wiring report names the registered library module.
    probe: async () => {
      const response = await request(server).get('/health/wiring').expect(200)
      expect(response.body.registered).toBe(true)
    },
  },
  {
    method: 'GET',
    path: '/workspace/models',
    // The models read is deliberately unmetered and identity-free.
    probe: async () => {
      const response = await request(server).get('/workspace/models').expect(200)
      expect(Array.isArray(response.body.command.models)).toBe(true)
    },
  },
  {
    method: 'POST',
    path: '/workspace/translate',
    // Happy translate; empty body 400; identity-less 401.
    probe: async () => {
      const response = await request(server)
        .post('/workspace/translate')
        .set('x-demo-user', 'ada')
        .send({ text: 'Inventory walk', targetLanguages: ['pt'] })
        .expect(200)
      expect(response.body.usage.transactionId).toEqual(expect.any(String))
      await request(server)
        .post('/workspace/translate')
        .set('x-demo-user', 'ada')
        .send({})
        .expect(400)
      await request(server).post('/workspace/translate').send({ text: 'x' }).expect(401)
    },
  },
  {
    method: 'POST',
    path: '/workspace/summarize',
    // Happy summarize; empty body 400.
    probe: async () => {
      await request(server)
        .post('/workspace/summarize')
        .set('x-demo-user', 'ada')
        .send({ text: 'one two three four five', style: 'tldr', maxLength: 3 })
        .expect(200)
      await request(server)
        .post('/workspace/summarize')
        .set('x-demo-user', 'ada')
        .send({})
        .expect(400)
    },
  },
  {
    method: 'POST',
    path: '/workspace/rewrite',
    // Happy rewrite; empty body 400.
    probe: async () => {
      await request(server)
        .post('/workspace/rewrite')
        .set('x-demo-user', 'ada')
        .send({ text: 'Hello there', style: 'formal' })
        .expect(200)
      await request(server)
        .post('/workspace/rewrite')
        .set('x-demo-user', 'ada')
        .send({})
        .expect(400)
    },
  },
  {
    method: 'POST',
    path: '/workspace/analyze',
    // Happy analyze; empty body 400.
    probe: async () => {
      await request(server)
        .post('/workspace/analyze')
        .set('x-demo-user', 'ada')
        .send({ text: 'Alice met Bob in Paris' })
        .expect(200)
      await request(server)
        .post('/workspace/analyze')
        .set('x-demo-user', 'ada')
        .send({})
        .expect(400)
    },
  },
  {
    method: 'POST',
    path: '/workspace/custom',
    // Happy custom prompt; empty body 400.
    probe: async () => {
      await request(server)
        .post('/workspace/custom')
        .set('x-demo-user', 'ada')
        .send({ userPrompt: 'Say hi', model: 'mock-chat-lite' })
        .expect(200)
      await request(server).post('/workspace/custom').set('x-demo-user', 'ada').send({}).expect(400)
    },
  },
  {
    method: 'POST',
    path: '/workspace/embed',
    // Happy single embedding; empty body 400.
    probe: async () => {
      await request(server)
        .post('/workspace/embed')
        .set('x-demo-user', 'ada')
        .send({ text: 'embed me' })
        .expect(200)
      await request(server).post('/workspace/embed').set('x-demo-user', 'ada').send({}).expect(400)
    },
  },
  {
    method: 'POST',
    path: '/workspace/embed/batch',
    // Happy batch embedding; empty body 400.
    probe: async () => {
      await request(server)
        .post('/workspace/embed/batch')
        .set('x-demo-user', 'ada')
        .send({ texts: ['a', 'b'] })
        .expect(200)
      await request(server)
        .post('/workspace/embed/batch')
        .set('x-demo-user', 'ada')
        .send({})
        .expect(400)
    },
  },
  {
    method: 'GET',
    path: '/ledger/transactions',
    // Happy list; identity-less 401.
    probe: async () => {
      const response = await request(server)
        .get('/ledger/transactions')
        .set('x-demo-user', 'ada')
        .expect(200)
      expect(Array.isArray(response.body.items)).toBe(true)
      await request(server).get('/ledger/transactions').expect(401)
    },
  },
  {
    method: 'GET',
    path: '/ledger/transactions/:id',
    // Happy read of an owned row; unknown id 404.
    probe: async () => {
      const list = await request(server)
        .get('/ledger/transactions')
        .set('x-demo-user', 'ada')
        .expect(200)
      const id = String(list.body.items[0].id)
      const row = await request(server)
        .get(`/ledger/transactions/${id}`)
        .set('x-demo-user', 'ada')
        .expect(200)
      expect(row.body.id).toBe(id)
      await request(server)
        .get('/ledger/transactions/does-not-exist')
        .set('x-demo-user', 'ada')
        .expect(404)
    },
  },
  {
    method: 'POST',
    path: '/ledger/credits',
    // Happy top-up; zero amount 400; identity-less 401.
    probe: async () => {
      await request(server)
        .post('/ledger/credits')
        .set('x-demo-user', 'ada')
        .send({ amountNanoUsd: '1000000000', type: 'purchase' })
        .expect(201)
      await request(server)
        .post('/ledger/credits')
        .set('x-demo-user', 'ada')
        .send({ amountNanoUsd: '0', type: 'purchase' })
        .expect(400)
      await request(server)
        .post('/ledger/credits')
        .send({ amountNanoUsd: '1', type: 'purchase' })
        .expect(401)
    },
  },
  {
    method: 'POST',
    path: '/ledger/refund',
    // A fresh metered call is refunded once (201); the repeat is 409.
    probe: async () => {
      const call = await request(server)
        .post('/workspace/translate')
        .set('x-demo-user', 'linus')
        .send({ text: 'Refund me', targetLanguages: ['pt'] })
        .expect(200)
      const transactionId = String(call.body.usage.transactionId)
      const refund = await request(server)
        .post('/ledger/refund')
        .set('x-demo-user', 'linus')
        .send({ transactionId, reason: 'inventory walk' })
        .expect(201)
      expect(refund.body.originalTransactionId).toBe(transactionId)
      const conflict = await request(server)
        .post('/ledger/refund')
        .set('x-demo-user', 'linus')
        .send({ transactionId })
        .expect(409)
      expect(conflict.body.error.code).toBe('AI_TOKENS_IDEMPOTENCY_CONFLICT')
    },
  },
  {
    method: 'GET',
    path: '/usage/balance',
    // Happy balance read; identity-less 401.
    probe: async () => {
      const response = await request(server)
        .get('/usage/balance')
        .set('x-demo-user', 'ada')
        .expect(200)
      expect(response.body.nanoUsd).toMatch(/^\d+$/)
      await request(server).get('/usage/balance').expect(401)
    },
  },
  {
    method: 'GET',
    path: '/usage/by-period',
    // Defaults resolve the window; an inverted window is 400.
    probe: async () => {
      await request(server).get('/usage/by-period').set('x-demo-user', 'ada').expect(200)
      await request(server)
        .get('/usage/by-period')
        .query({ from: '2026-02-01', to: '2026-01-01' })
        .set('x-demo-user', 'ada')
        .expect(400)
    },
  },
  {
    method: 'GET',
    path: '/usage/by-type',
    // Happy grouped read with defaults.
    probe: async () => {
      await request(server).get('/usage/by-type').set('x-demo-user', 'ada').expect(200)
    },
  },
  {
    method: 'GET',
    path: '/usage/by-model',
    // Happy grouped read with defaults.
    probe: async () => {
      await request(server).get('/usage/by-model').set('x-demo-user', 'ada').expect(200)
    },
  },
  {
    method: 'GET',
    path: '/usage/top-consumers',
    // Happy leaderboard read with defaults.
    probe: async () => {
      await request(server).get('/usage/top-consumers').set('x-demo-user', 'ada').expect(200)
    },
  },
  {
    method: 'GET',
    path: '/usage/system-costs',
    // Happy system-cost read with defaults.
    probe: async () => {
      await request(server).get('/usage/system-costs').set('x-demo-user', 'ada').expect(200)
    },
  },
  {
    method: 'POST',
    path: '/system-jobs/reindex',
    // Admin happy path; non-admin 403.
    probe: async () => {
      await request(server)
        .post('/system-jobs/reindex')
        .set('x-demo-user', 'root')
        .set('x-tenant-id', 'acme')
        .send({ count: 2 })
        .expect(201)
      await request(server)
        .post('/system-jobs/reindex')
        .set('x-demo-user', 'ada')
        .send({})
        .expect(403)
    },
  },
  {
    method: 'POST',
    path: '/system-jobs/agent-decision',
    // Happy decision record; out-of-range confidence 400.
    probe: async () => {
      await request(server)
        .post('/system-jobs/agent-decision')
        .set('x-demo-user', 'ada')
        .send({
          decisionId: 'dec-inventory-001',
          strategy: 'inventory.walk',
          confidence: 0.5,
          reasoning: 'route inventory probe',
        })
        .expect(201)
      await request(server)
        .post('/system-jobs/agent-decision')
        .set('x-demo-user', 'ada')
        .send({
          decisionId: 'dec-inventory-002',
          strategy: 'inventory.walk',
          confidence: 1.5,
          reasoning: 'route inventory probe',
        })
        .expect(400)
    },
  },
  {
    method: 'GET',
    path: '/errors-demo',
    // Happy catalog read; identity-less 401.
    probe: async () => {
      const response = await request(server)
        .get('/errors-demo')
        .set('x-demo-user', 'ada')
        .expect(200)
      expect(Array.isArray(response.body.entries)).toBe(true)
      await request(server).get('/errors-demo').expect(401)
    },
  },
  {
    method: 'POST',
    path: '/errors-demo/helpers/backdated-cost',
    // Happy historical pricing; empty body 400.
    probe: async () => {
      await request(server)
        .post('/errors-demo/helpers/backdated-cost')
        .set('x-demo-user', 'ada')
        .send({
          model: 'mock-chat-pro',
          promptTokens: 1000,
          completionTokens: 1000,
          date: '2026-01-15T00:00:00.000Z',
        })
        .expect(200)
      await request(server)
        .post('/errors-demo/helpers/backdated-cost')
        .set('x-demo-user', 'ada')
        .send({})
        .expect(400)
    },
  },
  {
    method: 'POST',
    path: '/errors-demo/:code',
    // Always-error by design: a known code raises itself; unknown is 404.
    probe: async () => {
      const raised = await request(server)
        .post('/errors-demo/provider.rate_limited')
        .set('x-demo-user', 'ada')
        .expect(429)
      expect(raised.body.error.code).toBe('provider.rate_limited')
      await request(server).post('/errors-demo/no.such_code').set('x-demo-user', 'ada').expect(404)
    },
  },
  {
    method: 'POST',
    path: '/quota/lab/constant',
    // Prompt-less happy path (DTO defaults); identity-less 401.
    probe: async () => {
      await request(server)
        .post('/quota/lab/constant')
        .set('x-demo-user', 'ada')
        .send({})
        .expect(200)
      await request(server).post('/quota/lab/constant').send({}).expect(401)
    },
  },
  {
    method: 'POST',
    path: '/quota/lab/model-based',
    // Prompt-less happy path (DTO defaults); identity-less 401.
    probe: async () => {
      await request(server)
        .post('/quota/lab/model-based')
        .set('x-demo-user', 'ada')
        .send({})
        .expect(200)
      await request(server).post('/quota/lab/model-based').send({}).expect(401)
    },
  },
  {
    method: 'GET',
    path: '/quota/status',
    // Happy combined status; identity-less 401.
    probe: async () => {
      const response = await request(server)
        .get('/quota/status')
        .set('x-demo-user', 'ada')
        .expect(200)
      expect(typeof response.body.hasAccess).toBe('boolean')
      await request(server).get('/quota/status').expect(401)
    },
  },
  {
    method: 'POST',
    path: '/quota/budgets',
    // Admin happy path (an off-feature budget); non-admin 403.
    probe: async () => {
      await request(server)
        .post('/quota/budgets')
        .set('x-demo-user', 'root')
        .set('x-tenant-id', 'acme')
        .send({
          scopeType: 'user',
          scopeId: 'grace',
          limitCount: 999,
          window: 'month',
          policy: 'block',
          features: ['inventory.probe'],
        })
        .expect(201)
      await request(server)
        .post('/quota/budgets')
        .set('x-demo-user', 'ada')
        .send({ scopeType: 'user', scopeId: 'ada', limitCount: 1 })
        .expect(403)
    },
  },
  {
    method: 'GET',
    path: '/quota/budgets',
    // Happy caller-scoped listing; identity-less 401.
    probe: async () => {
      const response = await request(server)
        .get('/quota/budgets')
        .set('x-demo-user', 'ada')
        .expect(200)
      expect(Array.isArray(response.body.budgets)).toBe(true)
      await request(server).get('/quota/budgets').expect(401)
    },
  },
  {
    method: 'GET',
    path: '/pricing',
    // The catalog read is identity-free by design.
    probe: async () => {
      const response = await request(server).get('/pricing').expect(200)
      expect(Array.isArray(response.body.items)).toBe(true)
    },
  },
  {
    method: 'GET',
    path: '/pricing/:model/history',
    // Happy history read; a provider-less query is 400.
    probe: async () => {
      await request(server).get('/pricing/mock-chat-pro/history?provider=mock').expect(200)
      await request(server).get('/pricing/mock-chat-pro/history').expect(400)
    },
  },
  {
    method: 'PUT',
    path: '/pricing/:model',
    // Admin happy path (new price window); non-admin 403; anonymous 401.
    probe: async () => {
      const response = await request(server)
        .put('/pricing/mock-chat-pro')
        .set('x-demo-user', 'root')
        .send(PRICING_UPDATE_BODY)
        .expect(200)
      expect(response.body.inputNanoUsdPerMillion).toBe(PRICING_UPDATE_BODY.inputNanoUsdPerMillion)
      await request(server)
        .put('/pricing/mock-chat-pro')
        .set('x-demo-user', 'ada')
        .send(PRICING_UPDATE_BODY)
        .expect(403)
      await request(server).put('/pricing/mock-chat-pro').send(PRICING_UPDATE_BODY).expect(401)
    },
  },
]

/** The narrow slice of the Express router this suite introspects. */
interface ExpressRouteLayer {
  readonly route?: {
    readonly path: string | readonly string[]
    readonly methods: Readonly<Record<string, boolean>>
  }
}

/** The narrow slice of the Express application exposing its router. */
interface ExpressWithRouter {
  readonly router: { readonly stack: readonly ExpressRouteLayer[] }
}

/**
 * Narrow an unknown HTTP adapter instance to the Express router slice.
 *
 * @param value The adapter instance returned by Nest.
 * @returns Whether the instance exposes an Express router stack.
 */
function hasRouter(value: unknown): value is ExpressWithRouter {
  if (typeof value !== 'function' && (typeof value !== 'object' || value === null)) return false
  // The Express 5 router is itself a callable middleware (a function
  // carrying its layer stack), so only the stack array is asserted.
  const router = (value as Partial<ExpressWithRouter>).router
  if (router === undefined || router === null) return false
  return Array.isArray(router.stack)
}

/**
 * Every `METHOD path` combination the live Express router registered.
 *
 * @param application The booted Nest application.
 * @returns The sorted, de-duplicated route signatures.
 */
function registeredRoutes(application: INestApplication): string[] {
  const instance: unknown = application.getHttpAdapter().getInstance()
  if (!hasRouter(instance)) throw new Error('expected an Express instance exposing a router stack')
  const signatures = new Set<string>()
  for (const layer of instance.router.stack) {
    if (layer.route === undefined) continue
    const paths = typeof layer.route.path === 'string' ? [layer.route.path] : layer.route.path
    for (const routePath of paths) {
      for (const method of Object.keys(layer.route.methods)) {
        signatures.add(`${method.toUpperCase()} ${routePath}`)
      }
    }
  }
  return [...signatures].sort()
}

describe('route inventory walk', () => {
  it.each(ROUTE_INVENTORY)(
    /**
     * Each inventory row exercises its route's documented contract: the
     * happy path plus the main failure (validation 400, identity 401,
     * role 403, missing resource 404, or conflict 409 per row).
     */
    '$method $path answers its documented contract',
    async ({ probe }) => {
      await probe()
    },
  )
})

describe('route inventory completeness', () => {
  /**
   * The inventory IS the router, both directions.
   *
   * Diffing the inventory against the live Express registration means a
   * new controller route without an inventory probe fails here (never an
   * oversight), and so does an inventory row for a removed route.
   */
  it('matches the live router registration exactly', () => {
    if (app === undefined) throw new Error('app must be booted')
    const documented = ROUTE_INVENTORY.map((row) => `${row.method} ${row.path}`).sort()
    expect(new Set(documented).size).toBe(documented.length)
    expect(registeredRoutes(app)).toEqual(documented)
  })
})

describe('error-code proof completeness', () => {
  /**
   * Every catalog code is named by at least one e2e source.
   *
   * The trigger walk lives in the errors-demo suite, boot-variant and
   * e2e-only codes in their dedicated suites; scanning the e2e sources for
   * each code name guarantees a catalog code can never silently lose its
   * proof. The catalog split (21 trigger / 3 e2e-only / 1 boot-variant /
   * 1 reserved, 26 total) is asserted end to end by the errors-demo suite.
   */
  it('finds every catalog code in the e2e sources', async () => {
    const response = await request(server).get('/errors-demo').set('x-demo-user', 'ada').expect(200)
    const entries = response.body.entries as ErrorCatalogEntry[]
    expect(entries).toHaveLength(26)

    const sources = readdirSync(E2E_DIR)
      .filter((file) => file.endsWith('.e2e-spec.ts') && !file.startsWith('inventory'))
      .map((file) => readFileSync(path.join(E2E_DIR, file), 'utf8'))
      .join('\n')
    const unproven = entries.map((entry) => entry.code).filter((code) => !sources.includes(code))
    expect(unproven).toEqual([])
  })
})
