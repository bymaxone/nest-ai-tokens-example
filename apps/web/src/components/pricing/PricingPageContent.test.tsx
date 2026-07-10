/**
 * @fileoverview Unit tests for the Pricing page content: loading, error,
 * the ready table, selecting a row to open its history timeline, and the
 * update form triggering a refetch.
 *
 * @layer components/pricing
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'
import { priceRowFixture } from '@/test/fixtures'

vi.mock('@/lib/api', () => ({
  api: { getCurrentPricing: vi.fn(), getPriceHistory: vi.fn(), updatePricing: vi.fn() },
}))

import { api } from '@/lib/api'

import { PricingPageContent } from './PricingPageContent.js'

describe('PricingPageContent', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    vi.mocked(api.getCurrentPricing).mockReturnValue(new Promise(() => {}))
    render(<PricingPageContent />)
    expect(screen.getByRole('status', { name: 'Loading current pricing' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error banner.
  it('renders an error banner on a rejection', async () => {
    vi.mocked(api.getCurrentPricing).mockRejectedValue(new ApiError('unknown_error', 500, 'oops'))
    render(<PricingPageContent />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('oops'))
  })

  // scenario: the ready state renders the table with no timeline selected yet.
  it('renders the table with no timeline selected', async () => {
    vi.mocked(api.getCurrentPricing).mockResolvedValue({ items: [priceRowFixture()] })
    render(<PricingPageContent />)
    await waitFor(() => expect(screen.getByText('mock-chat-standard')).toBeInTheDocument())
    expect(screen.queryByText(/History:/)).not.toBeInTheDocument()
  })

  // scenario: selecting a row's History action opens its timeline.
  it('opens the timeline for a selected row', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getCurrentPricing).mockResolvedValue({ items: [priceRowFixture()] })
    vi.mocked(api.getPriceHistory).mockResolvedValue({ items: [priceRowFixture()] })
    render(<PricingPageContent />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'History' }))
    await waitFor(() => expect(screen.getByText('History: mock-chat-standard')).toBeInTheDocument())
  })

  // scenario: a successful price update refetches the current pricing table.
  it('refetches the pricing table after a successful update', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getCurrentPricing).mockResolvedValue({ items: [] })
    vi.mocked(api.updatePricing).mockResolvedValue(priceRowFixture())
    render(<PricingPageContent />)
    await waitFor(() => expect(screen.getByText('No price rows yet')).toBeInTheDocument())
    const callsBefore = vi.mocked(api.getCurrentPricing).mock.calls.length

    await user.type(screen.getByLabelText('Model'), 'mock-chat-pro')
    await user.type(screen.getByLabelText('Input USD / 1M tokens (nano-USD)'), '1')
    await user.type(screen.getByLabelText('Output USD / 1M tokens (nano-USD)'), '1')
    await user.click(screen.getByRole('button', { name: 'Update pricing' }))

    await waitFor(() => expect(api.getCurrentPricing).toHaveBeenCalledTimes(callsBefore + 1))
  })
})
