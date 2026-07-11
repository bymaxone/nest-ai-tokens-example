/**
 * @fileoverview The per-model price history timeline
 * (`GET /pricing/:model/history`, newest first): each window as an
 * effective-dated range, with the open window (no `effectiveTo`)
 * highlighted (scenario §13.4: a price update closes the old window and
 * opens a successor without rewriting history).
 *
 * @layer components/pricing
 */
'use client'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import type { PriceRowView } from '@/lib/api-types'
import { formatMoney } from '@/lib/money'
import { useApiQuery } from '@/lib/use-api-query'
import { cn } from '@/lib/utils'

/** HistoryTimeline props. */
export interface HistoryTimelineProps {
  /** The row whose (provider, model, operation, tier) tuple to look up. */
  readonly row: PriceRowView
}

/** One window's rendered date range. */
function windowRange(row: PriceRowView): string {
  const from = new Date(row.effectiveFrom).toLocaleDateString()
  const to =
    row.effectiveTo === null ? 'now (open)' : new Date(row.effectiveTo).toLocaleDateString()
  return `${from} → ${to}`
}

/** The windows list: each an effective-dated range, the open window highlighted. */
function TimelineList(props: { readonly versions: readonly PriceRowView[] }): React.JSX.Element {
  return (
    <ul className="flex list-none flex-col gap-2">
      {props.versions.map((version) => (
        <li
          key={version.id}
          data-open={version.effectiveTo === null}
          className={cn(
            'flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs',
            version.effectiveTo === null
              ? 'border-[color:var(--primary-30)] bg-[color:var(--primary-15)] text-[color:var(--color-primary)]'
              : 'border-(--glass-border) text-muted-foreground',
          )}
        >
          <span className="mono">{windowRange(version)}</span>
          <span>
            {formatMoney(version.inputNanoUsdPerMillion)} in /{' '}
            {formatMoney(version.outputNanoUsdPerMillion)} out
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The per-model price history timeline. */
export function HistoryTimeline({ row }: HistoryTimelineProps): React.JSX.Element {
  const key = `${row.provider}:${row.model}:${row.operation}:${row.serviceTier}`
  const { state } = useApiQuery(
    () =>
      api.getPriceHistory(row.model, {
        provider: row.provider,
        operation: row.operation,
        serviceTier: row.serviceTier,
      }),
    key,
  )

  return (
    <Card>
      <CardHeader accent>
        <CardTitle>History: {row.model}</CardTitle>
        <CardDescription>
          {row.provider} / {row.operation} / {row.serviceTier}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === 'loading' && (
          <div role="status" aria-label="Loading price history">
            <div className="skeleton" style={{ height: 80 }} />
          </div>
        )}

        {state.status === 'error' && <ErrorBanner error={state.error} />}

        {state.status === 'ready' && <TimelineList versions={state.data.items} />}
      </CardContent>
    </Card>
  )
}
