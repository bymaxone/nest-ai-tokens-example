/**
 * @fileoverview Unit tests for the spend-by-type donut: loading, error,
 * empty, and ready states.
 *
 * @layer components/charts
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { getUsageByType: vi.fn() },
}))

import { api } from '@/lib/api'

import { TypeDonut } from './TypeDonut.js'

describe('TypeDonut', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    vi.mocked(api.getUsageByType).mockReturnValue(new Promise(() => {}))
    render(<TypeDonut />)
    expect(screen.getByRole('status', { name: 'Loading spend by type' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error banner.
  it('renders an error banner on failure', async () => {
    vi.mocked(api.getUsageByType).mockRejectedValue(
      new ApiError('AI_TOKENS_STORE_ERROR', 502, 'down'),
    )
    render(<TypeDonut />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('down'))
  })

  // scenario: an empty report renders the action-oriented empty state.
  it('renders an empty state', async () => {
    vi.mocked(api.getUsageByType).mockResolvedValue({
      window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [],
    })
    render(<TypeDonut />)
    await waitFor(() => expect(screen.getByText('No usage yet')).toBeInTheDocument())
  })

  // scenario: feature rows render the description line once data lands.
  it('renders once feature rows are available', async () => {
    vi.mocked(api.getUsageByType).mockResolvedValue({
      window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [
        {
          group: { feature: 'workspace.translate' },
          records: 3,
          totalTokens: 90,
          tokens: {},
          rawCostNanoUsd: '1',
          surchargeNanoUsd: '0',
          billedCostNanoUsd: '3000000',
          cacheSavingsNanoUsd: '0',
        },
        {
          group: { feature: 'workspace.embed' },
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
    render(<TypeDonut />)
    await waitFor(() =>
      expect(screen.getByText('Billed cost per feature label')).toBeInTheDocument(),
    )
  })

  // scenario: a row missing the feature group key still renders (falls back to "unknown").
  it('tolerates a missing feature group key', async () => {
    vi.mocked(api.getUsageByType).mockResolvedValue({
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
    render(<TypeDonut />)
    await waitFor(() =>
      expect(screen.getByText('Billed cost per feature label')).toBeInTheDocument(),
    )
  })
})
