/**
 * @fileoverview The deterministic error-trigger registry: one function per
 * `trigger`-availability catalog code, each raising the REAL exception
 * through the REAL code path (library service calls and marker-driven mock
 * inference). Triggers never wrap or re-map the raised error, take no
 * caller-controlled identifiers (so the endpoint cannot be used as an
 * oracle against foreign data), and leave no billable state behind: the
 * only rows a trigger can write are a voided (released) hold and an
 * ephemeral demo budget that is removed in the same call.
 *
 * @layer errors-demo
 */
import { randomUUID } from 'node:crypto'

import { StreamUsageCollector, providerPresets } from '@bymax-one/nest-ai-tokens'
import type {
  BudgetService,
  LedgerService,
  MeteringContext,
  MeteringService,
  WalletService,
} from '@bymax-one/nest-ai-tokens'

import { customBodySchema } from '../workspace/dto/custom.body.js'
import { translateBodySchema } from '../workspace/dto/translate.body.js'
import type { WorkspaceCommandService } from '../workspace/workspace-command.service.js'
import { buildMeteringContext, walletRefOf } from '../ai/metering-context.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

/** Everything a trigger may touch, resolved per request by the service. */
export interface TriggerToolkit {
  /** The caller's identity: every trigger stays inside the caller's tenant. */
  readonly identity: DemoIdentity
  readonly metering: MeteringService
  readonly ledger: LedgerService
  /** `null` when the wallets feature block is off. */
  readonly wallets: WalletService | null
  /** `null` when the budgets feature block is off. */
  readonly budgets: BudgetService | null
  readonly commands: WorkspaceCommandService
}

/** A trigger deterministically raises its catalog code (it never returns). */
export type TriggerFn = (toolkit: TriggerToolkit) => Promise<never>

/**
 * One registry entry: the trigger plus its feature-block requirement.
 * The dispatcher (`ErrorsDemoService.trigger`) rejects with the app's 503
 * `quota.disabled` BEFORE running an entry whose required block resolved
 * to `null`, so entries may narrow `wallets`/`budgets` to non-null.
 */
export interface TriggerEntry {
  /** The enforcement block the trigger needs, if any. */
  readonly requires?: 'wallets' | 'budgets'
  readonly run: TriggerFn
}

/** The demo-labeled feature prefix every trigger-side write carries. */
export const ERRORS_DEMO_FEATURE_PREFIX = 'errors-demo'

/**
 * A debit no demo wallet can ever cover: nine billion USD in nano-USD,
 * just under the int8 column ceiling (so the store binds it cleanly).
 * Seeded balances are tens of USD and the credit endpoint caps a single
 * grant at under one million USD, so this amount stays unreachable by
 * orders of magnitude (the debit must reject, never settle).
 */
const IMPOSSIBLE_DEBIT_NANO_USD = 9_000_000_000_000_000_000n

/** The smallest value beyond the ledger's int4 token columns. */
const INT4_OVERFLOW_TOKENS = 2_147_483_648

/** Build the demo-labeled metering context for one trigger. */
function contextOf(identity: DemoIdentity, suffix: string): MeteringContext {
  return buildMeteringContext(identity, `${ERRORS_DEMO_FEATURE_PREFIX}.${suffix}`, [])
}

/**
 * Wrap an action that MUST throw. If it ever resolves, the wrapper fails
 * loudly with a bug marker instead of returning success, so a library or
 * mock regression can never turn a trigger into a silent no-op.
 *
 * @param code The catalog code the action is expected to raise.
 * @param act The action exercising the real failing code path.
 * @returns The trigger function.
 */
function raising(code: string, act: (toolkit: TriggerToolkit) => Promise<unknown>): TriggerFn {
  return async (toolkit) => {
    await act(toolkit)
    throw new Error(`errors-demo trigger for ${code} did not raise the expected error`)
  }
}

/**
 * `AI_TOKENS_INVALID_CONFIG` (runtime face): a wallet grant with a
 * non-positive amount is rejected by input validation before any write.
 */
