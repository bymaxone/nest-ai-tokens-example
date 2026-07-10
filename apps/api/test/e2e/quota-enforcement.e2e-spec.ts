/**
 * E2E proofs of wallet-backed enforcement on the workspace surface.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: prove the metered handlers reject 401 without an identity BEFORE
 * body validation (the guard runs ahead of the pipe), the unguarded models
 * route stays inert, a drained wallet deterministically rejects 402 with
 * the library's canonical envelope and writes NO ledger row (any status)
 * and NO wallet entry, a credit unblocks the same call, and a passing call
 * debits the wallet by exactly the billed cost of its posted, enforced
 * record. Wallet drains/grants run through the REAL WalletService (the
 * same port the app uses), standing in for prior spend.
 * Mocks: none. One container stack per run; the suite runs single-worker.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { LedgerService, WalletService } from '@bymax-one/nest-ai-tokens'
import type { UsageStatus, WalletRef } from '@bymax-one/nest-ai-tokens'
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

/** Every lifecycle status: "no ledger row" means none in ANY of these. */
const ALL_STATUSES: UsageStatus[] = ['pending', 'posted', 'reversed', 'released']

let container: StartedPostgreSqlContainer | undefined
let app: INestApplication | undefined
let server: App
let ledger: LedgerService
let wallets: WalletService

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
  ledger = app.get(LedgerService)
  const maybeWallets = app.get<WalletService | null>(WalletService)
  if (maybeWallets === null) throw new Error('wallets must be enabled for this suite')
  wallets = maybeWallets
})

/** App first (pools, timers), then the container; both guarded. */
afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await container?.stop()
  }
})

/** The wallet owner the drain scenario exhausts (linus at globex). */
const linusRef: WalletRef = { tenantId: 'globex', ownerType: 'user', ownerId: 'linus' }

/** Every ledger row linus has for one feature, across ALL statuses. */
async function linusRowsFor(feature: string): Promise<number> {
  const rows = await ledger.query({
    tenantId: 'globex',
    scope: { type: 'user', id: 'linus' },
    feature,
    status: ALL_STATUSES,
  })
  return rows.length
}

describe('identity gate runs before validation (guard ordering)', () => {
  /**
   * 401 without x-demo-user, even on an INVALID body.
   *
   * The enforcement guard resolves the caller through the module
   * scopeResolver BEFORE the validation pipe sees the payload, so a
   * missing identity beats a missing required field: the guard is not
   * bypassable by malformed input.
   */
  it('rejects an identity-less call 401 before body validation', async () => {
    const response = await request(server).post('/workspace/translate').send({}).expect(401)

    expect(response.body.message).toContain('x-demo-user')
  })

  /**
   * The unmarked read stays inert (rule-of-phase 3).
   *
   * GET /workspace/models carries no guard and no metering: it answers
   * without any identity, proving enforcement is opt-in per handler, not
   * a global net.
   */
  it('GET /workspace/models passes with no identity', async () => {
    const response = await request(server).get('/workspace/models').expect(200)

    expect(response.body.command.models).toEqual(['mock-chat-pro', 'mock-chat-lite'])
  })
})

describe('enforced spend on a funded wallet', () => {
  /**
   * A passing call debits exactly the billed cost (scenario 5 happy half).
   *
   * The hold reserves the tolerance-scaled estimate and capture settles
   * the ±delta, so the NET wallet movement equals the posted record's
   * billed cost exactly: the balance is ledger-backed, never drifting.
   */
  it('debits the wallet by exactly the billed cost of the posted record', async () => {
    const before = await wallets.getBalance(linusRef)

    const response = await request(server)
      .post('/workspace/custom')
      .set('x-demo-user', 'linus')
      .send({ userPrompt: 'first funded call', resourceId: 'doc-q1' })
      .expect(200)

    const after = await wallets.getBalance(linusRef)
    const record = await ledger.findById(String(response.body.usage.transactionId))

    expect(record?.status).toBe('posted')
    expect(record?.enforced).toBe(true)
    expect(before.nanoUsd - after.nanoUsd).toBe(record?.billedCostNanoUsd)
  })
})

describe('drain-then-blocked (scenario 5; matrix rows 59-60)', () => {
  /**
   * A drained wallet rejects 402 with the canonical envelope and writes
   * NOTHING.
   *
   * Draining linus to zero (a WalletService debit standing in for prior
   * spend) makes the next command fail the hold reservation BEFORE the
   * provider runs: the response is the library's canonical
   * AI_TOKENS_INSUFFICIENT_CREDITS envelope, no ledger row exists in ANY
   * lifecycle status for the blocked call, and no wallet entry was
   * appended by it.
   */
  it('rejects 402 AI_TOKENS_INSUFFICIENT_CREDITS without any ledger or wallet write', async () => {
    const balance = await wallets.getBalance(linusRef)
    await wallets.debit(linusRef, {
      amountNanoUsd: balance.nanoUsd,
      idempotencyKey: 'e2e-drain-linus',
      reason: 'drain simulation: prior spend consumed the full balance',
    })
    const rowsBefore = await linusRowsFor('workspace.custom')
    const entriesBefore = (await wallets.getEntries(linusRef)).total

    const response = await request(server)
      .post('/workspace/custom')
      .set('x-demo-user', 'linus')
      .send({ userPrompt: 'blocked call', resourceId: 'doc-q2' })
      .expect(402)

    expect(response.body).toEqual({
      error: {
        code: 'AI_TOKENS_INSUFFICIENT_CREDITS',
        message: expect.any(String),
        details: expect.any(Object),
      },
    })
    expect(await linusRowsFor('workspace.custom')).toBe(rowsBefore)
    expect((await wallets.getEntries(linusRef)).total).toBe(entriesBefore)
  })

  /**
   * A credit unblocks the exact same call (scenario 5 recovery half).
   *
   * Granting fresh credit to the drained wallet lets the identical
   * request pass and settle: the rejection was purely a balance verdict,
   * not a stuck state.
   */
  it('passes again after a credit grant', async () => {
    // effectiveAt is backdated: the store stamps createdAt with the DB
    // clock, and a grant is spendable only when effectiveAt <= createdAt,
    // so a same-instant JS effectiveAt can land after it and leave the
    // grant inert. The credits endpoint applies the same backdating.
    await wallets.grant(linusRef, {
      amountNanoUsd: 5_000_000_000n,
      effectiveAt: new Date(Date.now() - 60_000),
      idempotencyKey: 'e2e-grant-linus',
      reason: 'purchase',
    })

    const response = await request(server)
      .post('/workspace/custom')
      .set('x-demo-user', 'linus')
      .send({ userPrompt: 'blocked call', resourceId: 'doc-q2' })
      .expect(200)

    const record = await ledger.findById(String(response.body.usage.transactionId))
    expect(record?.enforced).toBe(true)
  })
})

describe('zero-balance identity (no seeded wallet)', () => {
  /**
   * A user who never had a wallet is blocked on the FIRST call.
   *
   * root (global tenant) has no seeded wallet, so the balance is zero and
   * the very first metered call rejects 402: enforcement needs no
   * pre-existing wallet row to say no.
   */
  it('rejects the first call of a wallet-less user 402', async () => {
    const response = await request(server)
      .post('/workspace/summarize')
      .set('x-demo-user', 'root')
      .send({ text: 'no wallet backs this call' })
      .expect(402)

    expect(response.body.error.code).toBe('AI_TOKENS_INSUFFICIENT_CREDITS')
  })
})
