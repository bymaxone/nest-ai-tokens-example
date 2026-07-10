/**
 * @fileoverview Unit tests for the Overview totals stat cards: loading,
 * error, and the summed ready state.
 *
 * @layer components/overview
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { getUsageByPeriod: vi.fn() },
}))

import { api } from '@/lib/api'

import { TotalsStats } from './TotalsStats.js'

describe('TotalsStats', () => {
  // scenario: both cards show a loading skeleton while the fetch is in flight.
  it('renders loading skeletons for both cards', () => {
    vi.mocked(api.getUsageByPeriod).mockReturnValue(new Promise(() => {}))
    render(<TotalsStats />)
    expect(screen.getByRole('status', { name: 'Loading Tokens consumed' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading Cost (USD)' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the same message on both cards.
  it('renders the error message on both cards', async () => {
    vi.mocked(api.getUsageByPeriod).mockRejectedValue(
      new ApiError('AI_TOKENS_STORE_ERROR', 502, 'store down'),
    )
    render(<TotalsStats />)
    await waitFor(() => expect(screen.getAllByText('store down')).toHaveLength(2))
  })

  // scenario: the ready state sums tokens and billed cost across every bucket.
  it('sums tokens and billed cost across buckets', async () => {
    vi.mocked(api.getUsageByPeriod).mockResolvedValue({
      window: { from: '2026-04-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [
        {
          group: { month: '2026-05' },
          records: 2,
          totalTokens: 1000,
          tokens: {},
          rawCostNanoUsd: '1',
          surchargeNanoUsd: '0',
          billedCostNanoUsd: '5000000',
          cacheSavingsNanoUsd: '0',
        },
        {
          group: { month: '2026-06' },
          records: 1,
          totalTokens: 234,
          tokens: {},
          rawCostNanoUsd: '1',
          surchargeNanoUsd: '0',
          billedCostNanoUsd: '2500000',
          cacheSavingsNanoUsd: '0',
        },
      ],
    })
    render(<TotalsStats />)
    await waitFor(() => expect(screen.getByText('1,234')).toBeInTheDocument())
    expect(screen.getByText('$0.007500')).toBeInTheDocument()
  })

  // scenario: an empty report sums to zero without crashing.
  it('renders zero totals for an empty report', async () => {
    vi.mocked(api.getUsageByPeriod).mockResolvedValue({
      window: { from: '2026-04-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [],
    })
    render(<TotalsStats />)
    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument())
    expect(screen.getByText('$0.000000')).toBeInTheDocument()
  })
})
