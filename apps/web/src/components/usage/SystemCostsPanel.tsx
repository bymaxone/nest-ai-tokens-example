/**
 * @fileoverview The Usage page's system-costs panel:
 * `GET /usage/system-costs`, platform-absorbed spend grouped by category
 * (e.g. `reindex`, spec §13 scenario 7), the surface proving these rows
 * are excluded from user reports. The drafted "byCategory + byType" split
 * reconciles to one dimension: `systemCostCategory` is the endpoint's only
 * `groupBy` (see the phase Reconciliation note).
 *
 * @layer components/usage
 */
'use client'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useApiQuery } from '@/lib/use-api-query'

/** The Usage page's system-costs-by-category panel. */
export function SystemCostsPanel(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getSystemCosts())

  return (
    <div className="card">
      <div className="card__title">System costs</div>
      <div className="card__desc">Platform-absorbed spend, by category, never billed to users</div>

      {state.status === 'loading' && (
        <div role="status" aria-label="Loading system costs">
          <div className="skeleton" style={{ height: 100, marginTop: 12 }} />
        </div>
      )}

      {state.status === 'error' && <ErrorBanner error={state.error} />}

      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="empty">
          <div className="empty__title">No system costs yet</div>
          <p>Run the reindex job to see a platform-absorbed row here.</p>
        </div>
      )}

      {state.status === 'ready' && state.data.items.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {state.data.items.map((item, index) => (
            <span key={`${item.group.systemCostCategory ?? 'unknown'}-${index}`} className="chip">
              {item.group.systemCostCategory ?? 'unknown'}: {formatMoney(item.billedCostNanoUsd)} (
              {item.records})
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
