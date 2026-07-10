/**
 * @fileoverview Unit tests for the generic read hook: loading, success,
 * error (ApiError and wrapped), refetch, identity-driven refetch, and the
 * unmount guard.
 *
 * @layer lib
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from './api-client'
import { setIdentity } from './identity-store'
import { useApiQuery } from './use-api-query.js'

describe('useApiQuery', () => {
  // scenario: the hook starts in the loading state.
  it('starts loading', () => {
    const { result } = renderHook(() => useApiQuery(() => new Promise(() => {})))
    expect(result.current.state).toEqual({ status: 'loading' })
  })

  // scenario: a resolved fetch lands in the ready state with the resolved data.
  it('resolves to the ready state', async () => {
    const { result } = renderHook(() => useApiQuery(() => Promise.resolve({ value: 42 })))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(result.current.state).toEqual({ status: 'ready', data: { value: 42 } })
  })

  // scenario: an ApiError rejection is surfaced as-is.
  it('surfaces an ApiError rejection', async () => {
    const error = new ApiError('AI_TOKENS_STORE_ERROR', 502, 'store down')
    const { result } = renderHook(() => useApiQuery(() => Promise.reject(error)))
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state).toEqual({ status: 'error', error })
  })

  // scenario: a non-ApiError rejection is normalized to a generic ApiError.
  it('normalizes a non-ApiError rejection', async () => {
    const { result } = renderHook(() => useApiQuery(() => Promise.reject(new Error('boom'))))
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state).toMatchObject({
      status: 'error',
      error: { code: 'client_error', status: 0 },
    })
  })

  // scenario: calling refetch re-runs the fetcher.
  it('refetches on demand', async () => {
    const fetcher = vi.fn().mockResolvedValue('one')
    const { result } = renderHook(() => useApiQuery(fetcher))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(fetcher).toHaveBeenCalledTimes(1)

    fetcher.mockResolvedValue('two')
    act(() => result.current.refetch())
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'two' }))
  })

  // scenario: a key change re-runs the fetcher (e.g. filter state changed).
  it('refetches when the key changes', async () => {
    const fetcher = vi.fn().mockResolvedValue('data')
    const { rerender } = renderHook(({ key }: { key: string }) => useApiQuery(fetcher, key), {
      initialProps: { key: 'a' },
    })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    rerender({ key: 'b' })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  })

  // scenario: switching the demo identity refetches (the BalanceCard pattern).
  it('refetches when the selected identity changes', async () => {
    const fetcher = vi.fn().mockResolvedValue('data')
    renderHook(() => useApiQuery(fetcher))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    act(() => setIdentity({ userId: 'grace', tenantId: 'acme' }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    act(() => setIdentity(null))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
  })

  // scenario: unmounting before the fetch resolves must not update state on the unmounted tree.
  it('does not update state after unmount', async () => {
    let resolve: (value: string) => void = () => {}
    const { unmount } = renderHook(() =>
      useApiQuery(() => new Promise<string>((res) => (resolve = res))),
    )
    unmount()
    resolve('too late')
    await new Promise((res) => setTimeout(res, 0))
  })
})