const invalidConfig: TriggerEntry = {
  requires: 'wallets',
  run: raising('AI_TOKENS_INVALID_CONFIG', async ({ identity, wallets }) => {
    await (wallets as WalletService).grant(walletRefOf(identity), {
      amountNanoUsd: 0n,
      idempotencyKey: `errors-demo-${randomUUID()}`,
      reason: 'errors-demo trigger (never persisted)',
    })
  }),
}

/**
 * `AI_TOKENS_UNKNOWN_PROVIDER`: raw usage without a preset or normalizer
 * cannot be attributed to a provider; rejected before rating or writing.
 */
const unknownProvider: TriggerEntry = {
  run: raising('AI_TOKENS_UNKNOWN_PROVIDER', async ({ identity, metering }) => {
    await metering.record({ usage: { tokens: 1 }, context: contextOf(identity, 'record') })
  }),
}

/**
 * `AI_TOKENS_USAGE_MALFORMED`: an OpenAI-shaped normalizer over a payload
 * with no token fields; rejected before rating or writing.
 */
const usageMalformed: TriggerEntry = {
  run: raising('AI_TOKENS_USAGE_MALFORMED', async ({ identity, metering }) => {
    await metering.record({
      usage: { not: 'a usage payload' },
      preset: providerPresets.openaiChat,
      context: contextOf(identity, 'record'),
    })
  }),
}

/**
 * `AI_TOKENS_PRICE_NOT_FOUND`: a pure strict-mode cost estimate for a model
 * that has no effective-dated price (side-effect free by contract).
 */
const priceNotFound: TriggerEntry = {
  run: raising('AI_TOKENS_PRICE_NOT_FOUND', async ({ metering }) => {
    await metering.estimateCost({
      provider: 'openai',
      model: 'errors-demo-ghost-model',
      operation: 'chat',
      inputTokens: 100,
      maxOutputTokens: 100,
    })
  }),
}

/**
 * `AI_TOKENS_BUDGET_EXCEEDED`: an ephemeral zero-spend-limit `block` budget
 * on a demo-only scope, consumed once (rejected atomically), then removed
 * in the same call, so nothing persists.
 */
const budgetExceeded: TriggerEntry = {
  requires: 'budgets',
  run: raising('AI_TOKENS_BUDGET_EXCEEDED', async ({ identity, budgets }) => {
    const service = budgets as BudgetService
    const context = contextOf(identity, 'budget')
    const budget = await service.upsertBudget({
      tenantId: context.tenantId,
      scope: context.scope,
      features: [context.feature],
      limitNanoUsd: 0n,
      window: 'month',
      policy: 'block',
    })
    try {
      await service.consume(context, { nanoUsd: 1n, tokens: 0, count: 0 })
    } finally {
      await service.removeBudget(budget.id, context.tenantId)
    }
  }),
}

/**
 * `AI_TOKENS_QUOTA_EXCEEDED`: same ephemeral-budget pattern with a zero
 * TOKEN limit, so the failing dimension raises the 429 quota code.
 */
const quotaExceeded: TriggerEntry = {
  requires: 'budgets',
  run: raising('AI_TOKENS_QUOTA_EXCEEDED', async ({ identity, budgets }) => {
    const service = budgets as BudgetService
    const context = contextOf(identity, 'quota')
    const budget = await service.upsertBudget({
      tenantId: context.tenantId,
      scope: context.scope,
      features: [context.feature],
      limitTokens: 0,
      window: 'month',
      policy: 'block',
    })
    try {
      await service.consume(context, { nanoUsd: 0n, tokens: 1, count: 0 })
    } finally {
      await service.removeBudget(budget.id, context.tenantId)
    }
  }),
}

/**
 * `AI_TOKENS_INSUFFICIENT_CREDITS`: a debit no demo wallet can cover; the
 * atomic conditional debit rejects and writes nothing.
 */
