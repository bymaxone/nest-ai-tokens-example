/**
 * @fileoverview Money display for wire values that carry a raw nano-USD
 * decimal string but no api-provided `formatted` field (`PriceRowView`,
 * `UsageSummaryView`, `UsageRecordView`). The dashboard never computes a
 * cost; this module only renders an already-settled amount through the
 * library's own {@link formatNanoUsd}, the same formatter the api uses to
 * build every `formatted` field it does send. Fields that already carry a
 * `formatted` string (`BalanceView`, `WorkspaceUsageView.cost`,
 * `CreditResponse.balance`) render that string directly and never touch
 * this module.
 *
 * @layer lib
 */
import { formatNanoUsd } from '@bymax-one/nest-ai-tokens/shared'

import type { NanoUsdString } from './api-types'

/** A nano-USD string that failed to parse as a non-negative integer. */
const INVALID_NANO_USD = '—'

/**
 * Renders a wire nano-USD decimal string as a 6-decimal USD amount (the
 * catalog's display precision), e.g. `"12345000"` -> `"$0.012345"`.
 *
 * @param nanoUsd The wire value (a non-negative integer decimal string).
 * @returns The formatted amount, or an em dash placeholder for a malformed input.
 */
export function formatMoney(nanoUsd: NanoUsdString): string {
  if (!/^\d+$/.test(nanoUsd)) return INVALID_NANO_USD
  return formatNanoUsd(BigInt(nanoUsd))
}
