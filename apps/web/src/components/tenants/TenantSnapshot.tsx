/**
 * @fileoverview The Tenants page's isolation walkthrough: the currently
 * selected demo identity's balance and last few transactions, side by
 * side. Both refetch automatically on an identity switch (the
 * `useApiQuery` pattern every dashboard resource follows), so switching
 * the header identity is the walkthrough: the panel's numbers and rows
 * change to the new user/tenant, and never show a stale cross-identity
 * value (scenario §13.6).
 *
 * @layer components/tenants
 */
'use client'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { StatCard } from '@/components/stat-card'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useApiQuery } from '@/lib/use-api-query'

/** Most recent transactions the snapshot lists. */
const SNAPSHOT_LIMIT = 5

/** The current identity's balance stat tile. */
function BalanceSnapshot(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getBalance())
  return (
    <StatCard
      label="Balance"
      state={
        state.status === 'loading'
          ? { status: 'loading' }
          : state.status === 'error'
            ? { status: 'error', message: state.error.message }
            : { status: 'ready', value: state.data.formatted }
      }
    />
  )
}

/** The current identity's last few transactions. */
function TransactionsSnapshot(): React.JSX.Element {
  const { state } = useApiQuery(() => api.listTransactions({ limit: SNAPSHOT_LIMIT, offset: 0 }))

  if (state.status === 'loading') {
    return (
      <div role="status" aria-label="Loading recent transactions">
        <div className="skeleton" style={{ height: 100 }} />
      </div>
    )
  }
  if (state.status === 'error') return <ErrorBanner error={state.error} />
  if (state.data.items.length === 0) {
    return (
      <div className="empty">
        <div className="empty__title">No transactions for this identity</div>
        <p>Run a command in the Playground, or switch identity in the header.</p>
      </div>
    )
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>date</th>
          <th>status</th>
          <th>cost</th>
        </tr>
      </thead>
      <tbody>
        {state.data.items.map((item) => (
          <tr key={item.id}>
            <td>{new Date(item.occurredAt).toLocaleDateString()}</td>
            <td>
              <span className="chip">{item.status}</span>
            </td>
            <td>{formatMoney(item.billedCostNanoUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The Tenants page's current-identity balance and recent-transactions snapshot. */
export function TenantSnapshot(): React.JSX.Element {
  return (
    <div className="card">
      <div className="card__title">Isolation snapshot</div>
      <p className="card__desc">
        Switch the identity in the header above: the balance and the recent transactions below
        refetch for the new user/tenant, never showing a stale value from the previous one.
      </p>
      <div className="grid-2" style={{ marginTop: 10 }}>
        <BalanceSnapshot />
        <TransactionsSnapshot />
      </div>
    </div>
  )
}
