/**
 * @fileoverview The Overview balance stat tile: fetches `GET /usage/balance`
 * through the shared api client and renders loading, error, and success
 * states. The first real (non-stub) content in the dashboard, proving the
 * live api round-trip end to end.
 *
 * @layer components/overview
 */
'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

import { getServerSnapshot } from '@/components/identity-switcher'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import type { BalanceView } from '@/lib/api-types'
import { getIdentity, subscribe } from '@/lib/identity-store'

/** The tile's fetch state. */
type BalanceState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: ApiError }
  | { readonly status: 'ready'; readonly balance: BalanceView }

/** The Overview page's balance stat tile. */
export function BalanceCard(): React.JSX.Element {
  const [state, setState] = useState<BalanceState>({ status: 'loading' })
  // The client's headers follow the selected demo identity, so the balance
  // refetches whenever the switcher changes who is asking.
  const identity = useSyncExternalStore(subscribe, getIdentity, getServerSnapshot)

  useEffect(() => {
    let isCancelled = false
    setState({ status: 'loading' })
    api
      .getBalance()
      .then((balance) => {
        if (!isCancelled) setState({ status: 'ready', balance })
      })
      .catch((error: unknown) => {
        if (isCancelled) return
        const apiError =
          error instanceof ApiError
            ? error
            : new ApiError('client_error', 0, 'Something went wrong loading the balance.')
        setState({ status: 'error', error: apiError })
      })
    return () => {
      isCancelled = true
    }
  }, [identity])

  if (state.status === 'loading') {
    return (
      <div className="stat" role="status" aria-label="Loading balance">
        <div className="stat__label">Balance</div>
        <div className="skeleton" style={{ width: '60%', marginTop: 8 }} />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="stat" role="alert">
        <div className="stat__label">Balance</div>
        <div className="stat__value" style={{ fontSize: 16, color: 'var(--red)' }}>
          {state.error.message}
        </div>
      </div>
    )
  }

  return (
    <div className="stat">
      <div className="stat__label">Balance</div>
      <div className="stat__value">{state.balance.formatted}</div>
    </div>
  )
}
