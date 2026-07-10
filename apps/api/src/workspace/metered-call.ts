/**
 * @fileoverview The hold -> run -> capture/release helper the workspace
 * services share. `runWithHold` places the spend hold FIRST, so a wallet or
 * budget shortfall rejects with the library's canonical 402 BEFORE the
 * provider runs and before any ledger row exists; a provider failure then
 * releases the hold in full (never bills); the caller decides per billing
 * contract whether the response settles (`settle`, debits actuals) or is
 * abandoned (`abandon`, restores the reservation without billing).
 *
 * @layer workspace
 */
import type {
  HoldEstimate,
  MeteringContext,
  MeteringService,
  ProviderPreset,
  UsageRecord,
} from '@bymax-one/nest-ai-tokens'

/** The release reason recorded when the provider call itself fails. */
export const PROVIDER_FAILURE_REASON = 'provider call failed'

/** A completed provider call whose spend hold awaits settle-or-abandon. */
export interface MeteredCall<T> {
  /** The provider response (produced only after the hold was reserved). */
  readonly response: T
  /** Settle the hold with the response's actual usage (debits actuals). */
  readonly settle: () => Promise<UsageRecord>
  /** Void the hold without billing (restores wallet/budget in full). */
  readonly abandon: (reason: string) => Promise<void>
}

/**
 * Reserve a spend hold, run the provider call, and hand the caller the
 * settle/abandon pair. A hold shortfall throws the library's canonical
 * error before `run` executes; a `run` failure releases the hold and
 * rethrows the ORIGINAL error.
 *
 * @param metering The library's metering facade.
 * @param context The per-call metering context (payer scope, feature, tags).
 * @param estimate The tolerance-scaled hold estimate.
 * @param preset The normalizer preset `settle` rates the response with.
 * @param run The provider call to meter.
 * @returns The response plus its settle/abandon pair.
 * @throws {AiTokensException} `AI_TOKENS_INSUFFICIENT_CREDITS` /
 *   `AI_TOKENS_BUDGET_EXCEEDED` / `AI_TOKENS_QUOTA_EXCEEDED` on a hold
 *   shortfall (before the provider runs).
 */
export async function runWithHold<T>(
  metering: MeteringService,
  context: MeteringContext,
  estimate: HoldEstimate,
  preset: ProviderPreset,
  run: () => Promise<T>,
): Promise<MeteredCall<T>> {
  const hold = await metering.hold(context, estimate)
  let response: T
  try {
    response = await run()
  } catch (error) {
    await metering.release(hold, PROVIDER_FAILURE_REASON)
    throw error
  }
  return {
    response,
    settle: () => metering.capture(hold, response, preset),
    abandon: (reason: string) => metering.release(hold, reason),
  }
}