const insufficientCredits: TriggerEntry = {
  requires: 'wallets',
  run: raising('AI_TOKENS_INSUFFICIENT_CREDITS', async ({ identity, wallets }) => {
    await (wallets as WalletService).debit(walletRefOf(identity), {
      amountNanoUsd: IMPOSSIBLE_DEBIT_NANO_USD,
      idempotencyKey: `errors-demo-${randomUUID()}`,
      reason: 'errors-demo trigger (never persisted)',
    })
  }),
}

/**
 * `AI_TOKENS_HOLD_NOT_FOUND`: releasing a fabricated hold whose id is a
 * fresh server-side UUID. The id never comes from the caller, so the
 * endpoint cannot probe foreign holds.
 */
const holdNotFound: TriggerEntry = {
  run: raising('AI_TOKENS_HOLD_NOT_FOUND', async ({ identity, metering }) => {
    const context = contextOf(identity, 'hold')
    await metering.release(
      {
        id: randomUUID(),
        tenantId: context.tenantId,
        scope: context.scope,
        estimatedTokens: 1,
        estimatedCostNanoUsd: 0n,
        expiresAt: new Date(Date.now() + 60_000),
      },
      'errors-demo trigger',
    )
  }),
}

/**
 * `AI_TOKENS_HOLD_ALREADY_SETTLED`: place a 1-nano-USD hold (the amount
 * estimate variant needs no preset), void it, then capture it. The voided
 * hold is the one row this trigger leaves behind; released holds never
 * bill and are excluded from balance math.
 */
const holdAlreadySettled: TriggerEntry = {
  run: raising('AI_TOKENS_HOLD_ALREADY_SETTLED', async ({ identity, metering }) => {
    const context = contextOf(identity, 'hold')
    const hold = await metering.hold(context, { amountNanoUsd: 1n })
    await metering.release(hold, 'errors-demo trigger (voided on purpose)')
    await metering.capture(hold, {})
  }),
}

/**
 * `AI_TOKENS_IDEMPOTENCY_CONFLICT`: reversing a record that does not exist
 * (a fresh server-side UUID); rejected before any write.
 */
const idempotencyConflict: TriggerEntry = {
  run: raising('AI_TOKENS_IDEMPOTENCY_CONFLICT', async ({ ledger }) => {
    await ledger.reverse(randomUUID(), 'errors-demo trigger')
  }),
}

/**
 * `AI_TOKENS_STREAM_USAGE_MISSING`: finalize a stream collector that saw no
 * provider-final usage and has no tokenizer fallback (pure, in-memory).
 */
const streamUsageMissing: TriggerEntry = {
  run: raising('AI_TOKENS_STREAM_USAGE_MISSING', async () => {
    const collector = new StreamUsageCollector({ provider: 'openai', model: 'errors-demo-stream' })
    await collector.finalize()
  }),
}

/**
 * `AI_TOKENS_STORE_ERROR`: an append whose token count exceeds the int4
 * column range; the driver rejects the insert atomically and the adapter
 * maps the unknown driver error to the catalog (nothing is written).
 */
const storeError: TriggerEntry = {
  run: raising('AI_TOKENS_STORE_ERROR', async ({ identity, ledger }) => {
    const context = contextOf(identity, 'store-error')
    await ledger.append({
      tenantId: context.tenantId,
      scope: context.scope,
      provider: 'openai',
      model: 'errors-demo-overflow',
      operation: 'chat',
      serviceTier: 'standard',
      feature: context.feature,
      tags: [],
      inputTokens: INT4_OVERFLOW_TOKENS,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0,
      audioInTokens: 0,
      audioOutTokens: 0,
      imageInTokens: 0,
      imageOutTokens: 0,
      priceVersionId: null,
      rawCostNanoUsd: 0n,
      surchargeNanoUsd: 0n,
      billedCostNanoUsd: 0n,
      markupMultiplier: 1,
      currency: 'USD',
      priceMissing: false,
      status: 'posted',
      isSystemCost: false,
      enforced: false,
      occurredAt: new Date(),
    })
  }),
}

