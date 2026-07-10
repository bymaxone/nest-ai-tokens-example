/**
 * @fileoverview Shared response glue for the workspace: the resource and
 * batch-size correlation tags plus the usage view every workspace response
 * embeds. The identity-to-context builder lives in `ai/metering-context.ts`
 * where every metered feature shares it.
 *
 * `UsageRecord` has no free-form metadata column by design (the immutable
 * ledger never stores request payloads), so the resource reference and the
 * batch size travel in the record's persisted `tags` (`resource:<id>`,
 * `batch-size:<n>`) where the ledger list endpoint can filter them.
 *
 * @layer workspace
 */
import { formatNanoUsd } from '@bymax-one/nest-ai-tokens'
import type { UsageRecord } from '@bymax-one/nest-ai-tokens'

/** Tag prefix correlating a usage record to the document it served. */
export const RESOURCE_TAG_PREFIX = 'resource:'

/** Tag prefix recording the input count of an aggregate batch record. */
export const BATCH_SIZE_TAG_PREFIX = 'batch-size:'

/**
 * The resource-correlation tag for a document reference.
 *
 * @param resourceId The validated document reference.
 * @returns The tag persisted on the usage record.
 */
export function resourceTag(resourceId: string): string {
  return `${RESOURCE_TAG_PREFIX}${resourceId}`
}

/**
 * The batch-size tag for an aggregate batch record.
 *
 * @param size The number of inputs the batch embedded.
 * @returns The tag persisted on the usage record.
 */
export function batchSizeTag(size: number): string {
  return `${BATCH_SIZE_TAG_PREFIX}${size}`
}

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
