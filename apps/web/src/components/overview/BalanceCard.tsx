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

import { StatCard } from '@/components/stat-card'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import type { BalanceView } from '@/lib/api-types'
import { getIdentity, getServerSnapshot, subscribe } from '@/lib/identity-store'

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
    return <StatCard label="Balance" state={{ status: 'loading' }} />
  }

  if (state.status === 'error') {
    return <StatCard label="Balance" state={{ status: 'error', message: state.error.message }} />
  }

  return <StatCard label="Balance" state={{ status: 'ready', value: state.balance.formatted }} />
}
