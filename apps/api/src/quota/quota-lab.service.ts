/**
 * @fileoverview The quota lab: minimal endpoints that demonstrate the
 * estimator VARIANTS the library supports beyond the workspace's body-size
 * family. The `constant` route is declarative (a static
 * `@RequireBudget({ estimate })` hold placed by the guard and settled by
 * `MeteringInterceptor`); the `model-based` route is programmatic (a pure
 * estimator branching on the requested model sizes the hold the service
 * places itself). Lab estimates are deliberately UNSCALED (no
 * `QUOTA_TOLERANCE`): the lab shows the raw variant behavior, while the
 * workspace shows the tolerance-scaled production shape.
 *
 * @layer quota
 */
import { randomUUID } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'
import { MeteringService, WalletService, formatNanoUsd } from '@bymax-one/nest-ai-tokens'
import type { HoldEstimate } from '@bymax-one/nest-ai-tokens'

import type { LabRunBody } from './dto/lab-run.body.js'
import { ApiException } from '../common/api-exception.js'
import { runWithHold } from '../ai/metered-call.js'
import { buildMeteringContext, walletRefOf } from '../ai/metering-context.js'
import { MOCK_CHAT_LITE, MOCK_CHAT_PRO, MOCK_PROVIDER_ID } from '../ai/mock-models.js'
import type { MockChatModel } from '../ai/mock-models.js'
import { MockAiProvider } from '../ai/mock-ai.provider.js'
import type { MockChatResponse } from '../ai/mock-ai.types.js'
import { MOCK_CHAT_PRESET } from '../ai/mock-usage.presets.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

/** The feature labels the lab routes meter under. */
export const LAB_FEATURES = {
  constant: 'quota.lab.constant',
  modelBased: 'quota.lab.model-based',
} as const

/** The flat token estimate of the constant lab route. */
export const LAB_CONSTANT_TOKENS = 1_000

/** Token estimate the model-based estimator assigns the flagship model. */
export const LAB_PRO_TOKENS = 5_000

/** Token estimate the model-based estimator assigns every other model. */
export const LAB_LITE_TOKENS = 1_000

/**
 * The static estimate behind `@RequireBudget({ estimate })` on the constant
 * lab route: a flat 1000-token reservation regardless of the body.
 */
export const LAB_CONSTANT_ESTIMATE: HoldEstimate = {
  provider: MOCK_PROVIDER_ID,
  model: MOCK_CHAT_LITE,
  operation: 'chat',
  inputTokens: LAB_CONSTANT_TOKENS,
  maxOutputTokens: 0,
}

/**
 * The model-based estimator: the flagship model reserves five times the
 * tokens of the cheap variant. Pure and synchronous.
 *
 * @param model The requested chat model.
 * @returns The token estimate for the hold.
 */
export function labEstimateTokens(model: MockChatModel): number {
  return model === MOCK_CHAT_PRO ? LAB_PRO_TOKENS : LAB_LITE_TOKENS
}

/**
 * Pull the handler's WHOLE return value as the usage payload for `@Meter`:
 * the mock preset's normalizer reads the full OpenAI-shaped response (model
 * + usage), not a nested `result.usage` field.
 *
 * @param result The handler return value.
 * @returns The same value, handed to the preset normalizer.
 */
export function extractLabUsage(result: unknown): unknown {
  return result
}

/** The wallet-entry reason stamped on a drain debit and its released hold. */
export const DRAIN_REASON = 'quota lab drain'

/**
 * The result of a drain that did NOT reach the wall: with an overdraft floor
 * configured, the post-drain hold is still allowed, so the endpoint releases
 * it unbilled and reports the residual balance instead of the canonical 402.
 */
export interface DrainResult {
  /** Amount debited from the wallet by the drain (nano-USD, decimal string). */
  readonly drainedNanoUsd: string
  /** Wallet balance after the drain (nano-USD, decimal string). */
  readonly balanceNanoUsd: string
  /** The post-drain balance, formatted for display. */
  readonly balanceFormatted: string
  /** Always `false` here: reaching the wall throws the canonical 402 instead. */
  readonly wallReached: boolean
}

/** The response of a programmatic lab run. */
export interface LabRunResult {
  /** The model that answered. */
  readonly model: string
  /** The deterministic echo content. */
  readonly content: string
  /** The settled ledger row id. */
  readonly transactionId: string
  /** Billed (post-markup) cost in nano-USD (decimal string). */
  readonly billedNanoUsd: string
  /** Total tokens the response reported. */
  readonly totalTokens: number
}

