/**
 * @fileoverview A generic client-side write hook shared by every dashboard
 * action: refund, credit top-up, price update, quota-lab runs, and the
 * errors-demo triggers. Tracks idle / pending / success / error over a
 * caller-supplied action, so each call site only supplies the action
 * itself and renders the returned state.
 *
 * @layer lib
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from './api-client'

/** The write hook's state. */
export type ApiMutationState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: ApiError }

/** What {@link useApiMutation} returns. */
export interface UseApiMutationResult<Args extends readonly unknown[], T> {
  /** The current mutation state. */
  readonly state: ApiMutationState<T>
  /** Runs the action; resolves with the result, or `undefined` on failure (the state already carries the error). */
  readonly run: (...args: Args) => Promise<T | undefined>
  /** Resets the state back to idle (e.g. after a form is dismissed). */
  readonly reset: () => void
}

/**
 * Wraps an async action with idle / pending / success / error state, an
 * unmount guard, and a normalized {@link ApiError} on rejection.
 *
 * @param action The write to perform.
 * @returns The current state plus `run` and `reset`.
 */
export function useApiMutation<Args extends readonly unknown[], T>(
  action: (...args: Args) => Promise<T>,
): UseApiMutationResult<Args, T> {
  const [state, setState] = useState<ApiMutationState<T>>({ status: 'idle' })
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const run = useCallback(
    async (...args: Args): Promise<T | undefined> => {
      setState({ status: 'pending' })
      try {
        const data = await action(...args)
        if (isMountedRef.current) setState({ status: 'success', data })
        return data
      } catch (error) {
        if (isMountedRef.current) {
          const apiError =
            error instanceof ApiError
              ? error
              : new ApiError('client_error', 0, 'Something went wrong completing this action.')
          setState({ status: 'error', error: apiError })
        }
        return undefined
      }
    },
    [action],
  )

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { state, run, reset }
}
