/**
 * E2E tests for the phase's full surface: boot, hello, health probes (both
 * outcomes), identity branches, and the library wiring smoke route.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: prove the production wiring works end to end against a disposable
 * database with random host ports (never a fixed host port; local 5432 may
 * be occupied by unrelated stacks), including the readiness failure path
 * via a second boot against an unreachable URL variant.
 * Mocks: none. One container stack per run; the suite runs single-worker.
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

import { listenLocal } from './listen-local.js'
import { createApp } from '../../src/bootstrap.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI, which reads prisma.config.ts). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

let container: StartedPostgreSqlContainer | undefined
let app: INestApplication | undefined
let server: App

/**
 * Stack lifecycle: container up, `prisma migrate deploy` against its random
 * mapped port, then the production wiring booted through the real
 * `createApp()` seam (no listener; supertest drives the HTTP server).
 */
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
  server = await listenLocal(app)
})

/**
 * Teardown order matters: app first (pools, reaper timer), then container.
 * Both steps are guarded so a failed `beforeAll` (container, migration, or
 * boot) cannot mask its own error with an undefined access here, and the
 * container is stopped even when closing the app throws.
 */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

describe('boot and hello', () => {
  /**
   * Boot proof + root route.
   *
   * The real module graph (config, identity, library registration, health)
   * boots against the container and serves the JSON hello.
   */
  it('GET / returns the hello naming the example', async () => {
    const response = await request(server).get('/').expect(200)

    expect(response.body).toMatchObject({
      name: 'nest-ai-tokens-example',
      library: '@bymax-one/nest-ai-tokens',
    })
  })
})

describe('health probes', () => {
  /**
   * Liveness.
   *
   * /health/live answers up without touching the database.
   */
  it('GET /health/live returns 200 up', async () => {
    const response = await request(server).get('/health/live').expect(200)

    expect(response.body).toEqual({ status: 'up' })
  })

  /**
   * Readiness against a reachable database.
   *
   * The migrated container answers SELECT 1: 200 up.
   */
  it('GET /health/ready returns 200 up with the database reachable', async () => {
    const response = await request(server).get('/health/ready').expect(200)

    expect(response.body).toEqual({ status: 'up' })
  })

  /**
   * Identity exclusion of the health tree.
   *
   * Health probes must work for orchestrators that send no identity, and
   * must ignore identity headers entirely (an unknown user is not rejected
   * here, proving the exclude pattern).
   */
  it('health routes bypass the identity middleware', async () => {
    await request(server).get('/health/live').set('x-demo-user', 'not-a-user').expect(200)
  })

  /**
   * Readiness failure path (bad-URL boot variant).
   *
   * A second application booted against an unreachable database URL must
   * answer 503 with the value-free down body, proving the probe actually
   * reflects connectivity rather than always succeeding.
   */
  it('GET /health/ready returns 503 down when the database is unreachable', async () => {
    const saved = process.env.DATABASE_URL
    // TCP port 9 (discard) refuses immediately on localhost.
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:9/ai_tokens_example'
    let downApp: INestApplication | undefined
    try {
      downApp = await createApp()
      const response = await request(await listenLocal(downApp))
        .get('/health/ready')
        .expect(503)
      expect(response.body).toEqual({ status: 'down', reason: 'database unreachable' })
    } finally {
      process.env.DATABASE_URL = saved
      if (downApp !== undefined) await downApp.close()
    }
  })
})

describe('demo identity', () => {
  /**
   * Unknown demo user rejection.
   *
   * The 401 body lists the valid demo users and never echoes the received
   * header value.
   */
  it('GET / with an unknown x-demo-user returns 401 listing valid users', async () => {
    const response = await request(server).get('/').set('x-demo-user', 'mallory').expect(401)

    expect(response.body.validUsers).toEqual(['ada', 'grace', 'linus', 'root'])
    expect(JSON.stringify(response.body)).not.toContain('mallory')
  })

  /**
   * Known demo user acceptance.
   *
   * A registered identity flows through to the handler (200 hello).
   */
  it('GET / with a known x-demo-user returns 200', async () => {
    await request(server).get('/').set('x-demo-user', 'ada').expect(200)
  })

  /**
   * Unauthenticated passthrough.
   *
   * Without the header the request proceeds (identity stays optional at
   * this layer; enforcement decides later per route).
   */
  it('GET / without identity headers returns 200', async () => {
    await request(server).get('/').expect(200)
  })
})

describe('CORS', () => {
  /**
   * Allowed-origin reflection.
   *
   * The dashboard calls this API cross-origin; a request whose `Origin` is on
   * the configured allow-list (the `http://localhost:3000` default here) must
   * come back with a matching `Access-Control-Allow-Origin`, without which the
   * browser discards the response as a `TypeError: Failed to fetch`.
   */
  it('reflects an allowed Origin on a simple request', async () => {
    const response = await request(server)
      .get('/')
      .set('Origin', 'http://localhost:3000')
      .expect(200)

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000')
  })

  /**
   * Preflight grant for the demo identity headers.
   *
   * A browser preflights the custom `x-demo-user` / `x-tenant-id` identity
   * headers; the preflight must succeed and echo them as allowed, or the real
   * request never fires.
   */
  it('answers a preflight and allows the demo identity headers', async () => {
    const response = await request(server)
      .options('/')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'x-demo-user')
      .expect(204)

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000')
    expect(response.headers['access-control-allow-headers']?.toLowerCase()).toContain('x-demo-user')
  })

  /**
   * Disallowed-origin denial.
   *
   * An origin absent from the allow-list receives no CORS grant, so a page
   * served from an untrusted origin cannot read this API's responses.
   */
  it('sends no CORS grant to an origin outside the allow-list', async () => {
    const response = await request(server).get('/').set('Origin', 'http://evil.example').expect(200)

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('library wiring', () => {
  /**
   * Registration smoke.
   *
   * /health/wiring proves the container resolved the library services and
   * reports the effective options driven by the environment defaults.
   */
  it('GET /health/wiring reports the registered module and effective options', async () => {
    const response = await request(server).get('/health/wiring').expect(200)

    expect(response.body).toEqual({
      registered: true,
      currency: 'USD',
      ratingMode: 'rate-table',
      pricingCacheTtlMs: 300_000,
      pricingStrict: true,
      walletsEnabled: true,
      budgetsEnabled: true,
      loggerBound: false,
    })
  })
})