/** Serves the quota lab runs. */
@Injectable()
export class QuotaLabService {
  /**
   * @param provider The deterministic mock inference layer.
   * @param metering The library's metering facade (container-resolved).
   */
  constructor(
    @Inject(MockAiProvider) private readonly provider: MockAiProvider,
    @Inject(MeteringService) private readonly metering: MeteringService,
    @Inject(WalletService) private readonly wallets: WalletService | null,
  ) {}

  /**
   * Drain the caller's wallet to zero, then prove the enforcement wall: the
   * post-drain constant-estimate hold is rejected with the canonical
   * `AI_TOKENS_INSUFFICIENT_CREDITS` 402 (thrown straight to the client) when
   * no overdraft floor is configured. The debit is a real, auditable wallet
   * entry standing in for prior spend, so a later top-up genuinely unblocks
   * the estimate (scenario 5). If an overdraft floor lets the post-drain hold
   * pass, it is released unbilled and the residual balance is reported.
   *
   * @param identity The request identity (the wallet owner to drain).
   * @returns The residual balance, ONLY when the wall was not reached.
   * @throws {ApiException} `quota.disabled` (503) when wallets are off.
   * @throws {AiTokensException} `AI_TOKENS_INSUFFICIENT_CREDITS` (402) when
   *   the drained wallet rejects the hold at the wall (the common path).
   */
  async drain(identity: DemoIdentity): Promise<DrainResult> {
    const wallets = this.requireWallets()
    const ref = walletRefOf(identity)
    const before = await wallets.getBalance(ref)
    let drainedNanoUsd = 0n
    if (before.nanoUsd > 0n) {
      await wallets.debit(ref, {
        amountNanoUsd: before.nanoUsd,
        idempotencyKey: randomUUID(),
        reason: DRAIN_REASON,
      })
      drainedNanoUsd = before.nanoUsd
    }
    // The wallet is now empty; reserving the constant estimate throws the
    // canonical 402 straight to the client (the default, no-overdraft path).
    // Only an overdraft floor lets this hold pass, in which case it is
    // released unbilled and the residual balance is reported below.
    const context = buildMeteringContext(identity, LAB_FEATURES.constant, [])
    const hold = await this.metering.hold(context, LAB_CONSTANT_ESTIMATE)
    await this.metering.release(hold, DRAIN_REASON)
    const after = await wallets.getBalance(ref)
    return {
      drainedNanoUsd: drainedNanoUsd.toString(),
      balanceNanoUsd: after.nanoUsd.toString(),
      balanceFormatted: formatNanoUsd(after.nanoUsd),
      wallReached: false,
    }
  }

  /** The wallet service, or the documented 503 when the block is off. */
  private requireWallets(): WalletService {
    if (this.wallets === null) {
      throw new ApiException(
        'quota.disabled',
        503,
        'The quota lab drain requires the wallets feature block (set QUOTA_ENABLED=true).',
      )
    }
    return this.wallets
  }

  /**
   * Run the mock completion behind the CONSTANT lab route. Metering is
   * declarative here: the guard already placed the static hold and the
   * interceptor settles this return value, so the service only produces
   * the response.
   *
   * @param body The validated lab body.
   * @returns The raw mock response (the interceptor extracts its usage).
   */
  completeConstant(body: LabRunBody): Promise<MockChatResponse> {
    return this.complete(body)
  }

  /**
   * Run the MODEL-BASED lab route: the pure estimator branches on the
   * requested model, the service places the hold itself, and the response
   * settles it.
   *
   * @param identity The request identity (payer scope).
   * @param body The validated lab body.
   * @returns The echo content plus the settled transaction summary.
   * @throws {AiTokensException} The canonical 402/429 on a hold shortfall.
   */
  async runModelBased(identity: DemoIdentity, body: LabRunBody): Promise<LabRunResult> {
    const context = buildMeteringContext(identity, LAB_FEATURES.modelBased, [])
    const estimate: HoldEstimate = {
      provider: MOCK_PROVIDER_ID,
      model: body.model,
      operation: 'chat',
      inputTokens: labEstimateTokens(body.model),
      maxOutputTokens: 0,
    }
    const call = await runWithHold(this.metering, context, estimate, MOCK_CHAT_PRESET, () =>
      this.complete(body),
    )
    const record = await call.settle()
    return {
      model: record.model,
      content: call.response.choices[0].message.content,
      transactionId: record.id,
      billedNanoUsd: record.billedCostNanoUsd.toString(),
      totalTokens: record.totalTokens,
    }
  }

  /** One deterministic mock completion for a lab body. */
  private complete(body: LabRunBody): Promise<MockChatResponse> {
    return this.provider.chatCompletion({
      model: body.model,
      messages: [{ role: 'user', content: body.prompt }],
      responseFormat: 'text',
    })
  }
}
