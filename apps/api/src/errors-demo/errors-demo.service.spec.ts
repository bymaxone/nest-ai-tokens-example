/**
 * Unit tests for the errors-demo service.
 *
 * Layer: unit.
 * Goal: prove the dispatch policy: catalog listing, unknown code -> 404
 * with the supported list, non-triggerable catalog code -> honest 501,
 * disabled feature block -> 503 quota.disabled, and verbatim propagation
 * when a registry trigger runs.
 * Mocks: the library services (jest fns); the real registry drives the
 * dispatched trigger.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { AiTokensException } from '@bymax-one/nest-ai-tokens'
import type {
  BudgetService,
  LedgerService,
  MeteringService,
  PriceVersion,
  PricingService,
  WalletService,
} from '@bymax-one/nest-ai-tokens'

import { backdatedCostBodySchema } from './dto/backdated-cost.body.js'
import { ERROR_CATALOG } from './error-catalog.js'
import { ErrorsDemoService } from './errors-demo.service.js'
import { TRIGGERS } from './trigger-registry.js'
import { ApiException } from '../common/api-exception.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import type { WorkspaceCommandService } from '../workspace/workspace-command.service.js'

const ada: DemoIdentity = { id: 'ada', tenantId: 'acme' }

/** Build the service with mockable dependencies. */
function serviceWith(overrides: {
  metering?: Partial<MeteringService>
  ledger?: Partial<LedgerService>
  pricing?: Partial<PricingService>
  wallets?: WalletService | null
  budgets?: BudgetService | null
}): ErrorsDemoService {
  return new ErrorsDemoService(
    (overrides.metering ?? {}) as MeteringService,
    (overrides.ledger ?? {}) as LedgerService,
    (overrides.pricing ?? {}) as PricingService,
    overrides.wallets ?? null,
    overrides.budgets ?? null,
    {} as WorkspaceCommandService,
  )
}

describe('ErrorsDemoService.catalog', () => {
  /**
   * Catalog listing.
   *
   * The view exposes every catalog entry plus the registry's triggerable
   * keys, giving clients one discovery surface for the error walk.
   */
  it('returns the full catalog and the triggerable codes', () => {
    const view = serviceWith({}).catalog()

    expect(view.entries).toBe(ERROR_CATALOG)
    expect(view.triggerable).toEqual(Object.keys(TRIGGERS))
  })
})

describe('ErrorsDemoService.trigger dispatch', () => {
  /**
   * Unknown code.
   *
   * A code outside the catalog gets the demo-infrastructure 404 whose
   * details list the supported trigger codes (never echoing the input).
   */
  it('throws the 404 with the supported list for an unknown code', async () => {
    expect.assertions(4)

    try {
      await serviceWith({}).trigger(ada, 'no.such_code')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException)
      const exception = error as ApiException
      expect(exception.getStatus()).toBe(404)
      expect(exception.code).toBe('errors_demo.unknown_code')
      const body = exception.getResponse() as {
        error: { details: { supported: string[] }; message: string }
      }
      expect(body.error.details.supported).toEqual(Object.keys(TRIGGERS))
    }
  })

  /**
   * Prototype-chain probe.
   *
   * A URL parameter naming an inherited object member ('constructor')
   * must be treated as an unknown code (own-key lookup only), never
   * dereferenced as a registry entry.
   */
  it('treats prototype-chain names as unknown codes', async () => {
    expect.assertions(2)

    try {
      await serviceWith({}).trigger(ada, 'constructor')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException)
      expect((error as ApiException).code).toBe('errors_demo.unknown_code')
    }
  })

  /**
   * Honest non-triggerable rejection.
   *
   * A catalog code that is boot-variant/e2e-only/reserved must answer 501
   * with the availability and the reason, never fake the error.
   */
  it('throws the honest 501 for a non-triggerable catalog code', async () => {
    expect.assertions(3)

    try {
      await serviceWith({}).trigger(ada, 'AI_TOKENS_NOT_CONFIGURED')
    } catch (error) {
      const exception = error as ApiException
      expect(exception.getStatus()).toBe(501)
      expect(exception.code).toBe('errors_demo.not_triggerable')
      const body = exception.getResponse() as { error: { details: { availability: string } } }
      expect(body.error.details.availability).toBe('reserved')
    }
  })

  /**
   * Disabled wallets block.
   *
   * A wallet-dependent trigger with the block off answers the app's
   * documented 503 quota.disabled instead of a confusing null failure.
   */
  it('throws 503 quota.disabled for a wallet trigger when wallets are off', async () => {
    expect.assertions(2)

    try {
      await serviceWith({ wallets: null }).trigger(ada, 'AI_TOKENS_INVALID_CONFIG')
    } catch (error) {
      const exception = error as ApiException
      expect(exception.getStatus()).toBe(503)
      expect(exception.code).toBe('quota.disabled')
    }
  })

  /**
   * Disabled budgets block.
   *
   * Same policy for budget-dependent triggers.
   */
  it('throws 503 quota.disabled for a budget trigger when budgets are off', async () => {
    expect.assertions(1)

    try {
      await serviceWith({ budgets: null }).trigger(ada, 'AI_TOKENS_BUDGET_EXCEEDED')
    } catch (error) {
      expect((error as ApiException).code).toBe('quota.disabled')
    }
  })

  /**
   * Verbatim propagation through a real registry entry.
   *
   * Dispatching a triggerable code runs the registry function against the
   * injected services and re-raises the library exception UNTOUCHED (the
   * one-envelope rule).
   */
  it('runs the registry trigger and propagates the library exception', async () => {
    const raised = new AiTokensException('AI_TOKENS_IDEMPOTENCY_CONFLICT')
    const reverse = jest.fn<LedgerService['reverse']>().mockRejectedValue(raised)

    await expect(
      serviceWith({ ledger: { reverse } }).trigger(ada, 'AI_TOKENS_IDEMPOTENCY_CONFLICT'),
    ).rejects.toBe(raised)

    expect(reverse).toHaveBeenCalledTimes(1)
  })
})

