/**
 * @fileoverview The ledger correlation-tag conventions shared by every
 * metered feature. `UsageRecord` has no free-form metadata column by design
 * (the immutable ledger never stores request payloads), so correlation
 * values travel in the record's persisted `tags` under stable prefixes the
 * ledger list endpoint can filter: the document reference a call served
 * (`resource:<id>`) and the input count of an aggregate batch record
 * (`batch-size:<n>`).
 *
 * @layer ai
 */

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
