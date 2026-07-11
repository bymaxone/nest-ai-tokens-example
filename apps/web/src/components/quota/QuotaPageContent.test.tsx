/**
 * @fileoverview Unit tests for the Quota Lab page content: it renders
 * both the guard-inputs card and the estimator lab, and a lab action that
 * changes the balance re-fetches the guard-inputs card.
 *
 * @layer components/quota
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: { getBalance: vi.fn(), runLabConstant: vi.fn(), runLabModelBased: vi.fn(), credit: vi.fn() },
}))

import { api } from '@/lib/api'

import { QuotaPageContent } from './QuotaPageContent.js'

describe('QuotaPageContent', () => {
  // scenario: both the guard-inputs card and the estimator lab render together.
  it('renders the guard-inputs card and the estimator lab', async () => {
    vi.mocked(api.getBalance).mockResolvedValue({
      nanoUsd: '0',
      credits: 0,
      formatted: '$0.000000',
    })
    render(<QuotaPageContent />)
    await waitFor(() => expect(screen.getByText('Guard decision inputs')).toBeInTheDocument())
    expect(screen.getByText('Estimator lab')).toBeInTheDocument()
  })

  // scenario: a balance-changing lab action (top-up) re-fetches the guard-inputs balance.
  it('re-fetches the balance after a lab action changes it', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getBalance).mockResolvedValue({
      nanoUsd: '0',
      credits: 0,
      formatted: '$0.000000',
    })
    vi.mocked(api.credit).mockResolvedValue({
      entryId: 'entry-1',
      type: 'purchase',
      amountNanoUsd: '10000000000',
      balance: { nanoUsd: '10000000000', credits: 10, formatted: '$10.000000' },
    })
    render(<QuotaPageContent />)
    await waitFor(() => expect(screen.getByText('$0.000000')).toBeInTheDocument())
    const callsBefore = vi.mocked(api.getBalance).mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Top up $10' }))

    await waitFor(() => expect(api.getBalance).toHaveBeenCalledTimes(callsBefore + 1))
  })
})