describe('ErrorsDemoService.backdatedCost', () => {
  const body = backdatedCostBodySchema.parse({
    model: 'mock-chat-pro',
    promptTokens: 1000,
    completionTokens: 500,
    date: '2026-01-15T00:00:00.000Z',
  })

  /**
   * Historical pricing read pair.
   *
   * The helper resolves the rate AT the supplied date and estimates the
   * cost at that same instant, returning both JSON-safe (bigint money as
   * decimal strings) with NO write anywhere.
   */
  it('returns the effective rate and the estimate at the supplied date', async () => {
    const rate = {
      id: 'pv-1',
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      serviceTier: 'standard',
      inputNanoUsdPerMillion: 2_000_000_000n,
      outputNanoUsdPerMillion: 8_000_000_000n,
      currency: 'USD',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      source: 'seed',
    } as unknown as PriceVersion
    const resolveRate = jest.fn<PricingService['resolveRate']>().mockResolvedValue(rate)
    const estimateCost = jest
      .fn<MeteringService['estimateCost']>()
      .mockResolvedValue({ rawCostNanoUsd: 6_000_000n, billedCostNanoUsd: 7_500_000n })

    const result = await serviceWith({
      pricing: { resolveRate },
      metering: { estimateCost },
    }).backdatedCost(body)

    expect(resolveRate).toHaveBeenCalledWith({
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      at: new Date('2026-01-15T00:00:00.000Z'),
    })
    expect(estimateCost).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 1000,
        maxOutputTokens: 500,
        at: new Date('2026-01-15T00:00:00.000Z'),
      }),
    )
    expect(result.cost).toEqual({ rawCostNanoUsd: '6000000', billedCostNanoUsd: '7500000' })
    expect(result.pricing).toMatchObject({ id: 'pv-1', inputNanoUsdPerMillion: '2000000000' })
  })

  /**
   * Non-strict misconfiguration guard.
   *
   * Strict pricing throws on a miss, so a null rate can only mean the
   * registry was rewired non-strict; the helper rejects with its own 500
   * instead of returning a half-empty payload.
   */
  it('rejects with 500 when the rate resolves to null', async () => {
    const resolveRate = jest.fn<PricingService['resolveRate']>().mockResolvedValue(null)
    const estimateCost = jest
      .fn<MeteringService['estimateCost']>()
      .mockResolvedValue({ rawCostNanoUsd: 0n, billedCostNanoUsd: 0n })
    expect.assertions(2)

    try {
      await serviceWith({ pricing: { resolveRate }, metering: { estimateCost } }).backdatedCost(
        body,
      )
    } catch (error) {
      expect((error as ApiException).code).toBe('errors_demo.pricing_unavailable')
      expect((error as ApiException).getStatus()).toBe(500)
    }
  })
})
