/**
 * @fileoverview Shared response glue for the workspace: the usage view
 * every workspace response embeds. The identity-to-context builder lives
 * in `ai/metering-context.ts` and the correlation-tag conventions in
 * `ai/correlation-tags.ts`, where every metered feature shares them.
 *
 * @layer workspace
 */
import { formatNanoUsd } from '@bymax-one/nest-ai-tokens'
import type { UsageRecord } from '@bymax-one/nest-ai-tokens'

/** The metering summary every workspace response embeds. */
export interface WorkspaceUsageView {
  /** The appended ledger row's id (the call's transaction). */
  readonly transactionId: string
  /** The model that answered (pricing followed this). */
  readonly model: string
  /** The token split the provider reported. */
  readonly tokensUsed: {
    readonly input: number
    readonly output: number
    readonly total: number
  }
  /** Exact nano-USD costs as decimal strings plus a display rendering. */
  readonly cost: {
    /** Provider cost in nano-USD (decimal string; bigint-safe). */
    readonly rawNanoUsd: string
    /** Billed (post-markup) cost in nano-USD (decimal string). */
    readonly billedNanoUsd: string
    /** Human-readable billed cost, e.g. `$0.000132`. */
    readonly formatted: string
  }
}

/**
 * Project a usage record into the response view: token split, exact costs
 * as decimal strings (bigint never crosses the JSON boundary raw), and the
 * library's display formatting.
 *
 * @param record The posted usage record.
 * @returns The response usage view.
 */
export function usageViewOf(record: UsageRecord): WorkspaceUsageView {
  return {
    transactionId: record.id,
    model: record.model,
    tokensUsed: {
      input: record.inputTokens,
      output: record.outputTokens,
      total: record.totalTokens,
    },
    cost: {
      rawNanoUsd: record.rawCostNanoUsd.toString(),
      billedNanoUsd: record.billedCostNanoUsd.toString(),
      formatted: formatNanoUsd(record.billedCostNanoUsd),
    },
  }
}
