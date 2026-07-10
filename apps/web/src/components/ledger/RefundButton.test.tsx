/**
 * @fileoverview Unit tests for the refund action: only offered on a
 * posted row, the two-step confirm, the pending/error/success states.
 *
 * @layer components/ledger
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'
import { usageRecordFixture } from '@/test/fixtures'

import { RefundButton } from './RefundButton.js'

describe('RefundButton', () => {
  // scenario: a non-posted row offers no refund action at all.
  it('renders nothing for a non-posted row', () => {
    const { container } = render(
      <RefundButton
        row={usageRecordFixture({ status: 'reversed' })}
        mutationState={{ status: 'idle' }}
        onConfirm={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  // scenario: a posted row shows the initial Refund button.
  it('shows the Refund button for a posted row', () => {
    render(
      <RefundButton
        row={usageRecordFixture({ status: 'posted' })}
        mutationState={{ status: 'idle' }}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument()
  })

  // scenario: clicking Refund enters the confirm step without calling onConfirm yet.
  it('requires a confirm step before calling onConfirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <RefundButton
        row={usageRecordFixture({ status: 'posted' })}
        mutationState={{ status: 'idle' }}
        onConfirm={onConfirm}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Refund' }))
    expect(screen.getByText('Refund this transaction?')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm refund' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  // scenario: Cancel returns to the initial button without confirming.
  it('cancels back to the initial button', async () => {
    const user = userEvent.setup()
    render(
      <RefundButton
        row={usageRecordFixture({ status: 'posted' })}
        mutationState={{ status: 'idle' }}
        onConfirm={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Refund' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument()
  })

  // scenario: the pending state disables the confirm button with a busy label.
  it('disables confirm while pending', async () => {
    const user = userEvent.setup()
    render(
      <RefundButton
        row={usageRecordFixture({ status: 'posted' })}
        mutationState={{ status: 'pending' }}
        onConfirm={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Refund' }))
    expect(screen.getByRole('button', { name: 'Refunding…' })).toBeDisabled()
  })

  // scenario: an error renders the canonical error envelope on the initial view.
  it('renders the error envelope on a failed refund', () => {
    render(
      <RefundButton
        row={usageRecordFixture({ status: 'posted' })}
        mutationState={{
          status: 'error',
          error: new ApiError('ledger.invalid_transition', 409, 'not posted'),
        }}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('not posted')
  })

  // scenario: success renders the reversal confirmation instead of the button.
  it('renders the reversal confirmation on success', () => {
    render(
      <RefundButton
        row={usageRecordFixture({ status: 'posted' })}
        mutationState={{
          status: 'success',
          data: {
            originalTransactionId: 'txn-1',
            reversalTransactionId: 'txn-2',
            walletRefunded: true,
            reversal: usageRecordFixture({ id: 'txn-2', status: 'reversed' }),
          },
        }}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('Refunded: reversal txn-2.')).toBeInTheDocument()
  })
})
