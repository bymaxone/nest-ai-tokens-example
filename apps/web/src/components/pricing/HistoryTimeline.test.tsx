/**
 * @fileoverview Unit tests for the price history timeline: loading,
 * error, and the ready state rendering closed and open windows.
 *
 * @layer components/pricing
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'
import { priceRowFixture } from '@/test/fixtures'

vi.mock('@/lib/api', () => ({
  api: { getPriceHistory: vi.fn() },
}))

import { api } from '@/lib/api'

import { HistoryTimeline } from './HistoryTimeline.js'

describe('HistoryTimeline', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    vi.mocked(api.getPriceHistory).mockReturnValue(new Promise(() => {}))
    render(<HistoryTimeline row={priceRowFixture()} />)
    expect(screen.getByRole('status', { name: 'Loading price history' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error envelope.
  it('renders the error envelope on a rejection', async () => {
    vi.mocked(api.getPriceHistory).mockRejectedValue(
      new ApiError('pricing.model_not_found', 404, 'no such model'),
    )
    render(<HistoryTimeline row={priceRowFixture()} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no such model'))
  })

  // scenario: a closed window and the open successor both render, with the open one highlighted.
  it('renders a closed window and the open successor', async () => {
    vi.mocked(api.getPriceHistory).mockResolvedValue({
      items: [
        priceRowFixture({
          id: 'price-2',
          effectiveFrom: '2026-06-01T00:00:00.000Z',
          effectiveTo: null,
          inputNanoUsdPerMillion: '3000000000',
        }),
        priceRowFixture({
          id: 'price-1',
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          effectiveTo: '2026-06-01T00:00:00.000Z',
        }),
      ],
    })
    render(<HistoryTimeline row={priceRowFixture()} />)

    await waitFor(() => expect(screen.getByText(/now \(open\)/)).toBeInTheDocument())
    const openRow = screen.getByText(/now \(open\)/).closest('li')
    expect(openRow).toHaveAttribute('data-open', 'true')
    expect(screen.getByText('$3.000000 in / $2.000000 out')).toBeInTheDocument()
  })

  // scenario: calls the history endpoint with the row's provider/operation/tier.
  it('calls getPriceHistory with the row tuple', async () => {
    vi.mocked(api.getPriceHistory).mockResolvedValue({ items: [] })
    render(
      <HistoryTimeline row={priceRowFixture({ model: 'mock-embed', operation: 'embeddings' })} />,
    )
    await waitFor(() =>
      expect(api.getPriceHistory).toHaveBeenCalledWith('mock-embed', {
        provider: 'mock',
        operation: 'embeddings',
        serviceTier: 'standard',
      }),
    )
  })
})
