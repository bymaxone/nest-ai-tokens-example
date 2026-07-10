/**
 * @fileoverview The Quota Lab's guard-decision inputs: the caller's
 * balance (`GET /usage/balance`) plus the tolerance and minimum-balance
 * the enforcement guard applies. Neither is exposed by any endpoint (no
 * config-echo route exists), so they render as the documented `.env`
 * defaults (`QUOTA_TOLERANCE=1.2`, `QUOTA_MINIMUM_BALANCE=0`,
 * `apps/api/src/config/env.ts`) with an explanatory note, per the phase
 * Reconciliation note.
 *
 * @layer components/quota
 */
'use client'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { StatCard } from '@/components/stat-card'
import { api } from '@/lib/api'
import { useApiQuery } from '@/lib/use-api-query'

/** The documented `.env` default for `QUOTA_TOLERANCE`. */
const DEFAULT_TOLERANCE = 1.2

/** The documented `.env` default for `QUOTA_MINIMUM_BALANCE` (USD). */
const DEFAULT_MINIMUM_BALANCE_USD = 0

/** The Quota Lab's guard-decision inputs card. */
export function GuardInputsCard(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getBalance())

  return (
    <div className="card">
      <div className="card__title">Guard decision inputs</div>
      <p className="card__desc">
        The enforcement guard compares the estimated cost, scaled by tolerance, against (balance +
        overdraft from the minimum balance). Tolerance and minimum are configured, not queryable, so
        these are the documented `.env` defaults.
      </p>
      <div className="grid-2" style={{ marginTop: 10 }}>
        {state.status === 'error' ? (
          <ErrorBanner error={state.error} />
        ) : (
          <StatCard
            label="Balance"
            state={
              state.status === 'loading'
                ? { status: 'loading' }
                : { status: 'ready', value: state.data.formatted }
            }
          />
        )}
        <StatCard label="Tolerance" state={{ status: 'ready', value: `${DEFAULT_TOLERANCE}x` }} />
        <StatCard
          label="Minimum balance"
          state={{ status: 'ready', value: `$${DEFAULT_MINIMUM_BALANCE_USD.toFixed(2)}` }}
        />
      </div>
    </div>
  )
}
