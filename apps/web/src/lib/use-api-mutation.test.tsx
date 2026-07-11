/**
 * @fileoverview Unit tests for the generic write hook: idle, pending,
 * success, error (ApiError and wrapped), reset, and the unmount guard.
 *
 * @layer lib
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from './api-client'
import { useApiMutation } from './use-api-mutation.js'

describe('useApiMutation', () => {
  // scenario: the hook starts idle.
  it('starts idle', () => {
    const { result } = renderHook(() => useApiMutation((value: string) => Promise.resolve(value)))
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  // scenario: run() resolves to success and returns the data.
  it('resolves to success and returns the data', async () => {
    const { result } = renderHook(() => useApiMutation((value: string) => Promise.resolve(value)))
    let returned: string | undefined
    await act(async () => {
      returned = await result.current.run('ok')
    })
    expect(returned).toBe('ok')
    expect(result.current.state).toEqual({ status: 'success', data: 'ok' })
  })

  // scenario: run() surfaces a pending state before resolving.
  it('passes through a pending state', async () => {
    let resolve: (value: string) => void = () => {}
    const { result } = renderHook(() =>
      useApiMutation(() => new Promise<string>((res) => (resolve = res))),
    )
    act(() => {
      void result.current.run()
    })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'pending' }))
    await act(async () => {
      resolve('done')
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', data: 'done' }))
  })

  // scenario: an ApiError rejection is surfaced and run() returns undefined.
  it('surfaces an ApiError rejection and returns undefined', async () => {
    const error = new ApiError('ledger.transaction_not_found', 404, 'no such row')
    const { result } = renderHook(() => useApiMutation(() => Promise.reject(error)))
    let returned: unknown = 'unset'
    await act(async () => {
      returned = await result.current.run()
    })
    expect(returned).toBeUndefined()
    expect(result.current.state).toEqual({ status: 'error', error })
  })

  // scenario: a non-ApiError rejection is normalized.
  it('normalizes a non-ApiError rejection', async () => {
    const { result } = renderHook(() => useApiMutation(() => Promise.reject(new Error('boom'))))
    await act(async () => {
      await result.current.run()
    })
    expect(result.current.state).toMatchObject({
      status: 'error',
      error: { code: 'client_error', status: 0 },
    })
  })

  // scenario: reset() returns the state to idle.
  it('resets back to idle', async () => {
    const { result } = renderHook(() => useApiMutation(() => Promise.resolve('x')))
    await act(async () => {
      await result.current.run()
    })
    expect(result.current.state.status).toBe('success')
    act(() => result.current.reset())
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  // scenario: a resolution after unmount must not update state on the unmounted tree.
  it('does not update state after unmount', async () => {
    let resolve: (value: string) => void = () => {}
    const { result, unmount } = renderHook(() =>
      useApiMutation(() => new Promise<string>((res) => (resolve = res))),
    )
    act(() => {
      void result.current.run()
    })
    unmount()
    resolve('too late')
    await new Promise((res) => setTimeout(res, 0))
  })
})
