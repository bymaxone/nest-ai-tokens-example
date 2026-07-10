/**
 * @fileoverview The canonical module options factory: the copy-paste artifact
 * of the whole example. `buildAiTokensOptions` maps the typed environment to
 * `BymaxAiTokensModuleOptions` for `BymaxAiTokensModule.forRootAsync`; every
 * option set here comes from the typed env accessor and each block's JSDoc
 * explains the choice. The demo `scopeResolver` reads the request identity
 * that the identity middleware attached (in a real service it would read
 * verified JWT claims/session data, never client-supplied body or query
 * fields).
 *
 * @layer ai
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { floatUsdToNanoUsd } from '@bymax-one/nest-ai-tokens'
import type { BymaxAiTokensModuleOptions, MeteringContext } from '@bymax-one/nest-ai-tokens'
import { z } from 'zod'

import type { EnvConfig } from '../config/env.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'
import { PlaceholderAiTokensStore } from './placeholder-ai-tokens.store.js'

/** Tenant id used for global (null-tenant) identities when tenancy is optional. */
export const GLOBAL_TENANT_ID = 'global'

/**
 * Fallback feature label for metered calls. `@Meter`/`@RequireBudget`/
 * `@AiFeature` decorator metadata takes precedence per call.
 */
export const DEFAULT_FEATURE = 'api.request'

/**
 * Demo resale margin. Matches the 1.25 multiplier baked into the seeded
 * ledger history so live calls and seeded charts share one margin story.
 */
export const DEMO_MARKUP_MULTIPLIER = 1.25

/**
 * Build the `scopeResolver` for the guard/interceptor: it maps the simulated
 * request identity to the library's `MeteringContext`. TRUSTED-INPUT rule:
 * the resolver reads only what the identity layer attached to the request,
 * never raw client body/query fields (the demo identity layer itself is a
 * clearly labeled simulation; see `identity/identity.middleware.ts`).
 *
 * @param env The typed environment (drives the tenant-required strictness).
 * @returns The resolver handed to `BymaxAiTokensModuleOptions.scopeResolver`.
 */
export function createDemoScopeResolver(
  env: EnvConfig,
): (ctx: ExecutionContext) => MeteringContext {
  return (ctx: ExecutionContext): MeteringContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
    const user = request.user
    if (user === undefined) {
      throw new UnauthorizedException(
        'A demo identity is required for metered endpoints. Send the x-demo-user header.',
      )
    }
    if (user.tenantId === null && env.TENANT_REQUIRED) {
      throw new ForbiddenException(
        'A tenant is required (TENANT_REQUIRED=true). Use a tenant-scoped demo user or send x-tenant-id.',
      )
    }
    return {
      tenantId: user.tenantId ?? GLOBAL_TENANT_ID,
      scope: { type: 'user', id: user.id },
      feature: DEFAULT_FEATURE,
    }
  }
}

/**
 * Map the configured minimum wallet balance (USD) to the library's overdraft
 * allowance: a negative floor becomes a positive overdraft, a floor of zero
 * or above means no overdraft.
 *
 * @param minimumBalanceUsd The lowest balance a debit may leave, in USD.
 * @returns The `wallets.overdraftNanoUsd` value.
 */
export function overdraftFromMinimumBalance(minimumBalanceUsd: number): bigint {
  return minimumBalanceUsd < 0 ? floatUsdToNanoUsd(-minimumBalanceUsd) : 0n
}

