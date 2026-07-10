/**
 * Unit tests for the error-trigger registry.
 *
 * Layer: unit.
 * Goal: prove every trigger calls the right library/service API with
 * demo-scoped, caller-tenant arguments, propagates the raised exception
 * verbatim, and fails loudly ("did not raise") if the call unexpectedly
 * succeeds. The budget triggers must remove their ephemeral budget even
 * when consume throws.
 * Mocks: the toolkit services (jest fns); the stream trigger runs the real
 * `StreamUsageCollector`.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { AiTokensException } from '@bymax-one/nest-ai-tokens'
import type {
  Budget,
  BudgetService,
  Hold,
  LedgerService,
  MeteringService,
  UsageRecord,
  WalletEntry,
  WalletService,
} from '@bymax-one/nest-ai-tokens'

import { TRIGGERS } from './trigger-registry.js'
import type { TriggerToolkit } from './trigger-registry.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import type { WorkspaceCommandService } from '../workspace/workspace-command.service.js'

const ada: DemoIdentity = { id: 'ada', tenantId: 'acme' }

/** A sentinel the mocked service throws; triggers must propagate it as-is. */
const sentinel = new AiTokensException('AI_TOKENS_STORE_ERROR')

/** Build a fully-mocked toolkit; individual tests override what they need. */
function toolkitWith(overrides: Partial<TriggerToolkit> = {}): TriggerToolkit {
  return {
    identity: ada,
    metering: {} as MeteringService,
    ledger: {} as LedgerService,
    wallets: null,
    budgets: null,
    commands: {} as WorkspaceCommandService,
    ...overrides,
  }
}

/** Resolve a registry entry or fail the test loudly. */
function triggerOf(code: string) {
  const entry = TRIGGERS[code]
  if (entry === undefined) throw new Error(`registry must define ${code}`)
  return entry
}

describe('AI_TOKENS_INVALID_CONFIG trigger', () => {
  /**
   * Zero-amount grant path.
   *
   * The trigger asks the wallet service to grant 0 nano-USD to the
   * CALLER's own wallet; the library rejects before writing, and the
   * exception must propagate untouched.
   */
  it('grants zero to the caller wallet and propagates the rejection', async () => {
    const grant = jest.fn<WalletService['grant']>().mockRejectedValue(sentinel)
    const toolkit = toolkitWith({ wallets: { grant } as unknown as WalletService })

    await expect(triggerOf('AI_TOKENS_INVALID_CONFIG').run(toolkit)).rejects.toBe(sentinel)

    expect(grant).toHaveBeenCalledWith(
      { tenantId: 'acme', ownerType: 'user', ownerId: 'ada' },
      expect.objectContaining({ amountNanoUsd: 0n }),
    )
  })

  /**
   * Loud-failure guard.
   *
   * If the library ever accepted the invalid input, the trigger must fail
   * with the "did not raise" bug marker instead of returning success.
   */
  it('fails loudly when the grant unexpectedly succeeds', async () => {
    const grant = jest.fn<WalletService['grant']>().mockResolvedValue({} as WalletEntry)
    const toolkit = toolkitWith({ wallets: { grant } as unknown as WalletService })

    await expect(triggerOf('AI_TOKENS_INVALID_CONFIG').run(toolkit)).rejects.toThrow(
      'did not raise',
    )
  })
})

describe('metering record triggers', () => {
  /**
   * Unknown-provider path.
   *
   * Raw usage with no preset/normalizer goes to `record()` under the
   * demo-labeled context; the rejection propagates verbatim.
   */
  it('records preset-less raw usage under the demo feature', async () => {
    const record = jest.fn<MeteringService['record']>().mockRejectedValue(sentinel)
    const toolkit = toolkitWith({ metering: { record } as unknown as MeteringService })

    await expect(triggerOf('AI_TOKENS_UNKNOWN_PROVIDER').run(toolkit)).rejects.toBe(sentinel)

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { tokens: 1 },
        context: expect.objectContaining({ tenantId: 'acme', feature: 'errors-demo.record' }),
      }),
    )
    expect(record.mock.calls[0]?.[0]).not.toHaveProperty('preset')
  })

  /**
   * Malformed-usage path.
   *
   * The OpenAI preset is supplied so the normalizer runs and fails on the
   * token-field-less payload; the rejection propagates verbatim.
   */
  it('records a token-field-less payload through the OpenAI preset', async () => {
    const record = jest.fn<MeteringService['record']>().mockRejectedValue(sentinel)
    const toolkit = toolkitWith({ metering: { record } as unknown as MeteringService })

    await expect(triggerOf('AI_TOKENS_USAGE_MALFORMED').run(toolkit)).rejects.toBe(sentinel)

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ preset: expect.objectContaining({ provider: 'openai' }) }),
    )
  })

  /**
   * Loud-failure guard for the record triggers.
   *
   * A successful record would mean the trigger silently appended a ledger
   * row; the bug marker must surface instead.
   */
  it('fails loudly when record unexpectedly succeeds', async () => {
    const record = jest.fn<MeteringService['record']>().mockResolvedValue({} as UsageRecord)
    const toolkit = toolkitWith({ metering: { record } as unknown as MeteringService })

    await expect(triggerOf('AI_TOKENS_UNKNOWN_PROVIDER').run(toolkit)).rejects.toThrow(
      'did not raise',
    )
    await expect(triggerOf('AI_TOKENS_USAGE_MALFORMED').run(toolkit)).rejects.toThrow(
      'did not raise',
    )
  })
})

