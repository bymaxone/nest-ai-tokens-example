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
import { api } from '@/lib/api'
import type { PriceRowView } from '@/lib/api-types'
import { formatMoney } from '@/lib/money'
import { useApiQuery } from '@/lib/use-api-query'

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
    <div className="card">
      <div className="card__title">History: {row.model}</div>
      <div className="card__desc">
        {row.provider} / {row.operation} / {row.serviceTier}
      </div>

      {state.status === 'loading' && (
        <div role="status" aria-label="Loading price history">
          <div className="skeleton" style={{ height: 80, marginTop: 12 }} />
        </div>
      )}

      {state.status === 'error' && <ErrorBanner error={state.error} />}

      {state.status === 'ready' && (
        <ul
          style={{
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 10,
          }}
        >
          {state.data.items.map((version) => (
            <li
              key={version.id}
              className={version.effectiveTo === null ? 'chip role-pill' : 'chip'}
              style={{ display: 'flex', gap: 10, alignItems: 'center' }}
            >
              <span className="mono">{windowRange(version)}</span>
              <span>
                {formatMoney(version.inputNanoUsdPerMillion)} in /{' '}
                {formatMoney(version.outputNanoUsdPerMillion)} out
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
