/**
 * @fileoverview A generic client-side read hook shared by every dashboard
 * widget: loading / error / ready state over a typed fetcher, an unmount
 * guard, a manual `refetch` escape hatch for post-mutation refreshes
 * (refund, credit, price update), and the BalanceCard pattern of
 * refetching whenever the selected demo identity changes (the client's
 * headers follow the selection, so a stale-identity response would be
 * wrong even for globally-scoped reads like the price catalog).
 *
 * @layer lib
 */
'use client'

import { useCallback, useEffect, useReducer, useState, useSyncExternalStore } from 'react'

import { getServerSnapshot } from '@/components/identity-switcher'

import { ApiError } from './api-client'
import { getIdentity, subscribe } from './identity-store'

/** The read hook's fetch state. */
export type ApiQueryState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: ApiError }
  | { readonly status: 'ready'; readonly data: T }

/** What {@link useApiQuery} returns. */
export interface UseApiQueryResult<T> {
  /** The current fetch state. */
  readonly state: ApiQueryState<T>
  /** Re-runs the fetcher without waiting for an identity or key change. */
  readonly refetch: () => void
}

/**
 * Normalizes a caught rejection into an {@link ApiError}, since a fetcher
 * may reject with something other than the client's own error type (e.g. a
 * thrown plain value in a test double).
 *
 * @param error The caught value.
 * @returns The error, wrapped when it was not already an `ApiError`.
 */
function toApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError('client_error', 0, 'Something went wrong loading this data.')
}

/**
 * Runs `fetcher` on mount, whenever `key` changes, whenever the selected
 * demo identity changes, or when the returned `refetch` is called.
 *
 * @param fetcher Loads the resource; called with no arguments.
 * @param key A dependency that should retrigger the fetch when it changes (e.g. a filter set serialized to a string).
 * @returns The current query state and a manual refetch trigger.
 */
export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  key: string | number = 0,
): UseApiQueryResult<T> {
  const [state, setState] = useState<ApiQueryState<T>>({ status: 'loading' })
  const [nonce, bump] = useReducer((count: number) => count + 1, 0)
  const identity = useSyncExternalStore(subscribe, getIdentity, getServerSnapshot)

  useEffect(() => {
    let isCancelled = false
    setState({ status: 'loading' })
    fetcher()
      .then((data) => {
        if (!isCancelled) setState({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (!isCancelled) setState({ status: 'error', error: toApiError(error) })
      })
    return () => {
      isCancelled = true
    }
    // fetcher is intentionally excluded from the dependency list: callers
    // pass a fresh closure every render, and `key` is the caller's declared
    // signal for "the inputs to fetcher changed".
  }, [identity, key, nonce])

  const refetch = useCallback(() => bump(), [])

  return { state, refetch }
}
