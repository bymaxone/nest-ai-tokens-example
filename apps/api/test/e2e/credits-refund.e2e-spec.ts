/**
 * E2E proofs of the ledger money paths: credits and refunds.
 *
 * Layer: e2e (real application via createApp, Testcontainers Postgres).
 * Goal: prove a credit raises the wallet balance by exactly the granted
 * amount (and unblocks spending), the strict Zod money gate rejects every
 * malformed amount, a client idempotency key makes credits replay-safe, a
 * refund appends a compensating record that exactly negates the original
 * (whose amounts stay byte-identical under the reversed annotation) while
 * restoring the wallet, ownership gates the refund surface (404/403), and
 * a double refund is the canonical 409.
 * Mocks: none. One container stack per run; the suite runs single-worker.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { LedgerService, WalletService } from '@bymax-one/nest-ai-tokens'
import type { UsageRecord, WalletRef } from '@bymax-one/nest-ai-tokens'
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

/** The wallet the credit proofs top up (linus at globex). */
const linusRef: WalletRef = { tenantId: 'globex', ownerType: 'user', ownerId: 'linus' }

describe('POST /ledger/credits', () => {
  /**
   * A credit raises the balance by exactly the granted amount.
   *
   * The response reports the appended grant and the post-credit balance;
   * the wallet's real balance moves by exactly the bigint amount (matrix
   * row 20 reconciled onto WalletService.grant).
   */
  it('credits the wallet by exactly the granted nano-USD', async () => {
    const before = await wallets.getBalance(linusRef)

    const response = await request(server)
      .post('/ledger/credits')
      .set('x-demo-user', 'linus')
      .send({ amountNanoUsd: '2500000000', type: 'purchase', description: 'demo top-up' })
      .expect(201)

    const after = await wallets.getBalance(linusRef)
    expect(response.body).toEqual({
      entryId: expect.any(String),
      type: 'purchase',
      amountNanoUsd: '2500000000',
      balance: {
        nanoUsd: after.nanoUsd.toString(),
        credits: after.credits,
        formatted: expect.stringMatching(/^\$\d/),
      },
    })
    expect(after.nanoUsd - before.nanoUsd).toBe(2_500_000_000n)
  })

  /**
   * Replay-safe credits (webhook retry semantics).
   *
   * The same idempotency key twice grants ONCE: the second call returns
   * the original entry and the balance moves a single time.
   */
  it('replays an identical credit instead of double-granting', async () => {
    const before = await wallets.getBalance(linusRef)
    const payload = {
      amountNanoUsd: '1000000000',
      type: 'monthly_allocation',
      idempotencyKey: 'e2e-webhook-evt-42',
    }

    const first = await request(server)
      .post('/ledger/credits')
      .set('x-demo-user', 'linus')
      .send(payload)
      .expect(201)
    const second = await request(server)
      .post('/ledger/credits')
      .set('x-demo-user', 'linus')
      .send(payload)
      .expect(201)

    const after = await wallets.getBalance(linusRef)
    expect(second.body.entryId).toBe(first.body.entryId)
    expect(after.nanoUsd - before.nanoUsd).toBe(1_000_000_000n)
  })

  /**
   * The strict money gate (Zod before the library).
   *
   * Zero, negative, fractional, exponent, and oversized amounts are all
   * 400 with no wallet movement; the library's own zero-amount error
   * remains reachable only through its direct API, never this endpoint.
   */
  it('rejects malformed amounts 400 without touching the wallet', async () => {
    const before = await wallets.getBalance(linusRef)

    for (const amountNanoUsd of ['0', '-5', '1.5', '1e9', '9'.repeat(16)]) {
      await request(server)
        .post('/ledger/credits')
        .set('x-demo-user', 'linus')
        .send({ amountNanoUsd, type: 'purchase' })
        .expect(400)
    }

    expect((await wallets.getBalance(linusRef)).nanoUsd).toBe(before.nanoUsd)
  })

  /**
   * Identity gate.
   *
   * Credits are identity-scoped: 401 without the demo header.
   */
  it('rejects an identity-less credit 401', async () => {
    await request(server)
      .post('/ledger/credits')
      .send({ amountNanoUsd: '1', type: 'purchase' })
      .expect(401)
  })
})

