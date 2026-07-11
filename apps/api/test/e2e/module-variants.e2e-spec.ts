/**
 * E2E proofs of the module registration surface (spec §7.1 rows 2, 10-12;
 * §7.7 row 75 reconciled; §4.3 contract 7).
 *
 * Layer: e2e (isolated Nest testing modules + one variant application
 * boot; Testcontainers Postgres for the app half).
 * Goal: prove the boot-time surface with isolated variants that never
 * touch the primary wiring: (a) the synchronous `forRoot` path boots and
 * resolves the core services; (b) a ledger-only registration (no
 * `wallets`/`budgets` blocks) registers cleanly WITHOUT the enforcement
 * services; (c-e) invalid options are rejected at registration time with
 * the exact catalog code (`AI_TOKENS_INVALID_CONFIG` for a bad markup and
 * for a store missing its port methods, `AI_TOKENS_FX_REQUIRED` for a
 * non-USD currency without fx). The application half boots the REAL app
 * with `QUOTA_ENABLED=false`, proving the `forRootAsync` null-resolution
 * of the enforcement services, the app's documented 503 `quota.disabled`
 * guards, a metered call that still works ledger-only, and the
 * `AI_TOKENS_HOLD_EXPIRED` proof (a voided hold backdated past its TTL).
 * The drafted `openai-default`/`provider.api_key_missing` boot variant
 * does not exist in v0.1.0 (no provider strategy surface); see the phase
 * Reconciliation note.
 * Mocks: none. One container stack per run; strictly sequential boots.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import {
  AiTokensException,
  BudgetService,
  BymaxAiTokensModule,
  LedgerService,
  MeteringService,
  PricingService,
  WalletService,
} from '@bymax-one/nest-ai-tokens'
import type { BymaxAiTokensModuleOptions, IAiTokensStore } from '@bymax-one/nest-ai-tokens'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import request from 'supertest'
import type { App } from 'supertest/types.js'

import { listenLocal } from './listen-local.js'
import { createApp } from '../../src/bootstrap.js'
import { createPrismaAiTokensStore } from '../../src/ai/ai-store.module.js'
import { ERROR_CATALOG } from '../../src/errors-demo/error-catalog.js'
import { applyLibraryParamtypesShim } from '../../src/ai/library-metadata.shim.js'
import { buildMeteringContext } from '../../src/ai/metering-context.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'
import type { EnvConfig } from '../../src/config/env.js'

/** The image every tier of this project pins for Postgres. */
const POSTGRES_IMAGE = 'postgres:17-alpine'

/** The app package root (cwd for the Prisma CLI). */
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The canonical envelope shape asserted on the 503 guards. */
interface ErrorEnvelope {
  error: { code: string; message: string }
}

/** A complete typed env fixture for constructing variant Prisma clients. */
function envWith(databaseUrl: string): EnvConfig {
  return {
    DATABASE_URL: databaseUrl,
    PORT: 0,
    AI_PROVIDER_MODE: 'mock',
    QUOTA_ENABLED: false,
    QUOTA_TOLERANCE: 1.2,
    QUOTA_MINIMUM_BALANCE: 0,
    TENANT_REQUIRED: false,
    PRICING_CACHE_TTL_MS: 300_000,
    MOCK_LATENCY_MS: 0,
    WEB_ORIGIN: ['http://localhost:3000'],
  }
}

/** Minimal valid sync options over the given store (no snapshot writes). */
function minimalOptions(store: IAiTokensStore): BymaxAiTokensModuleOptions {
  return { store, pricing: { seedFromSnapshot: false } }
}

// The published dist carries no design:paramtypes; the variants register
// the library exactly like the primary wiring does, shim first.
applyLibraryParamtypesShim()

let container: StartedPostgreSqlContainer | undefined
let databaseUrl: string

/** One container + schema for every variant in this file. */
beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('ai_tokens_example')
    .start()
  databaseUrl = container.getConnectionUri()
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: APP_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  })
})

afterAll(async () => {
  delete process.env.QUOTA_ENABLED
  await container?.stop()
})

