/**
 * @fileoverview The Usage page's top-consumers leaderboard:
 * `GET /usage/top-consumers` (the tenant-wide `scope` grouping, ordered by
 * billed spend server-side), rendered as a ranked list of tokens, cost,
 * and call count.
 *
 * @layer components/usage
 */
'use client'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useApiQuery } from '@/lib/use-api-query'

/** The Usage page's top-consumers leaderboard. */
export function TopConsumers(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getTopConsumers())

  return (
    <div className="card">
      <div className="card__title">Top consumers</div>
      <div className="card__desc">Tenant-wide spend, ranked highest first</div>

      {state.status === 'loading' && (
        <div role="status" aria-label="Loading top consumers">
          <div className="skeleton" style={{ height: 120, marginTop: 12 }} />
        </div>
      )}

      {state.status === 'error' && <ErrorBanner error={state.error} />}

      {state.status === 'ready' && state.data.items.length === 0 && (
        <div className="empty">
          <div className="empty__title">No consumers yet</div>
          <p>Run a command in the Playground to populate the leaderboard.</p>
        </div>
      )}

      {state.status === 'ready' && state.data.items.length > 0 && (
        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>scope</th>
              <th>calls</th>
              <th>tokens</th>
              <th>cost</th>
            </tr>
          </thead>
          <tbody>
            {state.data.items.map((item, index) => (
              <tr key={`${item.group.scope ?? 'unknown'}-${index}`}>
                <td>{item.group.scope ?? 'unknown'}</td>
                <td>{item.records}</td>
                <td>{item.totalTokens.toLocaleString('en-US')}</td>
                <td>{formatMoney(item.billedCostNanoUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
