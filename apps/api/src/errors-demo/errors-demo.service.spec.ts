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
  WalletService,
} from '@bymax-one/nest-ai-tokens'

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
  wallets?: WalletService | null
  budgets?: BudgetService | null
}): ErrorsDemoService {
  return new ErrorsDemoService(
    (overrides.metering ?? {}) as MeteringService,
    (overrides.ledger ?? {}) as LedgerService,
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
