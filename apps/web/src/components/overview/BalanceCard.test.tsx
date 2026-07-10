/**
 * @fileoverview Unit tests for the Overview balance tile: loading, success,
 * error (both a real ApiError and a wrapped non-ApiError rejection), and
 * the unmount-before-resolution guard.
 *
 * @layer components/overview
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { getBalance: vi.fn() },
}))

import { api } from '@/lib/api'

import { BalanceCard } from './BalanceCard.js'
import { setIdentity } from '@/lib/identity-store'

describe('BalanceCard', () => {
  // scenario: the tile shows a loading state before the fetch resolves.
  it('renders a loading state while the balance is in flight', () => {
    vi.mocked(api.getBalance).mockReturnValue(new Promise(() => {}))
    render(<BalanceCard />)
    expect(screen.getByRole('status', { name: 'Loading balance' })).toBeInTheDocument()
  })

  // scenario: a successful fetch renders the formatted balance.
  it('renders the formatted balance on success', async () => {
    vi.mocked(api.getBalance).mockResolvedValue({
      nanoUsd: '52500000000',
      credits: 52.5,
      formatted: '$52.500000',
    })
    render(<BalanceCard />)
    await waitFor(() => expect(screen.getByText('$52.500000')).toBeInTheDocument())
  })

  // scenario: an ApiError rejection renders its message.
  it('renders the ApiError message on failure', async () => {
    vi.mocked(api.getBalance).mockRejectedValue(
      new ApiError('AI_TOKENS_STORE_ERROR', 502, 'The store is unavailable.'),
    )
    render(<BalanceCard />)
    await waitFor(() => expect(screen.getByText('The store is unavailable.')).toBeInTheDocument())
  })

  // scenario: a non-ApiError rejection (e.g. a thrown plain value) still renders a message.
  it('renders a generic message when the rejection is not an ApiError', async () => {
    vi.mocked(api.getBalance).mockRejectedValue(new Error('boom'))
    render(<BalanceCard />)
    await waitFor(() =>
      expect(screen.getByText('Something went wrong loading the balance.')).toBeInTheDocument(),
    )
  })

  // scenario: switching the demo identity must refetch, since the client's
  // headers follow the selection and the old user's balance would be stale.
  it('refetches the balance when the selected identity changes', async () => {
    vi.mocked(api.getBalance).mockResolvedValue({
      nanoUsd: '1',
      credits: 1,
      formatted: '$1.000000',
    })
    const callsBefore = vi.mocked(api.getBalance).mock.calls.length
    render(<BalanceCard />)
    await waitFor(() => expect(api.getBalance).toHaveBeenCalledTimes(callsBefore + 1))

    act(() => {
      setIdentity({ userId: 'grace', tenantId: 'acme' })
    })

    await waitFor(() => expect(api.getBalance).toHaveBeenCalledTimes(callsBefore + 2))
    act(() => {
      setIdentity(null)
    })
  })

  // scenario: unmounting before the fetch resolves must not update state on the unmounted tree.
  it('does not update state after the component unmounts', async () => {
    let resolveBalance: (value: {
      nanoUsd: string
      credits: number
      formatted: string
    }) => void = () => {}
    vi.mocked(api.getBalance).mockReturnValue(
      new Promise((resolve) => {
        resolveBalance = resolve
      }),
    )
    const { unmount } = render(<BalanceCard />)
    unmount()
    resolveBalance({ nanoUsd: '0', credits: 0, formatted: '$0.000000' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    // No assertion beyond "did not throw": act()/state-update-after-unmount warnings would fail the run.
  })

  // scenario: unmounting before a REJECTION arrives must not update state either.
  it('does not update state after unmount when the fetch later rejects', async () => {
    let rejectBalance: (error: unknown) => void = () => {}
    vi.mocked(api.getBalance).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectBalance = reject
      }),
    )
    const { unmount } = render(<BalanceCard />)
    unmount()
    rejectBalance(new ApiError('AI_TOKENS_STORE_ERROR', 502, 'too late'))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