/**
 * Build the canonical module options from the typed environment.
 *
 * Option-by-option rationale:
 * - `store`: the injected persistence adapter. Today the boot placeholder;
 *   the Prisma-backed store replaces it when the repository layer lands.
 * - `scopeResolver`: header-simulated identity -> `MeteringContext`
 *   (see {@link createDemoScopeResolver}).
 * - `ratingMode: 'rate-table'`: costs come from the effective-dated price
 *   registry, the deterministic mode the mock provider demos rely on.
 * - `currency: 'USD'`: presentation currency; persisted money is always
 *   nano-USD regardless.
 * - `markup`: flat demo margin matching the seeded ledger history.
 * - `pricing.seedFromSnapshot: false`: the snapshot seed needs a persistent
 *   store; it turns on together with the Prisma store. `strict: true` keeps
 *   missing prices loud (`AI_TOKENS_PRICE_NOT_FOUND`) instead of silently
 *   rating zero. `cacheTtlMs` comes straight from `PRICING_CACHE_TTL_MS`.
 * - `wallets`/`budgets` (only when `QUOTA_ENABLED`): enabling the blocks
 *   registers `WalletService`, `BudgetService`, and `BudgetGuard`; the
 *   wallet overdraft derives from `QUOTA_MINIMUM_BALANCE`
 *   (see {@link overdraftFromMinimumBalance}).
 *
 * @param env The typed environment configuration.
 * @param store The persistence adapter implementing `IAiTokensStore`.
 * @returns Options for `BymaxAiTokensModule.forRootAsync`.
 */
export function buildAiTokensOptions(
  env: EnvConfig,
  store: PlaceholderAiTokensStore,
): BymaxAiTokensModuleOptions {
  return {
    store,
    scopeResolver: createDemoScopeResolver(env),
    ratingMode: 'rate-table',
    currency: 'USD',
    markup: DEMO_MARKUP_MULTIPLIER,
    pricing: {
      seedFromSnapshot: false,
      strict: true,
      cacheTtlMs: env.PRICING_CACHE_TTL_MS,
    },
    ...(env.QUOTA_ENABLED
      ? {
          wallets: { overdraftNanoUsd: overdraftFromMinimumBalance(env.QUOTA_MINIMUM_BALANCE) },
          budgets: {},
        }
      : {}),
  }
}

/**
 * Parsed-space mirror of the environment shape: `envSchema` itself parses
 * from raw env-var strings (coercions, `stringbool`), so it cannot revalidate
 * an already-parsed object. The `z.ZodType<EnvConfig>` annotation keeps this
 * mirror from drifting away from the real config type.
 */
const parsedEnvShape: z.ZodType<EnvConfig> = z.object({
  DATABASE_URL: z.string(),
  PORT: z.number(),
  AI_PROVIDER_MODE: z.enum(['mock', 'openai-optin']),
  QUOTA_ENABLED: z.boolean(),
  QUOTA_TOLERANCE: z.number(),
  QUOTA_MINIMUM_BALANCE: z.number(),
  TENANT_REQUIRED: z.boolean(),
  PRICING_CACHE_TTL_MS: z.number(),
})

/**
 * Narrow the value injected for `ENV_CONFIG` (the library's async factory is
 * typed over `unknown` arguments). Every field the options factory consumes
 * is structurally verified, so a miswired DI token fails here with one clear
 * error instead of surfacing later as a confusing option value.
 *
 * @param value The injected value.
 * @returns The typed environment configuration.
 * @throws {Error} when the container resolved an unexpected value.
 */
export function assertEnvConfig(value: unknown): EnvConfig {
  if (parsedEnvShape.safeParse(value).success) return value as EnvConfig
  throw new Error('ENV_CONFIG resolved to an unexpected value')
}

/**
 * Narrow the value injected for the placeholder store.
 *
 * @param value The injected value.
 * @returns The placeholder store instance.
 * @throws {Error} when the container resolved an unexpected value.
 */
export function assertPlaceholderStore(value: unknown): PlaceholderAiTokensStore {
  if (value instanceof PlaceholderAiTokensStore) return value
  throw new Error('PlaceholderAiTokensStore resolved to an unexpected value')
}

/**
 * The `useFactory` handed to `BymaxAiTokensModule.forRootAsync`, narrowing
 * the injected dependencies before delegating to {@link buildAiTokensOptions}.
 *
 * @param env The injected `ENV_CONFIG` value.
 * @param store The injected placeholder store.
 * @returns The module options.
 */
export function aiTokensOptionsFactory(env: unknown, store: unknown): BymaxAiTokensModuleOptions {
  return buildAiTokensOptions(assertEnvConfig(env), assertPlaceholderStore(store))
}