describe('AI_TOKENS_PRICE_NOT_FOUND trigger', () => {
  /**
   * Pure estimate path.
   *
   * The trigger estimates a ghost model's cost (no side effects by
   * contract); strict pricing rejects and the exception propagates.
   */
  it('estimates a ghost model and propagates the strict-mode rejection', async () => {
    const estimateCost = jest.fn<MeteringService['estimateCost']>().mockRejectedValue(sentinel)
    const toolkit = toolkitWith({ metering: { estimateCost } as unknown as MeteringService })

    await expect(triggerOf('AI_TOKENS_PRICE_NOT_FOUND').run(toolkit)).rejects.toBe(sentinel)

    expect(estimateCost).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'errors-demo-ghost-model', operation: 'chat' }),
    )
  })

  /**
   * Loud-failure guard.
   *
   * A resolvable ghost model would be a seed regression; the bug marker
   * must surface instead of success.
   */
  it('fails loudly when the estimate unexpectedly succeeds', async () => {
    const estimateCost = jest
      .fn<MeteringService['estimateCost']>()
      .mockResolvedValue({ rawCostNanoUsd: 0n, billedCostNanoUsd: 0n })
    const toolkit = toolkitWith({ metering: { estimateCost } as unknown as MeteringService })

    await expect(triggerOf('AI_TOKENS_PRICE_NOT_FOUND').run(toolkit)).rejects.toThrow(
      'did not raise',
    )
  })
})

describe('ephemeral budget triggers', () => {
  /** Build a budget service double whose consume rejects. */
  function budgetsWith(consumeError: unknown) {
    const upsertBudget = jest
      .fn<BudgetService['upsertBudget']>()
      .mockResolvedValue({ id: 'demo-budget' } as Budget)
    const consume =
      consumeError === undefined
        ? jest.fn<BudgetService['consume']>().mockResolvedValue(undefined)
        : jest.fn<BudgetService['consume']>().mockRejectedValue(consumeError)
    const removeBudget = jest.fn<BudgetService['removeBudget']>().mockResolvedValue(undefined)
    return {
      service: { upsertBudget, consume, removeBudget } as unknown as BudgetService,
      upsertBudget,
      consume,
      removeBudget,
    }
  }

  /**
   * Budget-exceeded path with cleanup.
   *
   * The trigger creates a zero-SPEND-limit block budget scoped to the demo
   * feature inside the caller tenant, consumes 1 nano-USD (rejected), and
   * must remove the budget even though consume threw.
   */
  it('creates, consumes, and removes the zero-spend budget', async () => {
    const { service, upsertBudget, consume, removeBudget } = budgetsWith(sentinel)

    await expect(
      triggerOf('AI_TOKENS_BUDGET_EXCEEDED').run(toolkitWith({ budgets: service })),
    ).rejects.toBe(sentinel)

    expect(upsertBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'acme',
        limitNanoUsd: 0n,
        policy: 'block',
        features: ['errors-demo.budget'],
      }),
    )
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'errors-demo.budget' }),
      { nanoUsd: 1n, tokens: 0, count: 0 },
    )
    expect(removeBudget).toHaveBeenCalledWith('demo-budget', 'acme')
  })

  /**
   * Quota-exceeded path with cleanup.
   *
   * Same ephemeral pattern with a zero TOKEN limit and a 1-token demand,
   * so the failing dimension is the 429 quota one; cleanup still runs.
   */
  it('creates, consumes, and removes the zero-token budget', async () => {
    const { service, upsertBudget, consume, removeBudget } = budgetsWith(sentinel)

    await expect(
      triggerOf('AI_TOKENS_QUOTA_EXCEEDED').run(toolkitWith({ budgets: service })),
    ).rejects.toBe(sentinel)

    expect(upsertBudget).toHaveBeenCalledWith(
      expect.objectContaining({ limitTokens: 0, features: ['errors-demo.quota'] }),
    )
    expect(consume).toHaveBeenCalledWith(expect.anything(), { nanoUsd: 0n, tokens: 1, count: 0 })
    expect(removeBudget).toHaveBeenCalledWith('demo-budget', 'acme')
  })

  /**
   * Loud-failure guard with cleanup.
   *
   * If the zero-limit budget ever failed to block, the trigger must still
   * remove it and surface the bug marker.
   */
  it('fails loudly and still cleans up when consume unexpectedly passes', async () => {
    const { service, removeBudget } = budgetsWith(undefined)

    await expect(
      triggerOf('AI_TOKENS_BUDGET_EXCEEDED').run(toolkitWith({ budgets: service })),
    ).rejects.toThrow('did not raise')
    await expect(
      triggerOf('AI_TOKENS_QUOTA_EXCEEDED').run(toolkitWith({ budgets: service })),
    ).rejects.toThrow('did not raise')

    expect(removeBudget).toHaveBeenCalledTimes(2)
  })
})

