/**
 * @fileoverview Unit tests for the tenants isolation snapshot: loading,
 * error, empty, and ready states for both the balance and the recent
 * transactions, and the identity-switch refetch (scenario §13.6).
 *
 * @layer components/tenants
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'
import { setIdentity } from '@/lib/identity-store'
import { usageRecordFixture } from '@/test/fixtures'

vi.mock('@/lib/api', () => ({
  api: { getBalance: vi.fn(), listTransactions: vi.fn() },
}))

import { api } from '@/lib/api'

import { TenantSnapshot } from './TenantSnapshot.js'

describe('TenantSnapshot', () => {
  // scenario: both halves show a loading state before their fetches resolve.
  it('renders loading states for both halves', () => {
    vi.mocked(api.getBalance).mockReturnValue(new Promise(() => {}))
    vi.mocked(api.listTransactions).mockReturnValue(new Promise(() => {}))
    render(<TenantSnapshot />)
    expect(screen.getByRole('status', { name: 'Loading Balance' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading recent transactions' })).toBeInTheDocument()
  })

  // scenario: a balance rejection renders its error message inline.
  it('renders a balance error', async () => {
    vi.mocked(api.getBalance).mockRejectedValue(new ApiError('quota.disabled', 503, 'wallets off'))
    vi.mocked(api.listTransactions).mockResolvedValue({ items: [], total: 0, limit: 5, offset: 0 })
    render(<TenantSnapshot />)
    await waitFor(() => expect(screen.getByText('wallets off')).toBeInTheDocument())
  })

  // scenario: a transactions rejection renders the error banner.
  it('renders a transactions error', async () => {
    vi.mocked(api.getBalance).mockResolvedValue({
      nanoUsd: '0',
      credits: 0,
      formatted: '$0.000000',
    })
    vi.mocked(api.listTransactions).mockRejectedValue(new ApiError('unknown_error', 500, 'oops'))
    render(<TenantSnapshot />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('oops'))
  })

  // scenario: no transactions yet renders the action-oriented empty state.
  it('renders an empty transactions state', async () => {
    vi.mocked(api.getBalance).mockResolvedValue({
      nanoUsd: '0',
      credits: 0,
      formatted: '$0.000000',
    })
    vi.mocked(api.listTransactions).mockResolvedValue({ items: [], total: 0, limit: 5, offset: 0 })
    render(<TenantSnapshot />)
    await waitFor(() =>
      expect(screen.getByText('No transactions for this identity')).toBeInTheDocument(),
    )
  })

  // scenario: the ready state renders the balance and the transaction rows.
  it('renders the balance and transaction rows', async () => {
    vi.mocked(api.getBalance).mockResolvedValue({
      nanoUsd: '5000000',
      credits: 5,
      formatted: '$5.000000',
    })
    vi.mocked(api.listTransactions).mockResolvedValue({
      items: [usageRecordFixture({ id: 'txn-1', billedCostNanoUsd: '1000000' })],
      total: 1,
      limit: 5,
      offset: 0,
    })
    render(<TenantSnapshot />)
    await waitFor(() => expect(screen.getByText('$5.000000')).toBeInTheDocument())
    expect(screen.getByText('$0.001000')).toBeInTheDocument()
  })

  // scenario: switching the identity refetches both halves (isolation walkthrough).
  it('refetches both halves when the identity switches', async () => {
    vi.mocked(api.getBalance).mockResolvedValue({
      nanoUsd: '0',
      credits: 0,
      formatted: '$0.000000',
    })
    vi.mocked(api.listTransactions).mockResolvedValue({ items: [], total: 0, limit: 5, offset: 0 })
    render(<TenantSnapshot />)
    await waitFor(() => expect(screen.getByText('$0.000000')).toBeInTheDocument())
    const balanceCallsBefore = vi.mocked(api.getBalance).mock.calls.length
    const txCallsBefore = vi.mocked(api.listTransactions).mock.calls.length

    act(() => setIdentity({ userId: 'linus', tenantId: 'globex' }))

    await waitFor(() => expect(api.getBalance).toHaveBeenCalledTimes(balanceCallsBefore + 1))
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledTimes(txCallsBefore + 1))
    act(() => setIdentity(null))
    await waitFor(() => expect(api.getBalance).toHaveBeenCalledTimes(balanceCallsBefore + 2))
  })
})
