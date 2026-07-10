/**
 * @fileoverview Unit tests for the top-consumers leaderboard: loading,
 * error, empty, and ready states.
 *
 * @layer components/usage
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { getTopConsumers: vi.fn() },
}))

import { api } from '@/lib/api'

import { TopConsumers } from './TopConsumers.js'

describe('TopConsumers', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    vi.mocked(api.getTopConsumers).mockReturnValue(new Promise(() => {}))
    render(<TopConsumers />)
    expect(screen.getByRole('status', { name: 'Loading top consumers' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error banner.
  it('renders an error banner on failure', async () => {
    vi.mocked(api.getTopConsumers).mockRejectedValue(
      new ApiError('AI_TOKENS_STORE_ERROR', 502, 'down'),
    )
    render(<TopConsumers />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('down'))
  })

  // scenario: an empty report renders the action-oriented empty state.
  it('renders an empty state', async () => {
    vi.mocked(api.getTopConsumers).mockResolvedValue({
      window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [],
    })
    render(<TopConsumers />)
    await waitFor(() => expect(screen.getByText('No consumers yet')).toBeInTheDocument())
  })

  // scenario: consumer rows render scope, calls, tokens, and cost.
  it('renders consumer rows', async () => {
    vi.mocked(api.getTopConsumers).mockResolvedValue({
      window: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      items: [
        {
          group: { scope: 'user:ada' },
          records: 3,
          totalTokens: 1500,
          tokens: {},
          rawCostNanoUsd: '1',
          surchargeNanoUsd: '0',
          billedCostNanoUsd: '3000000',
          cacheSavingsNanoUsd: '0',
        },
      ],
    })
    render(<TopConsumers />)
    await waitFor(() => expect(screen.getByText('user:ada')).toBeInTheDocument())
    expect(screen.getByText('1,500')).toBeInTheDocument()
    expect(screen.getByText('$0.003000')).toBeInTheDocument()
  })

  // scenario: a row missing the scope group key still renders (falls back to "unknown").
  it('tolerates a missing scope group key', async () => {
    vi.mocked(api.getTopConsumers).mockResolvedValue({
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
    render(<TopConsumers />)
    await waitFor(() => expect(screen.getByText('unknown')).toBeInTheDocument())
  })
})
