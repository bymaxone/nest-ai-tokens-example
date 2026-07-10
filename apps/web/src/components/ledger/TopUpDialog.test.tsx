/**
 * @fileoverview Unit tests for the top-up dialog: happy path (amount
 * conversion to nano-USD), credit type selection, an error envelope
 * render, backdrop/cancel closing, and no-close-on-inner-click.
 *
 * @layer components/ledger
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { credit: vi.fn() },
}))

import { api } from '@/lib/api'

import { TopUpDialog } from './TopUpDialog.js'

describe('TopUpDialog', () => {
  // scenario: submitting the default amount converts USD to a nano-USD wire string.
  it('submits the default amount as a nano-USD string', async () => {
    const user = userEvent.setup()
    const onCredited = vi.fn()
    vi.mocked(api.credit).mockResolvedValue({
      entryId: 'entry-1',
      type: 'purchase',
      amountNanoUsd: '10000000000',
      balance: { nanoUsd: '10000000000', credits: 10, formatted: '$10.000000' },
    })
    render(<TopUpDialog onClose={vi.fn()} onCredited={onCredited} />)

    await user.click(screen.getByRole('button', { name: 'Top up' }))

    await waitFor(() =>
      expect(api.credit).toHaveBeenCalledWith({ amountNanoUsd: '10000000000', type: 'purchase' }),
    )
    await waitFor(() =>
      expect(screen.getByText('Credited. New balance: $10.000000.')).toBeInTheDocument(),
    )
    expect(onCredited).toHaveBeenCalledOnce()
  })

  // scenario: picking a different credit type sends it through.
  it('sends the picked credit type', async () => {
    const user = userEvent.setup()
    vi.mocked(api.credit).mockResolvedValue({
      entryId: 'entry-1',
      type: 'trial_allocation',
      amountNanoUsd: '10000000000',
      balance: { nanoUsd: '10000000000', credits: 10, formatted: '$10.000000' },
    })
    render(<TopUpDialog onClose={vi.fn()} onCredited={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('Credit type'), 'trial_allocation')
    await user.click(screen.getByRole('button', { name: 'Top up' }))

    await waitFor(() =>
      expect(api.credit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'trial_allocation' }),
      ),
    )
  })

  // scenario: an edited amount converts precisely (no floating drift for a simple decimal).
  it('converts an edited amount to nano-USD', async () => {
    const user = userEvent.setup()
    vi.mocked(api.credit).mockResolvedValue({
      entryId: 'entry-1',
      type: 'purchase',
      amountNanoUsd: '1500000000',
      balance: { nanoUsd: '1500000000', credits: 1.5, formatted: '$1.500000' },
    })
    render(<TopUpDialog onClose={vi.fn()} onCredited={vi.fn()} />)

    const amountInput = screen.getByLabelText('Amount (USD)')
    await user.clear(amountInput)
    await user.type(amountInput, '1.5')
    await user.click(screen.getByRole('button', { name: 'Top up' }))

    await waitFor(() =>
      expect(api.credit).toHaveBeenCalledWith(
        expect.objectContaining({ amountNanoUsd: '1500000000' }),
      ),
    )
  })

  // scenario: a rejection renders the canonical error envelope.
  it('renders the error envelope on a rejection', async () => {
    const user = userEvent.setup()
    vi.mocked(api.credit).mockRejectedValue(
      new ApiError('ledger.invalid_amount', 400, 'bad amount'),
    )
    render(<TopUpDialog onClose={vi.fn()} onCredited={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Top up' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('bad amount'))
  })

  // scenario: the Cancel button closes the dialog.
  it('closes on Cancel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TopUpDialog onClose={onClose} onCredited={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  // scenario: clicking the backdrop closes the dialog; clicking inside it does not.
  it('closes on backdrop click but not on dialog click', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TopUpDialog onClose={onClose} onCredited={vi.fn()} />)

    await user.click(screen.getByText('Top up balance'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
