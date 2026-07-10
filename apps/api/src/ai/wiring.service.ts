/**
 * @fileoverview Wiring smoke service: resolves the library's exported
 * services and tokens from the container to prove the `forRootAsync`
 * registration, and reports the effective (resolved) options. Every library
 * token is injected explicitly. The `BYMAX_AI_TOKENS_LOGGER` token is a
 * reserved extension point in v0.1.0: the module binds it to `null` and no
 * shipped service consumes it yet, so the report surfaces it honestly
 * instead of pretending a logger bridge is wireable.
 *
 * @layer ai
 */
import { Inject, Injectable } from '@nestjs/common'
import {
  BYMAX_AI_TOKENS_LOGGER,
  BYMAX_AI_TOKENS_OPTIONS,
  LedgerService,
  PricingService,
} from '@bymax-one/nest-ai-tokens'

/**
 * Structural view over the resolved options bound to
 * `BYMAX_AI_TOKENS_OPTIONS` (the library keeps its full resolved-options
 * type internal; this subset covers what the report exposes).
 */
export interface ResolvedOptionsView {
  /** Presentation currency. */
  readonly currency: string
  /** Default rating mode. */
  readonly ratingMode: string
  /** Resolved pricing behavior. */
  readonly pricing: { readonly cacheTtlMs: number; readonly strict: boolean }
  /** Wallet feature state. */
  readonly wallets: { readonly enabled: boolean }
  /** Budget feature state. */
  readonly budgets: { readonly enabled: boolean }
}

/** The payload served by `GET /health/wiring`. */
export interface WiringReport {
  /** True when the library services resolved from the container. */
  readonly registered: boolean
  /** Effective presentation currency. */
  readonly currency: string
  /** Effective default rating mode. */
  readonly ratingMode: string
  /** Effective pricing cache TTL in milliseconds. */
  readonly pricingCacheTtlMs: number
  /** Whether strict pricing (loud misses) is on. */
  readonly pricingStrict: boolean
  /** Whether the wallet feature block is enabled. */
  readonly walletsEnabled: boolean
  /** Whether the budget feature block is enabled. */
  readonly budgetsEnabled: boolean
  /** Whether the reserved logger token carries a value (null in v0.1.0). */
  readonly loggerBound: boolean
}

/** Behavioral contract of the wiring smoke service (controller-facing). */
export interface WiringReporter {
  /** Describe the effective wiring. */
  describeWiring(): WiringReport
}

/** Proves the module registration by injecting the exported surface. */
@Injectable()
export class WiringService implements WiringReporter {
  /**
   * The service parameters are typed `unknown` on purpose: the smoke report
   * only proves container resolution (presence), never calls behavior, and
   * an interface-free type keeps the emitted decorator metadata free of
   * unreachable `typeof`-guard branches.
   *
   * @param ledger The library's ledger service (container-resolved).
   * @param pricing The library's pricing service (container-resolved).
   * @param options The resolved options bound to `BYMAX_AI_TOKENS_OPTIONS`.
   * @param loggerToken The reserved logger token value (`null` in v0.1.0).
   */
  constructor(
    @Inject(LedgerService) private readonly ledger: unknown,
    @Inject(PricingService) private readonly pricing: unknown,
    @Inject(BYMAX_AI_TOKENS_OPTIONS) private readonly options: ResolvedOptionsView,
    @Inject(BYMAX_AI_TOKENS_LOGGER) private readonly loggerToken: unknown,
  ) {}

  /**
   * Describe the effective wiring.
   *
   * @returns The wiring report: registration proof plus resolved options.
   */
  describeWiring(): WiringReport {
    return {
      registered: this.ledger !== undefined && this.pricing !== undefined,
      currency: this.options.currency,
      ratingMode: this.options.ratingMode,
      pricingCacheTtlMs: this.options.pricing.cacheTtlMs,
      pricingStrict: this.options.pricing.strict,
      walletsEnabled: this.options.wallets.enabled,
      budgetsEnabled: this.options.budgets.enabled,
      loggerBound: this.loggerToken !== null && this.loggerToken !== undefined,
    }
  }
}
