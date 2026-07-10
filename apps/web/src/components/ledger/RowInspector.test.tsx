/**
 * @fileoverview Unit tests for the row inspector drawer: loading, error,
 * the full-JSON render, reversal back-links, closing, and the refund
 * round trip.
 *
 * @layer components/ledger
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'
import { usageRecordFixture } from '@/test/fixtures'

vi.mock('@/lib/api', () => ({
  api: { getTransaction: vi.fn(), refund: vi.fn() },
}))

import { api } from '@/lib/api'

import { RowInspector } from './RowInspector.js'

describe('RowInspector', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    vi.mocked(api.getTransaction).mockReturnValue(new Promise(() => {}))
    render(
      <RowInspector
        transactionId="txn-1"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onRefunded={vi.fn()}
      />,
    )
    expect(screen.getByRole('status', { name: 'Loading transaction' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error envelope.
  it('renders the error envelope on a rejection', async () => {
    vi.mocked(api.getTransaction).mockRejectedValue(
      new ApiError('ledger.transaction_not_found', 404, 'no such row'),
    )
    render(
      <RowInspector
        transactionId="txn-1"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onRefunded={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no such row'))
  })

  // scenario: the ready state renders the full row as JSON.
  it('renders the full row as JSON', async () => {
    vi.mocked(api.getTransaction).mockResolvedValue(usageRecordFixture({ id: 'txn-1' }))
    render(
      <RowInspector
        transactionId="txn-1"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onRefunded={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText(/"id": "txn-1"/)).toBeInTheDocument())
  })

  // scenario: a reversal row offers a back-link to the transaction it reverses.
  it('offers a back-link to the reversed transaction', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    vi.mocked(api.getTransaction).mockResolvedValue(
      usageRecordFixture({ id: 'txn-2', status: 'reversed', reversesRecordId: 'txn-1' }),
    )
    render(
      <RowInspector
        transactionId="txn-2"
        onClose={vi.fn()}
        onNavigate={onNavigate}
        onRefunded={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'View refunded transaction' })).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: 'View refunded transaction' }))
    expect(onNavigate).toHaveBeenCalledWith('txn-1')
  })

  // scenario: a refunded row offers a forward-link to its reversal.
  it('offers a forward-link to the reversal', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    vi.mocked(api.getTransaction).mockResolvedValue(
      usageRecordFixture({ id: 'txn-1', status: 'posted', reversedByRecordId: 'txn-2' }),
    )
    render(
      <RowInspector
        transactionId="txn-1"
        onClose={vi.fn()}
        onNavigate={onNavigate}
        onRefunded={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'View refund' })).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: 'View refund' }))
    expect(onNavigate).toHaveBeenCalledWith('txn-2')
  })

  // scenario: clicking the overlay backdrop closes the drawer; clicking inside it does not.
  it('closes on backdrop click but not on drawer click', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    vi.mocked(api.getTransaction).mockResolvedValue(usageRecordFixture())
    render(
      <RowInspector
        transactionId="txn-1"
        onClose={onClose}
        onNavigate={vi.fn()}
        onRefunded={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.click(screen.getByText('Transaction detail'))
    expect(onClose).not.toHaveBeenCalled()

    // The backdrop is presentational (the dialog role lives on the drawer),
    // so the test reaches it as the dialog's parent element.
    const backdrop = screen.getByRole('dialog').parentElement
    if (backdrop === null) throw new Error('overlay missing')
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  // scenario: the Close button closes the drawer.
  it('closes on the Close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    vi.mocked(api.getTransaction).mockResolvedValue(usageRecordFixture())
    render(
      <RowInspector
        transactionId="txn-1"
        onClose={onClose}
        onNavigate={vi.fn()}
        onRefunded={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  // scenario: confirming a refund calls the api, refetches the row, and notifies the parent.
  it('refunds, refetches, and notifies the parent', async () => {
    const user = userEvent.setup()
    const onRefunded = vi.fn()
    vi.mocked(api.getTransaction).mockResolvedValue(
      usageRecordFixture({ id: 'txn-1', status: 'posted' }),
    )
    vi.mocked(api.refund).mockResolvedValue({
      originalTransactionId: 'txn-1',
      reversalTransactionId: 'txn-2',
      walletRefunded: true,
      reversal: usageRecordFixture({ id: 'txn-2', status: 'reversed' }),
    })
    render(
      <RowInspector
        transactionId="txn-1"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onRefunded={onRefunded}
      />,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument())
    const callsBefore = vi.mocked(api.getTransaction).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Refund' }))
    await user.click(screen.getByRole('button', { name: 'Confirm refund' }))

    await waitFor(() => expect(api.refund).toHaveBeenCalledWith({ transactionId: 'txn-1' }))
    await waitFor(() => expect(api.getTransaction).toHaveBeenCalledTimes(callsBefore + 1))
    expect(onRefunded).toHaveBeenCalledOnce()
  })

  // scenario: a system-cost row shows the system-cost badge.
  it('shows the system-cost badge for a system-cost row', async () => {
    vi.mocked(api.getTransaction).mockResolvedValue(
      usageRecordFixture({ isSystemCost: true, systemCostCategory: 'reindex' }),
    )
    render(
      <RowInspector
        transactionId="txn-1"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onRefunded={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText('system cost')).toBeInTheDocument())
  })
})
