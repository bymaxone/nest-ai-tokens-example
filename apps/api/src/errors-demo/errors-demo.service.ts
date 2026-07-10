/**
 * @fileoverview Executes the error-catalog triggers. The service resolves
 * the per-request toolkit (library services plus the caller identity),
 * dispatches to the registry, and lets the raised exception propagate
 * UNTOUCHED so clients receive the real status and canonical envelope.
 * Unknown codes get a 404 listing the supported ones; catalog codes whose
 * availability is not `trigger` get an honest 501 explaining how the code
 * is actually proven.
 *
 * @layer errors-demo
 */
import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import {
  BudgetService,
  LedgerService,
  MeteringService,
  PricingService,
  WalletService,
  toJsonSafe,
} from '@bymax-one/nest-ai-tokens'
import type { CostEstimate, JsonSafe, PriceVersion } from '@bymax-one/nest-ai-tokens'

import type { BackdatedCostBody } from './dto/backdated-cost.body.js'
import { ERROR_CATALOG, ERROR_CATALOG_BY_CODE } from './error-catalog.js'
import type { ErrorCatalogEntry } from './error-catalog.js'
import { TRIGGERS } from './trigger-registry.js'
import { ApiException } from '../common/api-exception.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import { WorkspaceCommandService } from '../workspace/workspace-command.service.js'

/** The catalog listing served by `GET /errors-demo`. */
export interface ErrorCatalogView {
  /** Every code of the combined app + library surface. */
  readonly entries: readonly ErrorCatalogEntry[]
  /** The codes `POST /errors-demo/:code` can raise on demand. */
  readonly triggerable: readonly string[]
}

/** The backdated-cost helper result: the resolved rate plus the estimate. */
export interface BackdatedCostResult {
  /** The price version in effect at the supplied date. */
  readonly pricing: JsonSafe<PriceVersion>
  /** The raw and billed nano-USD estimate at that rate (decimal strings). */
  readonly cost: JsonSafe<CostEstimate>
}

/** Serves the error catalog and runs its triggers. */
@Injectable()
export class ErrorsDemoService {
  /**
   * @param metering The library metering lifecycle service.
   * @param ledger The library append-only ledger service.
   * @param wallets The library wallet service, or `null` when disabled.
   * @param budgets The library budget service, or `null` when disabled.
   * @param commands The workspace command service (marker-driven triggers).
   */
  constructor(
    @Inject(MeteringService) private readonly metering: MeteringService,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(PricingService) private readonly pricing: PricingService,
    @Inject(WalletService) private readonly wallets: WalletService | null,
    @Inject(BudgetService) private readonly budgets: BudgetService | null,
    @Inject(WorkspaceCommandService) private readonly commands: WorkspaceCommandService,
  ) {}

  /**
   * The full catalog plus the currently triggerable codes.
   *
   * @returns The catalog view.
   */
  catalog(): ErrorCatalogView {
    return { entries: ERROR_CATALOG, triggerable: Object.keys(TRIGGERS) }
  }

  /**
   * Price a hypothetical call AT a historical date: the rate in effect at
   * that instant plus the raw/billed estimate. A pure read pair (strict
   * resolution + pure estimate); NOTHING is written to the ledger. Past
   * records are never re-rated; this shows what a call would have cost.
   *
   * @param body The validated model, token counts, and historical date.
   * @returns The effective price version and the cost estimate.
   * @throws {AiTokensException} `AI_TOKENS_PRICE_NOT_FOUND` when no rate was in effect at the date.
   */
  async backdatedCost(body: BackdatedCostBody): Promise<BackdatedCostResult> {
    const pricing = await this.pricing.resolveRate({
      provider: body.provider,
      model: body.model,
      operation: 'chat',
      at: body.date,
    })
    const cost = await this.metering.estimateCost({
      provider: body.provider,
      model: body.model,
      operation: 'chat',
      inputTokens: body.promptTokens,
      maxOutputTokens: body.completionTokens,
      at: body.date,
    })
    // Strict mode makes resolveRate throw on a miss; a null can only mean
    // the module was rewired non-strict, which this demo does not support.
    if (pricing === null) {
      throw new ApiException(
        'errors_demo.pricing_unavailable',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'No rate resolved for the supplied date; the demo expects strict pricing.',
      )
    }
    return { pricing: toJsonSafe(pricing), cost: toJsonSafe(cost) }
  }

  /**
   * Raise the requested catalog code through its real code path. This
   * method NEVER returns: it either propagates the triggered exception
   * verbatim or throws the demo-infrastructure rejection (unknown code,
   * non-triggerable code, disabled feature block).
   *
   * @param identity The caller identity (triggers stay in its tenant).
   * @param code The catalog code to raise.
   * @throws The requested error, verbatim, on a successful trigger.
   * @throws {ApiException} `errors_demo.unknown_code` (404) for a code outside the catalog.
   * @throws {ApiException} `errors_demo.not_triggerable` (501) for boot-variant/e2e-only/reserved codes.
   * @throws {ApiException} `quota.disabled` (503) when the trigger needs a disabled feature block.
   */
  async trigger(identity: DemoIdentity, code: string): Promise<never> {
    // Own-key lookup only: a prototype-chain name ('constructor', ...) in
    // the URL parameter must be an unknown code, never an object member.
    const entry = Object.hasOwn(TRIGGERS, code) ? TRIGGERS[code] : undefined
    if (entry === undefined) throw notTriggerable(code)
    if (entry.requires === 'wallets' && this.wallets === null) throw quotaDisabled()
    if (entry.requires === 'budgets' && this.budgets === null) throw quotaDisabled()
    return entry.run({
      identity,
      metering: this.metering,
      ledger: this.ledger,
      wallets: this.wallets,
      budgets: this.budgets,
      commands: this.commands,
    })
  }
}

/** Build the unknown-code 404 / honest not-triggerable 501 rejection. */
function notTriggerable(code: string): ApiException {
  const entry = ERROR_CATALOG_BY_CODE.get(code)
  if (entry === undefined) {
    return new ApiException(
      'errors_demo.unknown_code',
      HttpStatus.NOT_FOUND,
      'Unknown error code. The supported trigger codes are listed in details.supported.',
      { supported: Object.keys(TRIGGERS) },
    )
  }
  return new ApiException(
    'errors_demo.not_triggerable',
    HttpStatus.NOT_IMPLEMENTED,
    'This catalog code cannot be raised on demand; details.reason explains how it is proven.',
    { code: entry.code, availability: entry.availability, reason: entry.summary },
  )
}

/** The app's documented feature-block rejection, reused verbatim. */
function quotaDisabled(): ApiException {
  return new ApiException(
    'quota.disabled',
    HttpStatus.SERVICE_UNAVAILABLE,
    'This trigger needs the wallets/budgets feature blocks (set QUOTA_ENABLED=true).',
  )
}
