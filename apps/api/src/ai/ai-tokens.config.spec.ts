/**
 * Unit tests for the canonical options factory.
 *
 * Layer: unit.
 * Goal: prove every env permutation shapes the options correctly (quota
 * on/off, tenant required, cache TTL, overdraft mapping), the demo scope
 * resolver's four branches, and the DI narrowing helpers.
 * Mocks: a minimal ExecutionContext double carrying the request stub.
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from '@jest/globals'

import {
  DEFAULT_FEATURE,
  DEMO_MARKUP_MULTIPLIER,
  GLOBAL_TENANT_ID,
  aiTokensOptionsFactory,
  assertEnvConfig,
  assertAiTokensStore,
  buildAiTokensOptions,
  createDemoScopeResolver,
  overdraftFromMinimumBalance,
} from './ai-tokens.config.js'
import { createPrismaAiTokensStore } from './ai-store.module.js'
import type { EnvConfig } from '../config/env.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import { PrismaService } from '../prisma/prisma.service.js'

/** A complete typed env fixture with overridable fields. */
function envWith(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ai_tokens_example',
    PORT: 3001,
    AI_PROVIDER_MODE: 'mock',
    QUOTA_ENABLED: true,
    QUOTA_TOLERANCE: 1.2,
    QUOTA_MINIMUM_BALANCE: 0,
    TENANT_REQUIRED: false,
    PRICING_CACHE_TTL_MS: 300_000,
    ...overrides,
  }
}

/** Minimal execution-context test double exposing the request. */
function contextFor(user: DemoIdentity | undefined): ExecutionContext {
  const request = { user }
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext
}

// The real adapter over a lazily-connecting client: constructing PrismaService
// (and the pg driver adapter inside it) opens no connection, so unit tests can
// hold the exact store instance production wires without a database.
const store = createPrismaAiTokensStore(new PrismaService(envWith()))

describe('buildAiTokensOptions', () => {
  /**
   * Default (quota enabled) shape.
   *
   * The full canonical wiring: store, resolver, rate-table rating, USD,
   * demo markup, strict non-seeding pricing with the env TTL, and both
   * enforcement blocks present.
   */
  it('builds the full options with wallets and budgets when QUOTA_ENABLED', () => {
    const options = buildAiTokensOptions(envWith(), store)

    expect(options.store).toBe(store)
    expect(typeof options.scopeResolver).toBe('function')
    expect(options.ratingMode).toBe('rate-table')
    expect(options.currency).toBe('USD')
    expect(options.markup).toBe(DEMO_MARKUP_MULTIPLIER)
    expect(options.pricing).toEqual({
      seedFromSnapshot: false,
      strict: true,
      cacheTtlMs: 300_000,
    })
    expect(options.wallets).toEqual({ overdraftNanoUsd: 0n })
    expect(options.budgets).toEqual({})
  })

  /**
   * Quota disabled permutation.
   *
   * Without QUOTA_ENABLED the enforcement blocks must be absent entirely
   * (the library enables WalletService/BudgetService/BudgetGuard on block
   * presence, not on inner values).
   */
  it('omits wallets and budgets when QUOTA_ENABLED is false', () => {
    const options = buildAiTokensOptions(envWith({ QUOTA_ENABLED: false }), store)

    expect(options.wallets).toBeUndefined()
    expect(options.budgets).toBeUndefined()
  })

  /**
   * Env-driven pricing TTL.
   *
   * PRICING_CACHE_TTL_MS flows into pricing.cacheTtlMs untouched.
   */
  it('passes PRICING_CACHE_TTL_MS through to pricing.cacheTtlMs', () => {
    const options = buildAiTokensOptions(envWith({ PRICING_CACHE_TTL_MS: 60_000 }), store)

    expect(options.pricing?.cacheTtlMs).toBe(60_000)
  })

  /**
   * Overdraft mapping from a negative floor.
   *
   * QUOTA_MINIMUM_BALANCE=-5 (USD) means debits may reach -5, which the
   * library expresses as a 5 USD overdraft allowance in nano-USD.
   */
  it('maps a negative QUOTA_MINIMUM_BALANCE to a positive overdraft', () => {
    const options = buildAiTokensOptions(envWith({ QUOTA_MINIMUM_BALANCE: -5 }), store)

    expect(options.wallets).toEqual({ overdraftNanoUsd: 5_000_000_000n })
  })
})