describe('AI_TOKENS_INSUFFICIENT_CREDITS trigger', () => {
  /**
   * Impossible-debit path.
   *
   * The trigger debits the CALLER's own wallet with an amount no demo
   * wallet can cover; the atomic conditional debit rejects without a
   * write and the exception propagates.
   */
  it('debits an impossible amount from the caller wallet', async () => {
    const debit = jest.fn<WalletService['debit']>().mockRejectedValue(sentinel)
    const toolkit = toolkitWith({ wallets: { debit } as unknown as WalletService })

    await expect(triggerOf('AI_TOKENS_INSUFFICIENT_CREDITS').run(toolkit)).rejects.toBe(sentinel)

    expect(debit).toHaveBeenCalledWith(
      { tenantId: 'acme', ownerType: 'user', ownerId: 'ada' },
      expect.objectContaining({ amountNanoUsd: 9_000_000_000_000_000_000n }),
    )
  })

  /**
   * Loud-failure guard.
   *
   * A successful trillion-dollar debit is a catastrophic regression; the
   * bug marker must surface.
   */
  it('fails loudly when the debit unexpectedly succeeds', async () => {
    const debit = jest.fn<WalletService['debit']>().mockResolvedValue({} as WalletEntry)
    const toolkit = toolkitWith({ wallets: { debit } as unknown as WalletService })

    await expect(triggerOf('AI_TOKENS_INSUFFICIENT_CREDITS').run(toolkit)).rejects.toThrow(
      'did not raise',
    )
  })
})

describe('hold triggers', () => {
  /**
   * Fabricated-hold release path.
   *
   * The hold id is a fresh server-side UUID inside the caller's tenant:
   * the endpoint can never probe foreign holds. The not-found rejection
   * propagates verbatim.
   */
  it('releases a fabricated caller-tenant hold', async () => {
    const release = jest.fn<MeteringService['release']>().mockRejectedValue(sentinel)
    const toolkit = toolkitWith({ metering: { release } as unknown as MeteringService })

    await expect(triggerOf('AI_TOKENS_HOLD_NOT_FOUND').run(toolkit)).rejects.toBe(sentinel)

    const [hold] = release.mock.calls[0] ?? []
    expect(hold).toMatchObject({ tenantId: 'acme', scope: { type: 'user', id: 'ada' } })
    expect(hold?.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  /**
   * Loud-failure guard for the fabricated hold.
   *
   * Releasing a hold that cannot exist must never succeed.
   */
  it('fails loudly when releasing the fabricated hold succeeds', async () => {
    const release = jest.fn<MeteringService['release']>().mockResolvedValue(undefined)
    const toolkit = toolkitWith({ metering: { release } as unknown as MeteringService })

    await expect(triggerOf('AI_TOKENS_HOLD_NOT_FOUND').run(toolkit)).rejects.toThrow(
      'did not raise',
    )
  })

  /**
   * Place-void-capture path.
   *
   * The trigger places a real 1-nano-USD hold, voids it, then captures
   * it; the already-settled rejection from capture propagates verbatim.
   */
  it('places, releases, then captures the same hold', async () => {
    const placed = { id: 'hold-1', tenantId: 'acme' } as Hold
    const hold = jest.fn<MeteringService['hold']>().mockResolvedValue(placed)
    const release = jest.fn<MeteringService['release']>().mockResolvedValue(undefined)
    const capture = jest.fn<MeteringService['capture']>().mockRejectedValue(sentinel)
    const toolkit = toolkitWith({
      metering: { hold, release, capture } as unknown as MeteringService,
    })

    await expect(triggerOf('AI_TOKENS_HOLD_ALREADY_SETTLED').run(toolkit)).rejects.toBe(sentinel)

    expect(hold).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'acme', feature: 'errors-demo.hold' }),
      { amountNanoUsd: 1n },
    )
    expect(release).toHaveBeenCalledWith(placed, expect.stringContaining('voided on purpose'))
    expect(capture).toHaveBeenCalledWith(placed, {})
  })

  /**
   * Loud-failure guard for the voided capture.
   *
   * Capturing a voided hold must never settle; success surfaces the bug
   * marker.
   */
  it('fails loudly when capturing the voided hold succeeds', async () => {
    const hold = jest.fn<MeteringService['hold']>().mockResolvedValue({ id: 'h' } as never)
    const release = jest.fn<MeteringService['release']>().mockResolvedValue(undefined)
    const capture = jest.fn<MeteringService['capture']>().mockResolvedValue({} as UsageRecord)
    const toolkit = toolkitWith({
      metering: { hold, release, capture } as unknown as MeteringService,
    })

    await expect(triggerOf('AI_TOKENS_HOLD_ALREADY_SETTLED').run(toolkit)).rejects.toThrow(
      'did not raise',
    )
  })
})