describe('POST /ledger/refund', () => {
  /** Runs one enforced command as linus and returns its posted record. */
  async function spendOnce(prompt: string): Promise<UsageRecord> {
    const response = await request(server)
      .post('/workspace/custom')
      .set('x-demo-user', 'linus')
      .send({ userPrompt: prompt, resourceId: 'doc-refund' })
      .expect(200)
    const record = await ledger.findById(String(response.body.usage.transactionId))
    if (record === null) throw new Error('the spend did not persist')
    return record
  }

  /**
   * The refund contract (matrix row 23: immutability by compensation).
   *
   * The compensating record exactly negates the original's tokens and
   * costs and points back via reversesRecordId; the ORIGINAL keeps every
   * amount byte-identical, gaining only the reversed annotation; the
   * wallet balance is restored by exactly the billed cost; the net ledger
   * spend for the pair is zero.
   */
  it('appends an exact compensating record and restores the wallet', async () => {
    const original = await spendOnce('refund me')
    const balanceAfterSpend = await wallets.getBalance(linusRef)

    const response = await request(server)
      .post('/ledger/refund')
      .set('x-demo-user', 'linus')
      .send({ transactionId: original.id, reason: 'demo refund' })
      .expect(201)

    expect(response.body.originalTransactionId).toBe(original.id)
    expect(response.body.walletRefunded).toBe(true)
    const reversal = await ledger.findById(String(response.body.reversalTransactionId))
    expect(reversal?.reversesRecordId).toBe(original.id)
    expect(reversal?.totalTokens).toBe(-original.totalTokens)
    expect(reversal?.billedCostNanoUsd).toBe(-original.billedCostNanoUsd)
    expect(reversal?.status).toBe('posted')

    const annotated = await ledger.findById(original.id)
    expect(annotated?.status).toBe('reversed')
    expect(annotated?.reversedByRecordId).toBe(reversal?.id)
    expect(annotated?.billedCostNanoUsd).toBe(original.billedCostNanoUsd)
    expect(annotated?.rawCostNanoUsd).toBe(original.rawCostNanoUsd)
    expect(annotated?.totalTokens).toBe(original.totalTokens)
    expect(annotated?.idempotencyKey).toBe(original.idempotencyKey)

    const restored = await wallets.getBalance(linusRef)
    expect(restored.nanoUsd - balanceAfterSpend.nanoUsd).toBe(original.billedCostNanoUsd)

    const net = await ledger.sumCost({
      tenantId: 'globex',
      scope: { type: 'user', id: 'linus' },
      tags: ['resource:doc-refund'],
    })
    expect(net.billedCostNanoUsd).toBe(0n)
  })

  /**
   * Double refunds are the canonical 409.
   *
   * The original is now `reversed`, so a second attempt is rejected with
   * the library's idempotency-conflict envelope: refunds can never stack.
   */
  it('rejects a second refund of the same record with the canonical 409', async () => {
    const original = await spendOnce('refund me twice')
    await request(server)
      .post('/ledger/refund')
      .set('x-demo-user', 'linus')
      .send({ transactionId: original.id })
      .expect(201)

    const conflict = await request(server)
      .post('/ledger/refund')
      .set('x-demo-user', 'linus')
      .send({ transactionId: original.id })
      .expect(409)

    expect(conflict.body.error.code).toBe('AI_TOKENS_IDEMPOTENCY_CONFLICT')
  })

  /**
   * Ownership gates (mirroring the detail endpoint).
   *
   * Unknown ids are 404; another user's record is 403 even when the id is
   * real, so the refund surface cannot probe foreign ledger data.
   */
  it('rejects unknown ids 404 and foreign records 403', async () => {
    await request(server)
      .post('/ledger/refund')
      .set('x-demo-user', 'linus')
      .send({ transactionId: 'ghost-txn' })
      .expect(404)

    // seed-usage-0001 belongs to ada at acme; linus may not touch it.
    await request(server)
      .post('/ledger/refund')
      .set('x-demo-user', 'linus')
      .send({ transactionId: 'seed-usage-0001' })
      .expect(403)
  })
})
