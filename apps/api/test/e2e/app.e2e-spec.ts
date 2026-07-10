/**
 * E2E tests for the phase's full surface: boot, hello, health probes (both
 * outcomes), identity branches, and the library wiring smoke route.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: prove the production wiring works end to end against a disposable
 * database, including the readiness failure path via a second boot against
 * an unreachable URL variant.
 * Mocks: none.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'

import { createApp } from '../../src/bootstrap.js'
import { startStack, stopStack } from './setup.js'
import type { E2eStack } from './setup.js'

let stack: E2eStack
let server: App

beforeAll(async () => {
  stack = await startStack()
  server = stack.app.getHttpServer() as App
})

afterAll(async () => {
  await stopStack(stack)
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
      const response = await request(downApp.getHttpServer() as App)
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