describe('AI_TOKENS_IDEMPOTENCY_CONFLICT trigger', () => {
  /**
   * Ghost-reversal path.
   *
   * Reversing a fresh server-side UUID cannot match any record; the
   * conflict rejection propagates verbatim.
   */
  it('reverses a server-generated ghost id', async () => {
    const reverse = jest.fn<LedgerService['reverse']>().mockRejectedValue(sentinel)
    const toolkit = toolkitWith({ ledger: { reverse } as unknown as LedgerService })

    await expect(triggerOf('AI_TOKENS_IDEMPOTENCY_CONFLICT').run(toolkit)).rejects.toBe(sentinel)

    expect(reverse).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      expect.any(String),
    )
  })

  /**
   * Loud-failure guard.
   *
   * Reversing a nonexistent record must never succeed.
   */
  it('fails loudly when the ghost reversal succeeds', async () => {
    const reverse = jest.fn<LedgerService['reverse']>().mockResolvedValue({} as UsageRecord)
    const toolkit = toolkitWith({ ledger: { reverse } as unknown as LedgerService })

    await expect(triggerOf('AI_TOKENS_IDEMPOTENCY_CONFLICT').run(toolkit)).rejects.toThrow(
      'did not raise',
    )
  })
})

describe('AI_TOKENS_STREAM_USAGE_MISSING trigger', () => {
  /**
   * Real collector path (pure, in-memory).
   *
   * Finalizing a collector that saw no chunks and has no tokenizer raises
   * the real library exception; this trigger needs no mocks at all.
   */
  it('raises the real exception from an empty stream collector', async () => {
    expect.assertions(2)

    try {
      await triggerOf('AI_TOKENS_STREAM_USAGE_MISSING').run(toolkitWith())
    } catch (error) {
      expect(error).toBeInstanceOf(AiTokensException)
      expect((error as AiTokensException).getStatus()).toBe(422)
    }
  })
})

describe('AI_TOKENS_STORE_ERROR trigger', () => {
  /**
   * Int4-overflow append path.
   *
   * The append carries a token count one past the int4 ceiling under the
   * demo feature in the caller's tenant; the adapter rejection propagates
   * verbatim.
   */
  it('appends an int4-overflowing record in the caller tenant', async () => {
    const append = jest.fn<LedgerService['append']>().mockRejectedValue(sentinel)
    const toolkit = toolkitWith({ ledger: { append } as unknown as LedgerService })

    await expect(triggerOf('AI_TOKENS_STORE_ERROR').run(toolkit)).rejects.toBe(sentinel)

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'acme',
        feature: 'errors-demo.store-error',
        inputTokens: 2_147_483_648,
        billedCostNanoUsd: 0n,
      }),
    )
  })

  /**
   * Loud-failure guard.
   *
   * If the driver ever accepted the overflow, a garbage row would exist;
   * the bug marker must surface.
   */
  it('fails loudly when the overflow append succeeds', async () => {
    const append = jest.fn<LedgerService['append']>().mockResolvedValue({} as UsageRecord)
    const toolkit = toolkitWith({ ledger: { append } as unknown as LedgerService })

    await expect(triggerOf('AI_TOKENS_STORE_ERROR').run(toolkit)).rejects.toThrow('did not raise')
  })
})

