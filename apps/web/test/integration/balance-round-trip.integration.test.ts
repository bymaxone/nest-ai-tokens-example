/**
 * @fileoverview The live round-trip smoke: the typed api client's
 * `getBalance()` against a REAL running api (Testcontainers Postgres, the
 * production `createApp()` boot seam, a real listening HTTP server; no
 * mocks). Proves the Overview page's live wiring end to end, and that
 * `apps/web` only ever needs the `./shared` subpath to talk to a real
 * server — never the host port 5432 (a container's random mapped port).
 *
 * Layer: integration (real server, real database, no seed data).
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ApiClient } from '../../src/lib/api-client.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The api package root (cwd for the Prisma CLI; it reads prisma.config.ts). */
const API_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../api')

/**
 * The narrow slice of Nest's `INestApplication` this smoke needs. Kept
 * local (rather than importing `@nestjs/common`, an apps/api-only
 * dependency) so this package's typecheck never has to resolve into the
 * api package's module graph.
 */
interface LiveNestApp {
  listen(port: number): Promise<unknown>
  getUrl(): Promise<string>
  close(): Promise<unknown>
}

/** The api's boot seam module shape this smoke dynamically imports. */
interface ApiBootstrapModule {
  createApp(): Promise<LiveNestApp>
}

let container: StartedPostgreSqlContainer | undefined
let app: LiveNestApp | undefined
let client: ApiClient

/**
 * Stack lifecycle: container up, `prisma migrate deploy` against its random
 * mapped port, the production api booted through the real `createApp()`
 * seam and listening on an OS-assigned port (never the host's 5432).
 */
beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('ai_tokens_example')
    .start()
  const databaseUrl = container.getConnectionUri()
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  })
  process.env['DATABASE_URL'] = databaseUrl

  // Cross-package import of the api's boot seam. The specifier is built at
  // runtime ON PURPOSE: a static relative import would pull the api's whole
  // source graph into this package's typecheck (incompatible compiler
  // settings), while the runtime path keeps the graphs separate. Vitest's
  // runner still maps the .js specifier onto the .ts source, which this
  // integration run itself proves on every execution. Typed locally (see
  // ApiBootstrapModule) rather than via `typeof import(...)`.
  const bootstrap = (await import(
    /* @vite-ignore */ path.join(API_ROOT, 'src/bootstrap.js')
  )) as ApiBootstrapModule
  app = await bootstrap.createApp()
  await app.listen(0)

  client = new ApiClient({
    baseUrl: await app.getUrl(),
    headerProvider: () => ({ 'x-demo-user': 'ada', 'x-tenant-id': 'acme' }),
  })
})

/**
 * Teardown order matters: app first (pools, reaper timer), then container.
 */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

describe('the Overview balance round-trip', () => {
  // scenario: the typed client calls a real, listening api and gets back a well-formed balance.
  it('fetches the balance through the typed client against a live server', async () => {
    const balance = await client.getBalance()
    expect(typeof balance.nanoUsd).toBe('string')
    expect(typeof balance.credits).toBe('number')
    expect(balance.formatted).toMatch(/^\$/)
  })
})