/**
 * `command.missing_translations`: a translate degraded by the
 * partial-translations marker; the produced tokens were debited and the
 * error carries the transaction id.
 */
const missingTranslations: TriggerEntry = {
  run: raising('command.missing_translations', async ({ identity, commands }) => {
    await commands.translate(
      identity,
      translateBodySchema.parse({
        text: 'errors-demo probe @@fail:partial_translations@@',
        targetLanguages: ['pt', 'es'],
      }),
    )
  }),
}

/**
 * Build a marker-driven provider trigger: a REAL `custom` command whose
 * prompt embeds the failure marker. Throw-kind markers abort inside the
 * mock provider BEFORE any usage exists (the hold is released, nothing is
 * debited); the truncate marker degrades the response, so its tokens ARE
 * debited per the documented billing semantics.
 *
 * @param code The app error code the marker raises.
 * @param marker The `@@fail:*@@` marker embedded in the prompt.
 * @returns The registry entry.
 */
function markerTrigger(code: string, marker: string): TriggerEntry {
  return {
    run: raising(code, async ({ identity, commands }) => {
      await commands.custom(
        identity,
        customBodySchema.parse({ userPrompt: `errors-demo probe ${marker}` }),
      )
    }),
  }
}

/**
 * `provider.invalid_json`: a JSON-mode custom command degraded by the
 * bad-json marker; the unparseable result is abandoned WITHOUT a debit
 * (spec §4.3 contract 5).
 */
const providerInvalidJson: TriggerEntry = {
  run: raising('provider.invalid_json', async ({ identity, commands }) => {
    await commands.custom(
      identity,
      customBodySchema.parse({
        userPrompt: 'errors-demo probe @@fail:bad_json@@',
        responseFormat: 'json_object',
      }),
    )
  }),
}

/**
 * Every trigger, keyed by the exact catalog code it raises. Keys mirror the
 * `trigger`-availability rows of `ERROR_CATALOG` (asserted by unit test).
 */
export const TRIGGERS: Readonly<Record<string, TriggerEntry>> = {
  AI_TOKENS_INVALID_CONFIG: invalidConfig,
  AI_TOKENS_UNKNOWN_PROVIDER: unknownProvider,
  AI_TOKENS_USAGE_MALFORMED: usageMalformed,
  AI_TOKENS_PRICE_NOT_FOUND: priceNotFound,
  AI_TOKENS_BUDGET_EXCEEDED: budgetExceeded,
  AI_TOKENS_QUOTA_EXCEEDED: quotaExceeded,
  AI_TOKENS_INSUFFICIENT_CREDITS: insufficientCredits,
  AI_TOKENS_HOLD_NOT_FOUND: holdNotFound,
  AI_TOKENS_HOLD_ALREADY_SETTLED: holdAlreadySettled,
  AI_TOKENS_IDEMPOTENCY_CONFLICT: idempotencyConflict,
  AI_TOKENS_STREAM_USAGE_MISSING: streamUsageMissing,
  AI_TOKENS_STORE_ERROR: storeError,
  'provider.rate_limited': markerTrigger('provider.rate_limited', '@@fail:rate_limited@@'),
  'provider.timeout': markerTrigger('provider.timeout', '@@fail:timeout@@'),
  'provider.empty_response': markerTrigger('provider.empty_response', '@@fail:empty@@'),
  'provider.content_filter': markerTrigger('provider.content_filter', '@@fail:content_filter@@'),
  'provider.api_key_invalid': markerTrigger('provider.api_key_invalid', '@@fail:api_key_invalid@@'),
  'provider.unknown_error': markerTrigger('provider.unknown_error', '@@fail:unknown@@'),
  'provider.response_truncated': markerTrigger('provider.response_truncated', '@@fail:truncate@@'),
  'provider.invalid_json': providerInvalidJson,
  'command.missing_translations': missingTranslations,
}
