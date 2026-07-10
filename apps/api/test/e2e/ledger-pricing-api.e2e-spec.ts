/**
 * E2E tests for the `/ledger` and `/pricing` REST surface.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres,
 * deterministic seed).
 * Goal: prove the read surface end to end against the seed plan: identity
 * gating (401), filter permutations with exact plan-computed expectations,
 * bounded pagination, ownership policy (403/404), and JSON-safe money
 * (bigint rendered as decimal strings).
 * Mocks: none. One container per spec file; the suite runs single-worker.
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

import { buildSeedPlan } from '../../prisma/seed-plan.js'
import { runSeed } from '../../prisma/seed-runner.js'
import { createApp } from '../../src/bootstrap.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI, which reads prisma.config.ts). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

const plan = buildSeedPlan()

/** The deterministic seed rows for one user scope within a tenant. */
function seededUserRows(tenantId: string, userId: string): typeof plan.usageRecords {
  return plan.usageRecords.filter(
    (row) => row.tenantId === tenantId && row.scopeType === 'user' && row.scopeId === userId,
  )
}

let container: StartedPostgreSqlContainer | undefined
let app: INestApplication | undefined
let server: App

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

/** Teardown order matters: app first (pools), then the container. */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

describe('GET /ledger/transactions', () => {
  /**
   * Identity gating.
   *
   * The ledger is identity-scoped; an anonymous request is rejected with
   * 401 before touching the database.
   */
  it('returns 401 without a demo identity', async () => {
    await request(server).get('/ledger/transactions').expect(401)
  })

  /**
   * Default page for a seeded user.
   *
   * ada's scope holds exactly her seeded rows; the response reports the
   * filter-wide total (SQL COUNT) while the page respects the default
   * bounded limit, and money renders as decimal strings.
   */
  it('lists the default page with the filter-wide total', async () => {
    const expected = seededUserRows('acme', 'ada')

    const response = await request(server)
      .get('/ledger/transactions')
      .set('x-demo-user', 'ada')
      .expect(200)

    expect(response.body.total).toBe(expected.length)
    expect(response.body.limit).toBe(20)
    expect(response.body.offset).toBe(0)
    expect(response.body.items).toHaveLength(20)
    for (const item of response.body.items as { billedCostNanoUsd: unknown; scope: unknown }[]) {
      expect(typeof item.billedCostNanoUsd).toBe('string')
      expect(item.scope).toEqual({ type: 'user', id: 'ada' })
    }
  })

  /**
   * Operation filter permutation.
   *
   * The embeddings slice of grace's history is plan-computable; the total
   * and every returned row must match it.
   */
  it('filters by operation', async () => {
    const expected = seededUserRows('acme', 'grace').filter((row) => row.operation === 'embeddings')

    const response = await request(server)
      .get('/ledger/transactions?operation=embeddings&limit=100')
      .set('x-demo-user', 'grace')
      .expect(200)

    expect(response.body.total).toBe(expected.length)
    expect(response.body.items).toHaveLength(expected.length)
  })

  /**
   * Inclusive date-window filter.
   *
   * A window pinned to one seeded row's exact occurredAt must include that
   * row (both bounds inclusive), with the total computed over the window.
   */
  it('filters by an inclusive date window', async () => {
    const rows = seededUserRows('globex', 'linus')
    const sample = rows[0]
    if (sample === undefined) throw new Error('seed plan must have linus rows')
    const at = new Date(sample.occurredAt ?? 0).toISOString()
    const expected = rows.filter((row) => new Date(row.occurredAt ?? 0).toISOString() === at).length

    const response = await request(server)
      .get(`/ledger/transactions?from=${at}&to=${at}&limit=100`)
      .set('x-demo-user', 'linus')
      .expect(200)

    expect(response.body.total).toBe(expected)
    expect((response.body.items as { id: string }[]).some((item) => item.id === sample.id)).toBe(
      true,
    )
  })

  /**
   * Pagination window.
   *
   * offset past most rows leaves the remainder; the total stays
   * filter-wide, proving limit/offset never distort the count.
   */
  it('honors limit and offset while keeping the total filter-wide', async () => {
    const expected = seededUserRows('acme', 'ada')

    const response = await request(server)
      .get(`/ledger/transactions?limit=10&offset=${expected.length - 3}`)
      .set('x-demo-user', 'ada')
      .expect(200)

    expect(response.body.total).toBe(expected.length)
    expect(response.body.items).toHaveLength(3)
  })

  /**
   * Status filter.
   *
   * The seed writes only posted rows, so a pending-only filter matches
   * nothing (and proves the status list reaches the store).
   */
  it('filters by lifecycle status', async () => {
    const response = await request(server)
      .get('/ledger/transactions?status=pending')
      .set('x-demo-user', 'ada')
      .expect(200)

    expect(response.body.total).toBe(0)
    expect(response.body.items).toHaveLength(0)
  })

  /**
   * Tenant isolation.
   *
   * The same user id under a different tenant header sees nothing: the
   * filter pins tenant AND user scope, so cross-tenant listing is
   * impossible by construction.
   */
  it('isolates tenants when the tenant header overrides', async () => {
    const response = await request(server)
      .get('/ledger/transactions')
      .set('x-demo-user', 'ada')
      .set('x-tenant-id', 'globex')
      .expect(200)

    expect(response.body.total).toBe(0)
  })

  /**
   * Validation rejections.
   *
   * Out-of-bounds pagination, unknown enum values, and inverted date
   * windows are 400s from the Zod pipe with value-free issue bodies.
   */
  it.each([
    ['a zero limit', '/ledger/transactions?limit=0'],
    ['an oversized limit', '/ledger/transactions?limit=101'],
    ['an unknown operation', '/ledger/transactions?operation=telepathy'],
    [
      'an inverted date window',
      '/ledger/transactions?from=2026-06-01T00:00:00Z&to=2026-05-01T00:00:00Z',
    ],
  ])('rejects %s with 400', async (_label, url) => {
    const response = await request(server).get(url).set('x-demo-user', 'ada').expect(400)

    expect(response.body.message).toBe('Validation failed')
  })
})

