/**
 * E2E stack helper: one Testcontainers Postgres per run, migrated via the
 * Prisma CLI, plus the production application booted through the real
 * `createApp()` seam.
 *
 * Layer: e2e infrastructure.
 * Goal: give every spec the exact production wiring against a disposable
 * database with random host ports (never a fixed host port; local 5432 may
 * be occupied by unrelated stacks).
 * Mocks: none.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { INestApplication } from '@nestjs/common'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import { createApp } from '../../src/bootstrap.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI, which reads prisma.config.ts). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The running e2e stack. */
export interface E2eStack {
  /** The disposable Postgres container. */
  readonly container: StartedPostgreSqlContainer
  /** The production-wired application (not listening; supertest drives it). */
  readonly app: INestApplication
  /** The container's connection URI (random mapped port). */
  readonly databaseUrl: string
}

/**
 * Start the stack: container up, `prisma migrate deploy` against it, then
 * `createApp()` with the container URL in the environment.
 *
 * @returns The running stack for the suite.
 */
export async function startStack(): Promise<E2eStack> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
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
  const app = await createApp()
  return { container, app, databaseUrl }
}

/**
 * Stop the stack: application first (closes pools and the reaper timer),
 * then the container.
 *
 * @param stack The stack returned by {@link startStack}.
 */
export async function stopStack(stack: E2eStack): Promise<void> {
  await stack.app.close()
  await stack.container.stop()
}