describe('provider marker triggers', () => {
  const MARKER_CODES: readonly (readonly [string, string])[] = [
    ['provider.rate_limited', '@@fail:rate_limited@@'],
    ['provider.timeout', '@@fail:timeout@@'],
    ['provider.empty_response', '@@fail:empty@@'],
    ['provider.content_filter', '@@fail:content_filter@@'],
    ['provider.api_key_invalid', '@@fail:api_key_invalid@@'],
    ['provider.unknown_error', '@@fail:unknown@@'],
    ['provider.response_truncated', '@@fail:truncate@@'],
  ]

  it.each(MARKER_CODES)(
    /**
     * Marker embedding per provider code.
     *
     * Each provider trigger runs a REAL custom command whose prompt embeds
     * exactly its failure marker; the raised error propagates verbatim.
     */
    '%s embeds %s in a real custom command',
    async (code, marker) => {
      const custom = jest.fn<WorkspaceCommandService['custom']>().mockRejectedValue(sentinel)
      const toolkit = toolkitWith({ commands: { custom } as unknown as WorkspaceCommandService })

      await expect(triggerOf(code).run(toolkit)).rejects.toBe(sentinel)

      expect(custom).toHaveBeenCalledWith(
        ada,
        expect.objectContaining({ userPrompt: expect.stringContaining(marker) }),
      )
    },
  )

  /**
   * JSON-mode bad-json path.
   *
   * `provider.invalid_json` must request `json_object` output so the
   * degraded content fails the parse (which never debits); the marker
   * rides the prompt.
   */
  it('provider.invalid_json requests json_object output with the bad-json marker', async () => {
    const custom = jest.fn<WorkspaceCommandService['custom']>().mockRejectedValue(sentinel)
    const toolkit = toolkitWith({ commands: { custom } as unknown as WorkspaceCommandService })

    await expect(triggerOf('provider.invalid_json').run(toolkit)).rejects.toBe(sentinel)

    expect(custom).toHaveBeenCalledWith(
      ada,
      expect.objectContaining({
        userPrompt: expect.stringContaining('@@fail:bad_json@@'),
        responseFormat: 'json_object',
      }),
    )
  })

  /**
   * Loud-failure guard for the marker triggers.
   *
   * A marker call that resolves means the mock stopped honoring markers;
   * the bug marker must surface.
   */
  it('fails loudly when a marker command unexpectedly succeeds', async () => {
    const custom = jest.fn<WorkspaceCommandService['custom']>().mockResolvedValue({} as never)
    const toolkit = toolkitWith({ commands: { custom } as unknown as WorkspaceCommandService })

    await expect(triggerOf('provider.timeout').run(toolkit)).rejects.toThrow('did not raise')
    await expect(triggerOf('provider.invalid_json').run(toolkit)).rejects.toThrow('did not raise')
  })
})

describe('command.missing_translations trigger', () => {
  /**
   * Marker-driven translate path.
   *
   * The trigger runs a REAL translate whose text embeds the
   * partial-translations marker; the workspace outcome error propagates
   * verbatim (tokens were debited per the documented billing semantics).
   */
  it('translates marker text through the real command path', async () => {
    const translate = jest.fn<WorkspaceCommandService['translate']>().mockRejectedValue(sentinel)
    const toolkit = toolkitWith({
      commands: { translate } as unknown as WorkspaceCommandService,
    })

    await expect(triggerOf('command.missing_translations').run(toolkit)).rejects.toBe(sentinel)

    expect(translate).toHaveBeenCalledWith(
      ada,
      expect.objectContaining({
        text: expect.stringContaining('@@fail:partial_translations@@'),
        targetLanguages: ['pt', 'es'],
      }),
    )
  })

  /**
   * Loud-failure guard.
   *
   * A translate that returns all languages despite the marker is a mock
   * regression; the bug marker must surface.
   */
  it('fails loudly when the marker translate succeeds', async () => {
    const translate = jest.fn<WorkspaceCommandService['translate']>().mockResolvedValue({} as never)
    const toolkit = toolkitWith({
      commands: { translate } as unknown as WorkspaceCommandService,
    })

    await expect(triggerOf('command.missing_translations').run(toolkit)).rejects.toThrow(
      'did not raise',
    )
  })
})
