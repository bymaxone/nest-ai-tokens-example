/**
 * @fileoverview The Overview page's tokens-consumed and cost-USD stat
 * cards: derived from `GET /usage/by-period` (month buckets) over the
 * api's default window (the last 90 days when no `from`/`to` is sent),
 * summed client-side from the verbatim per-bucket rows.
 *
 * @layer components/overview
 */
'use client'

import { StatCard } from '@/components/stat-card'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useApiQuery } from '@/lib/use-api-query'

/** Sums the `totalTokens` across every aggregation row. */
function sumTokens(items: readonly { readonly totalTokens: number }[]): number {
  return items.reduce((total, item) => total + item.totalTokens, 0)
}

/** Sums the billed nano-USD cost across every aggregation row (bigint, exact). */
function sumBilledNanoUsd(items: readonly { readonly billedCostNanoUsd: string }[]): string {
  return items.reduce((total, item) => total + BigInt(item.billedCostNanoUsd), BigInt(0)).toString()
}

/** The Overview page's two lifetime-totals stat cards. */
export function TotalsStats(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getUsageByPeriod({ granularity: 'month' }))

  if (state.status === 'loading') {
    return (
      <>
        <StatCard label="Tokens consumed" state={{ status: 'loading' }} />
        <StatCard label="Cost (USD)" state={{ status: 'loading' }} />
      </>
    )
  }

  if (state.status === 'error') {
    return (
      <>
        <StatCard
          label="Tokens consumed"
          state={{ status: 'error', message: state.error.message }}
        />
        <StatCard label="Cost (USD)" state={{ status: 'error', message: state.error.message }} />
      </>
    )
  }

  const tokens = sumTokens(state.data.items)
  const billed = sumBilledNanoUsd(state.data.items)
  return (
    <>
      <StatCard
        label="Tokens consumed"
        state={{ status: 'ready', value: tokens.toLocaleString('en-US') }}
      />
      <StatCard label="Cost (USD)" state={{ status: 'ready', value: formatMoney(billed) }} />
    </>
  )
}
