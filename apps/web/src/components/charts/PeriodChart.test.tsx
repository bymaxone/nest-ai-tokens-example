/**
 * @fileoverview Unit tests for the Usage page's granularity-switchable
 * spend-over-time chart: loading, error, empty, ready, and the tab switch.
 *
 * @layer components/charts
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { getUsageByPeriod: vi.fn() },
}))

import { api } from '@/lib/api'

import { PeriodChart } from './PeriodChart.js'

const EMPTY_REPORT = {
  window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
  items: [],
}

describe('PeriodChart', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    vi.mocked(api.getUsageByPeriod).mockReturnValue(new Promise(() => {}))
    render(<PeriodChart />)
    expect(screen.getByRole('status', { name: 'Loading spend over time' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error banner.
  it('renders an error banner on failure', async () => {
    vi.mocked(api.getUsageByPeriod).mockRejectedValue(
      new ApiError('AI_TOKENS_STORE_ERROR', 502, 'down'),
    )
    render(<PeriodChart />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('down'))
  })

  // scenario: an empty window renders the action-oriented empty state.
  it('renders an empty state', async () => {
    vi.mocked(api.getUsageByPeriod).mockResolvedValue(EMPTY_REPORT)
    render(<PeriodChart />)
    await waitFor(() => expect(screen.getByText('No usage yet')).toBeInTheDocument())
  })

  // scenario: buckets render the day-granularity description by default.
  it('renders the default day granularity', async () => {
    vi.mocked(api.getUsageByPeriod).mockResolvedValue({
      window: EMPTY_REPORT.window,
      items: [
        {
          group: { day: '2026-06-29' },
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
    render(<PeriodChart />)
    await waitFor(() => expect(screen.getByText('Billed cost per day bucket')).toBeInTheDocument())
    expect(api.getUsageByPeriod).toHaveBeenCalledWith({ granularity: 'day' })
  })

  // scenario: clicking the week tab re-queries with the new granularity.
  it('switches to week granularity on tab click', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getUsageByPeriod).mockResolvedValue(EMPTY_REPORT)
    render(<PeriodChart />)
    await waitFor(() => expect(api.getUsageByPeriod).toHaveBeenCalledWith({ granularity: 'day' }))

    await user.click(screen.getByRole('tab', { name: 'week' }))
    await waitFor(() => expect(api.getUsageByPeriod).toHaveBeenCalledWith({ granularity: 'week' }))
    expect(screen.getByRole('tab', { name: 'week' })).toHaveAttribute('aria-selected', 'true')
  })

  // scenario: a row missing the granularity group key still renders (falls back to an empty label).
  it('tolerates a missing bucket group key', async () => {
    vi.mocked(api.getUsageByPeriod).mockResolvedValue({
      window: EMPTY_REPORT.window,
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
    render(<PeriodChart />)
    await waitFor(() => expect(screen.getByText('Billed cost per day bucket')).toBeInTheDocument())
  })

  // scenario: clicking the month tab re-queries with the new granularity.
  it('switches to month granularity on tab click', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getUsageByPeriod).mockResolvedValue(EMPTY_REPORT)
    render(<PeriodChart />)
    await waitFor(() => expect(api.getUsageByPeriod).toHaveBeenCalledWith({ granularity: 'day' }))

    await user.click(screen.getByRole('tab', { name: 'month' }))
    await waitFor(() => expect(api.getUsageByPeriod).toHaveBeenCalledWith({ granularity: 'month' }))
  })
})
