/**
 * @fileoverview Unit tests for the Overview default-models card: loading,
 * error, and ready states.
 *
 * @layer components/overview
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'
import { priceRowFixture } from '@/test/fixtures'

vi.mock('@/lib/api', () => ({
  api: { getModels: vi.fn() },
}))

import { api } from '@/lib/api'

import { ModelsBadge } from './ModelsBadge.js'

describe('ModelsBadge', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    vi.mocked(api.getModels).mockReturnValue(new Promise(() => {}))
    render(<ModelsBadge />)
    expect(screen.getByRole('status', { name: 'Loading default models' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error banner.
  it('renders an error banner on failure', async () => {
    vi.mocked(api.getModels).mockRejectedValue(new ApiError('AI_TOKENS_STORE_ERROR', 502, 'down'))
    render(<ModelsBadge />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('down'))
  })

  // scenario: the ready state renders both default models with pricing badges.
  it('renders both default models with pricing badges', async () => {
    vi.mocked(api.getModels).mockResolvedValue({
      command: {
        model: 'mock-chat-standard',
        models: ['mock-chat-standard', 'mock-chat-pro'],
        pricing: priceRowFixture({
          inputNanoUsdPerMillion: '1000000000',
          outputNanoUsdPerMillion: '2000000000',
        }),
      },
      embedding: {
        model: 'mock-embed-standard',
        pricing: priceRowFixture({
          model: 'mock-embed-standard',
          operation: 'embeddings',
          inputNanoUsdPerMillion: '100000000',
        }),
      },
    })
    render(<ModelsBadge />)
    await waitFor(() => expect(screen.getByText('mock-chat-standard')).toBeInTheDocument())
    expect(screen.getByText('mock-embed-standard')).toBeInTheDocument()
    expect(screen.getByText('$1.000000 in')).toBeInTheDocument()
    expect(screen.getByText('$2.000000 out')).toBeInTheDocument()
    expect(screen.getByText('$0.100000 in')).toBeInTheDocument()
  })
})