describe('overdraftFromMinimumBalance', () => {
  /**
   * Boundary behavior of the floor-to-overdraft mapping.
   *
   * Non-negative floors mean no overdraft; negative floors invert into the
   * equivalent positive nano-USD allowance.
   */
  it.each([
    [0, 0n],
    [10, 0n],
    [-1, 1_000_000_000n],
    [-0.5, 500_000_000n],
  ])('maps a floor of %s USD to %s nano-USD overdraft', (floor, expected) => {
    expect(overdraftFromMinimumBalance(floor)).toBe(expected)
  })
})

describe('createDemoScopeResolver', () => {
  /**
   * Authenticated tenant user.
   *
   * The resolver maps the attached identity to the MeteringContext shape:
   * tenant, user scope, and the fallback feature label.
   */
  it('resolves a tenant user to a user-scoped metering context', () => {
    const resolve = createDemoScopeResolver(envWith())

    const context = resolve(contextFor({ id: 'ada', tenantId: 'acme' }))

    expect(context).toEqual({
      tenantId: 'acme',
      scope: { type: 'user', id: 'ada' },
      feature: DEFAULT_FEATURE,
    })
  })

  /**
   * Global admin with optional tenancy.
   *
   * A null tenant falls back to the global tenant id when TENANT_REQUIRED
   * is off, keeping system flows meterable.
   */
  it('falls back to the global tenant for a null-tenant identity', () => {
    const resolve = createDemoScopeResolver(envWith())

    const context = resolve(contextFor({ id: 'root', tenantId: null }))

    expect(context.tenantId).toBe(GLOBAL_TENANT_ID)
  })

  /**
   * Missing identity.
   *
   * Metered endpoints require an identity; without one the resolver rejects
   * with 401 before any metering happens.
   */
  it('throws 401 when no identity is attached', () => {
    const resolve = createDemoScopeResolver(envWith())

    expect(() => resolve(contextFor(undefined))).toThrow(UnauthorizedException)
  })

  /**
   * Tenant-required strictness.
   *
   * With TENANT_REQUIRED=true a null-tenant identity is rejected with 403
   * instead of falling back to the global tenant.
   */
  it('throws 403 for a null tenant when TENANT_REQUIRED is true', () => {
    const resolve = createDemoScopeResolver(envWith({ TENANT_REQUIRED: true }))

    expect(() => resolve(contextFor({ id: 'root', tenantId: null }))).toThrow(ForbiddenException)
  })
})

describe('DI narrowing helpers', () => {
  /**
   * Happy narrowing.
   *
   * The helpers return the same instances the container injected.
   */
  it('narrow valid injected values', () => {
    const env = envWith()

    expect(assertEnvConfig(env)).toBe(env)
    expect(assertAiTokensStore(store)).toBe(store)
  })

  /**
   * Defensive rejection.
   *
   * A mis-wired container (wrong token order, missing provider) must fail
   * loudly at boot rather than produce half-typed options.
   */
  it.each([
    ['a null env', null],
    ['an env without DATABASE_URL', { PORT: 3001 }],
    ['a primitive', 42],
    [
      'an env with a valid DATABASE_URL but a mistyped QUOTA_ENABLED',
      { ...envWith(), QUOTA_ENABLED: 'yes' },
    ],
    [
      'an env missing PRICING_CACHE_TTL_MS',
      Object.fromEntries(
        Object.entries(envWith()).filter(([key]) => key !== 'PRICING_CACHE_TTL_MS'),
      ),
    ],
  ])('assertEnvConfig rejects %s', (_label, value) => {
    expect(() => assertEnvConfig(value)).toThrow('ENV_CONFIG resolved to an unexpected value')
  })

  /**
   * Store narrowing rejection.
   *
   * Only a real `PrismaAiTokensStore` instance passes; a structural
   * imitation (or a mis-wired token) fails loudly at boot.
   */
  it('assertAiTokensStore rejects a structural imitation', () => {
    expect(() => assertAiTokensStore({})).toThrow('AI_TOKENS_STORE resolved to an unexpected value')
  })

  /**
   * The composed factory.
   *
   * aiTokensOptionsFactory narrows then builds; the result carries the
   * injected store.
   */
  it('aiTokensOptionsFactory builds options from injected values', () => {
    const options = aiTokensOptionsFactory(envWith(), store)

    expect(options.store).toBe(store)
  })
})