describe('sync registration: BymaxAiTokensModule.forRoot (matrix row 2)', () => {
  /**
   * The synchronous path with minimal options.
   *
   * `forRoot` validates the options, boots, and the core services
   * (ledger, pricing, metering) resolve from the container; the variant
   * closes cleanly. This is the library's documented non-async setup.
   */
  it('boots with minimal options and resolves the core services', async () => {
    const prisma = new PrismaService(envWith(databaseUrl))
    const moduleRef = await Test.createTestingModule({
      imports: [BymaxAiTokensModule.forRoot(minimalOptions(createPrismaAiTokensStore(prisma)))],
    }).compile()
    const app = moduleRef.createNestApplication()
    await app.init()

    try {
      expect(app.get(LedgerService)).toBeInstanceOf(LedgerService)
      expect(app.get(PricingService)).toBeInstanceOf(PricingService)
      expect(app.get(MeteringService)).toBeInstanceOf(MeteringService)
    } finally {
      await app.close()
      await prisma.$disconnect()
    }
  })

  /**
   * Ledger-only conditional registration (matrix row 12 reconciled).
   *
   * Without the `wallets`/`budgets` feature blocks, `forRoot` registers
   * NO `WalletService`/`BudgetService` provider at all (the drafted
   * `AiCommandService`/`EmbeddingService` are host-owned and do not
   * exist): resolving them throws Nest's unknown-provider error while
   * the ledger half keeps working.
   */
  it('omits the enforcement services when their blocks are absent', async () => {
    const prisma = new PrismaService(envWith(databaseUrl))
    const moduleRef = await Test.createTestingModule({
      imports: [BymaxAiTokensModule.forRoot(minimalOptions(createPrismaAiTokensStore(prisma)))],
    }).compile()
    const app = moduleRef.createNestApplication()
    await app.init()

    try {
      expect(app.get(LedgerService)).toBeInstanceOf(LedgerService)
      // Asserting only THAT resolution throws keeps the proof stable across
      // Nest versions (the unknown-provider wording is not contractual).
      expect(() => app.get(WalletService)).toThrow()
      expect(() => app.get(BudgetService)).toThrow()
    } finally {
      await app.close()
      await prisma.$disconnect()
    }
  })
})

describe('registration-time rejections (matrix rows 10-11 reconciled)', () => {
  let stubPrisma: PrismaService

  beforeAll(() => {
    stubPrisma = new PrismaService(envWith(databaseUrl))
  })

  afterAll(async () => {
    await stubPrisma.$disconnect()
  })

  /** A structurally-complete store for the pure validation cases. */
  function storeStub(): IAiTokensStore {
    return createPrismaAiTokensStore(stubPrisma)
  }

  /**
   * Invalid option value (the drafted `config.invalid_provider_strategy`
   * reconciled: v0.1.0 has no provider strategies; its config-time
   * rejection covers every invalid option value).
   *
   * A non-positive markup is rejected synchronously at `forRoot` with
   * `AI_TOKENS_INVALID_CONFIG` before any module is built.
   */
  it('rejects an invalid markup with AI_TOKENS_INVALID_CONFIG', () => {
    expect.assertions(3)

    try {
      BymaxAiTokensModule.forRoot({ ...minimalOptions(storeStub()), markup: -1 })
    } catch (error) {
      expect(error).toBeInstanceOf(AiTokensException)
      expect((error as AiTokensException).getStatus()).toBe(500)
      const body = (error as AiTokensException).getResponse() as ErrorEnvelope
      expect(body.error.code).toBe('AI_TOKENS_INVALID_CONFIG')
    }
  })

  /**
   * Missing store port methods (the drafted `config.missing_repository`
   * reconciled: the store IS the repository surface).
   *
   * A store object without the required port methods is rejected at
   * `forRoot` with `AI_TOKENS_INVALID_CONFIG`.
   */
  it('rejects a method-less store with AI_TOKENS_INVALID_CONFIG', () => {
    expect.assertions(2)

    try {
      BymaxAiTokensModule.forRoot({
        store: { notAStore: true } as unknown as IAiTokensStore,
        pricing: { seedFromSnapshot: false },
      })
    } catch (error) {
      expect(error).toBeInstanceOf(AiTokensException)
      const body = (error as AiTokensException).getResponse() as ErrorEnvelope
      expect(body.error.code).toBe('AI_TOKENS_INVALID_CONFIG')
    }
  })

  /**
   * Non-USD currency without fx (matrix row: the FX contract).
   *
   * `currency: 'EUR'` without an `fx` resolver is rejected at `forRoot`
   * with `AI_TOKENS_FX_REQUIRED`, completing the config-time half of the
   * catalog.
   */
  it('rejects a non-USD currency without fx with AI_TOKENS_FX_REQUIRED', () => {
    expect.assertions(3)

    try {
      BymaxAiTokensModule.forRoot({ ...minimalOptions(storeStub()), currency: 'EUR' })
    } catch (error) {
      expect(error).toBeInstanceOf(AiTokensException)
      expect((error as AiTokensException).getStatus()).toBe(500)
      const body = (error as AiTokensException).getResponse() as ErrorEnvelope
      expect(body.error.code).toBe('AI_TOKENS_FX_REQUIRED')
    }
  })
})