describe('GET /ledger/transactions/:id', () => {
  /**
   * Owner detail.
   *
   * The owner sees the full payload with string money and the metadata
   * fields the inspector renders.
   */
  it('returns the full record to its owner', async () => {
    const sample = seededUserRows('acme', 'ada')[0]
    if (sample === undefined) throw new Error('seed plan must have ada rows')

    const response = await request(server)
      .get(`/ledger/transactions/${sample.id}`)
      .set('x-demo-user', 'ada')
      .expect(200)

    expect(response.body.id).toBe(sample.id)
    expect(response.body.billedCostNanoUsd).toBe(String(sample.billedCostNanoUsd))
    expect(response.body.tenantId).toBe('acme')
  })

  /**
   * Foreign owner.
   *
   * Another user's row is 403 (app-level ownership policy), even within
   * the same tenant.
   */
  it('returns 403 for a foreign row', async () => {
    const sample = seededUserRows('acme', 'ada')[0]
    if (sample === undefined) throw new Error('seed plan must have ada rows')

    await request(server)
      .get(`/ledger/transactions/${sample.id}`)
      .set('x-demo-user', 'grace')
      .expect(403)
  })

  /**
   * Unknown id.
   *
   * A clean 404; the requested id is not echoed back.
   */
  it('returns 404 for an unknown id', async () => {
    const response = await request(server)
      .get('/ledger/transactions/does-not-exist')
      .set('x-demo-user', 'ada')
      .expect(404)

    expect(JSON.stringify(response.body)).not.toContain('does-not-exist')
  })

  /**
   * Identity gating.
   *
   * Anonymous detail probes are 401 (ids cannot be enumerated without an
   * identity).
   */
  it('returns 401 without a demo identity', async () => {
    await request(server).get('/ledger/transactions/seed-usage-0001').expect(401)
  })
})
