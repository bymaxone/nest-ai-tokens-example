/**
 * @fileoverview Unit tests for the spend-by-model bar chart: loading,
 * error, empty, and ready states.
 *
 * @layer components/charts
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { getUsageByModel: vi.fn() },
}))

import { api } from '@/lib/api'

import { ModelBars } from './ModelBars.js'

describe('ModelBars', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    vi.mocked(api.getUsageByModel).mockReturnValue(new Promise(() => {}))
    render(<ModelBars />)
    expect(screen.getByRole('status', { name: 'Loading spend by model' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error banner.
  it('renders an error banner on failure', async () => {
    vi.mocked(api.getUsageByModel).mockRejectedValue(
      new ApiError('AI_TOKENS_STORE_ERROR', 502, 'down'),
    )
    render(<ModelBars />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('down'))
  })

  // scenario: an empty report renders the action-oriented empty state.
  it('renders an empty state', async () => {
    vi.mocked(api.getUsageByModel).mockResolvedValue({
      window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [],
    })
    render(<ModelBars />)
    await waitFor(() => expect(screen.getByText('No usage yet')).toBeInTheDocument())
  })

  // scenario: model rows render the description line once data lands.
  it('renders once model rows are available', async () => {
    vi.mocked(api.getUsageByModel).mockResolvedValue({
      window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [
        {
          group: { model: 'mock-chat-standard' },
          records: 5,
          totalTokens: 200,
          tokens: {},
          rawCostNanoUsd: '1',
          surchargeNanoUsd: '0',
          billedCostNanoUsd: '5000000',
          cacheSavingsNanoUsd: '0',
        },
      ],
    })
    render(<ModelBars />)
    await waitFor(() => expect(screen.getByText('Billed cost per model')).toBeInTheDocument())
  })

  // scenario: a row missing the model group key still renders (falls back to "unknown").
  it('tolerates a missing model group key', async () => {
    vi.mocked(api.getUsageByModel).mockResolvedValue({
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
    render(<ModelBars />)
    await waitFor(() => expect(screen.getByText('Billed cost per model')).toBeInTheDocument())
  })
})
