/**
 * @fileoverview Unit tests for the system-costs-by-category panel:
 * loading, error, empty, and ready states (scenario §13.7).
 *
 * @layer components/usage
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { getSystemCosts: vi.fn() },
}))

import { api } from '@/lib/api'

import { SystemCostsPanel } from './SystemCostsPanel.js'

describe('SystemCostsPanel', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    vi.mocked(api.getSystemCosts).mockReturnValue(new Promise(() => {}))
    render(<SystemCostsPanel />)
    expect(screen.getByRole('status', { name: 'Loading system costs' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error banner.
  it('renders an error banner on failure', async () => {
    vi.mocked(api.getSystemCosts).mockRejectedValue(
      new ApiError('AI_TOKENS_STORE_ERROR', 502, 'down'),
    )
    render(<SystemCostsPanel />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('down'))
  })

  // scenario: an empty report renders the action-oriented empty state.
  it('renders an empty state', async () => {
    vi.mocked(api.getSystemCosts).mockResolvedValue({
      window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [],
    })
    render(<SystemCostsPanel />)
    await waitFor(() => expect(screen.getByText('No system costs yet')).toBeInTheDocument())
  })

  // scenario: the reindex category renders with its cost and count (scenario 7).
  it('renders the reindex category', async () => {
    vi.mocked(api.getSystemCosts).mockResolvedValue({
      window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [
        {
          group: { systemCostCategory: 'reindex' },
          records: 4,
          totalTokens: 400,
          tokens: {},
          rawCostNanoUsd: '1',
          surchargeNanoUsd: '0',
          billedCostNanoUsd: '4000000',
          cacheSavingsNanoUsd: '0',
        },
      ],
    })
    render(<SystemCostsPanel />)
    await waitFor(() => expect(screen.getByText('reindex: $0.004000 (4)')).toBeInTheDocument())
  })

  // scenario: a row missing the category group key still renders (falls back to "unknown").
  it('tolerates a missing category group key', async () => {
    vi.mocked(api.getSystemCosts).mockResolvedValue({
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
    render(<SystemCostsPanel />)
    await waitFor(() => expect(screen.getByText('unknown: $0.001000 (1)')).toBeInTheDocument())
  })
})
