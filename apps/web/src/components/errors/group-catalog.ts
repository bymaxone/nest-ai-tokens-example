/**
 * @fileoverview Groups the error catalog for display: library codes
 * (`AI_TOKENS_*`) in their own bucket, app codes (dot-namespaced) by the
 * segment before the first dot (`ledger`, `pricing`, `provider`,
 * `command`, `quota`, `errors_demo`), reconciling the drafted
 * "grouped ledger/pricing/provider/command/quota" grid against the real
 * catalog, which also carries library and helper codes.
 *
 * @layer components/errors
 */
import type { ErrorCatalogEntryView } from '@/lib/api-types'

/** The library-code bucket key. */
const LIBRARY_GROUP = 'library'

/**
 * The group key for one catalog entry.
 *
 * @param entry The catalog row.
 * @returns `'library'` for a library-sourced code, or the code's dot-namespace segment.
 */
function groupKeyOf(entry: ErrorCatalogEntryView): string {
  if (entry.source === 'library') return LIBRARY_GROUP
  const [prefix] = entry.code.split('.')
  return prefix !== undefined && prefix.length > 0 ? prefix : 'app'
}

/**
 * Groups catalog entries by {@link groupKeyOf}, preserving each group's
 * catalog order.
 *
 * @param entries The full catalog listing.
 * @returns Groups in first-seen order, each an array of entries.
 */
export function groupCatalog(
  entries: readonly ErrorCatalogEntryView[],
): readonly (readonly [string, readonly ErrorCatalogEntryView[]])[] {
  const groups = new Map<string, ErrorCatalogEntryView[]>()
  for (const entry of entries) {
    const key = groupKeyOf(entry)
    const existing = groups.get(key)
    if (existing === undefined) groups.set(key, [entry])
    else existing.push(entry)
  }
  return [...groups.entries()]
}