describe('ledger-only application boot: QUOTA_ENABLED=false (matrix row 12)', () => {
  let app: INestApplication | undefined
  let server: App

  /** Boot the REAL app ledger-only (forRootAsync null-resolves enforcement). */
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.PORT = '0'
    process.env.QUOTA_ENABLED = 'false'
    app = await createApp()
    server = await listenLocal(app)
  })

  afterAll(async () => {
    delete process.env.QUOTA_ENABLED
    await app?.close()
  })

  /**
   * Metering still works ledger-only.
   *
   * A workspace command runs the full hold -> provider -> capture cycle
   * with NO wallet or budget in play: the library registers cleanly
   * without the enforcement services (contract 7).
   */
  it('meters a workspace command without the enforcement blocks', async () => {
    const response = await request(server)
      .post('/workspace/translate')
      .set('x-demo-user', 'ada')
      .send({ text: 'Ledger-only boot probe', targetLanguages: ['pt'] })
      .expect(200)

    expect(typeof response.body.usage.transactionId).toBe('string')
  })

  /**
   * The documented 503 guards (the `quota.disabled` catalog proof).
   *
   * Every enforcement-dependent surface answers the app's canonical 503
   * envelope: balance reads, credit writes, the budgets admin, and the
   * wallet-dependent errors-demo trigger.
   */
  it('answers 503 quota.disabled on every enforcement surface', async () => {
    const balance = await request(server).get('/usage/balance').set('x-demo-user', 'ada')
    const credit = await request(server)
      .post('/ledger/credits')
      .set('x-demo-user', 'ada')
      .send({ amountNanoUsd: '1000000000', type: 'purchase' })
    const budgets = await request(server).get('/quota/budgets').set('x-demo-user', 'ada')
    const trigger = await request(server)
      .post('/errors-demo/AI_TOKENS_INSUFFICIENT_CREDITS')
      .set('x-demo-user', 'ada')

    for (const response of [balance, credit, budgets, trigger]) {
      expect(response.status).toBe(503)
      expect((response.body as ErrorEnvelope).error.code).toBe('quota.disabled')
    }
  })

  /**
   * `AI_TOKENS_HOLD_EXPIRED` (the e2e-only catalog proof).
   *
   * A voided hold whose creation instant is pushed past the 1h TTL is
   * treated as reaped: capturing it raises the 410 catalog error. The
   * backdate is test-side surgery on the variant database, standing in
   * for the passage of real time.
   */
  it('raises AI_TOKENS_HOLD_EXPIRED when capturing a hold voided past its TTL', async () => {
    if (app === undefined) throw new Error('the ledger-only app must be booted')
    const metering = app.get(MeteringService)
    const prisma = app.get(PrismaService)
    const context = buildMeteringContext({ id: 'ada', tenantId: 'acme' }, 'errors-demo.hold', [])
    const hold = await metering.hold(context, { amountNanoUsd: 1n })
    await metering.release(hold, 'expiry proof (voided, then backdated)')
    await prisma.$executeRaw`
      UPDATE "ai_usage_records"
      SET "createdAt" = "createdAt" - INTERVAL '2 hours'
      WHERE "id" = ${hold.id}`
    expect.assertions(3)

    try {
      await metering.capture(hold, {})
    } catch (error) {
      expect(error).toBeInstanceOf(AiTokensException)
      expect((error as AiTokensException).getStatus()).toBe(410)
      const body = (error as AiTokensException).getResponse() as ErrorEnvelope
      expect(body.error.code).toBe('AI_TOKENS_HOLD_EXPIRED')
    }
  })
})

describe('catalog completion summary', () => {
  /**
   * Every code of the reconciled 26-code surface is accounted for by a
   * proof class, derived from the catalog itself: the 21 `trigger` rows
   * are raised by the errors-demo walks, the 3 `e2e-only` rows by the
   * dedicated boots (`tenant.required` in the tenant-isolation strict
   * boot; `quota.disabled` and `AI_TOKENS_HOLD_EXPIRED` in this file's
   * ledger-only boot), the 1 `boot-variant` row
   * (`AI_TOKENS_FX_REQUIRED`) by this file's registration rejections
   * (which also cover the boot face of `AI_TOKENS_INVALID_CONFIG`), and
   * the 1 `reserved` row (`AI_TOKENS_NOT_CONFIGURED`) is documented
   * honestly. 25 of 26 raised in tests; 1 reserved by the shipped dist.
   */
  it('accounts for all 26 codes: 25 raised across the suite, 1 reserved', () => {
    const byAvailability = (availability: string): string[] =>
      ERROR_CATALOG.filter((entry) => entry.availability === availability)
        .map((entry) => entry.code)
        .sort()

    expect(ERROR_CATALOG).toHaveLength(26)
    expect(byAvailability('trigger')).toHaveLength(21)
    expect(byAvailability('e2e-only')).toEqual([
      'AI_TOKENS_HOLD_EXPIRED',
      'quota.disabled',
      'tenant.required',
    ])
    expect(byAvailability('boot-variant')).toEqual(['AI_TOKENS_FX_REQUIRED'])
    expect(byAvailability('reserved')).toEqual(['AI_TOKENS_NOT_CONFIGURED'])
  })
})
