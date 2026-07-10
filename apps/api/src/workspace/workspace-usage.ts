/**
 * @fileoverview Shared metering glue for the workspace: the context
 * builder (identity to `MeteringContext`, resource correlation as tags)
 * and the usage view every workspace response embeds.
 *
 * `UsageRecord` has no free-form metadata column by design (the immutable
 * ledger never stores request payloads), so the resource reference and the
 * batch size travel in the record's persisted `tags` (`resource:<id>`,
 * `batch-size:<n>`) where the ledger list endpoint can filter them.
 *
 * @layer workspace
 */
import { formatNanoUsd } from '@bymax-one/nest-ai-tokens'
import type { MeteringContext, UsageRecord } from '@bymax-one/nest-ai-tokens'

import { GLOBAL_TENANT_ID } from '../ai/ai-tokens.config.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

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

/**
 * Build the per-call metering context for a workspace call. Deliberately
 * WITHOUT an idempotency key: repeated identical calls are distinct work
 * and must each append their own ledger row (the library's documented
 * non-deduplicating mode keys each append with a random UUID). The tenant
 * mapping matches the module `scopeResolver` (null-tenant identities meter
 * under the global tenant).
 *
 * @param identity The verified-by-simulation request identity.
 * @param feature The logical operation, e.g. `workspace.translate`.
 * @param tags The persisted correlation tags (resource, batch size).
 * @returns The context handed to `MeteringService.record`.
 */
export function buildMeteringContext(
  identity: DemoIdentity,
  feature: string,
  tags: readonly string[],
): MeteringContext {
  return {
    tenantId: identity.tenantId ?? GLOBAL_TENANT_ID,
    scope: { type: 'user', id: identity.id },
    feature,
    tags: [...tags],
  }
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
