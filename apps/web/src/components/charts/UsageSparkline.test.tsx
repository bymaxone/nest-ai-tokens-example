/**
 * @fileoverview Unit tests for the Overview 30-day spend sparkline:
 * loading, error, empty, and ready states.
 *
 * @layer components/charts
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { getUsageByPeriod: vi.fn() },
}))

import { api } from '@/lib/api'

import { UsageSparkline } from './UsageSparkline.js'

describe('UsageSparkline', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    vi.mocked(api.getUsageByPeriod).mockReturnValue(new Promise(() => {}))
    render(<UsageSparkline />)
    expect(screen.getByRole('status', { name: 'Loading usage sparkline' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error banner.
  it('renders an error banner on failure', async () => {
    vi.mocked(api.getUsageByPeriod).mockRejectedValue(
      new ApiError('AI_TOKENS_STORE_ERROR', 502, 'store down'),
    )
    render(<UsageSparkline />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('store down'))
  })

  // scenario: an empty history renders an action-oriented empty state.
  it('renders an empty state with no history', async () => {
    vi.mocked(api.getUsageByPeriod).mockResolvedValue({
      window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [],
    })
    render(<UsageSparkline />)
    await waitFor(() => expect(screen.getByText('No usage yet')).toBeInTheDocument())
  })

  // scenario: history renders the day-count summary line.
  it('renders the day-count summary when history exists', async () => {
    vi.mocked(api.getUsageByPeriod).mockResolvedValue({
      window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [
        {
          group: { day: '2026-06-29' },
          records: 2,
          totalTokens: 100,
          tokens: {},
          rawCostNanoUsd: '1000000',
          surchargeNanoUsd: '0',
          billedCostNanoUsd: '1000000',
          cacheSavingsNanoUsd: '0',
        },
        {
          group: { day: '2026-06-30' },
          records: 1,
          totalTokens: 50,
          tokens: {},
          rawCostNanoUsd: '2000000',
          surchargeNanoUsd: '0',
          billedCostNanoUsd: '2000000',
          cacheSavingsNanoUsd: '0',
        },
      ],
    })
    render(<UsageSparkline />)
    await waitFor(() =>
      expect(screen.getByText('Billed cost per day, 2 day(s) with usage')).toBeInTheDocument(),
    )
  })

  // scenario: a row missing the day group key still renders (falls back to an empty label).
  it('tolerates a missing day group key', async () => {
    vi.mocked(api.getUsageByPeriod).mockResolvedValue({
      window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [
        {
          group: {},
          records: 1,
          totalTokens: 10,
          tokens: {},
          rawCostNanoUsd: '1',
          surchargeNanoUsd: '0',
          billedCostNanoUsd: '1000000',
          cacheSavingsNanoUsd: '0',
        },
      ],
    })
    render(<UsageSparkline />)
    await waitFor(() =>
      expect(screen.getByText('Billed cost per day, 1 day(s) with usage')).toBeInTheDocument(),
    )
  })
})
