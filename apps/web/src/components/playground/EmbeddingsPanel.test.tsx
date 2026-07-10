/**
 * @fileoverview Unit tests for the embeddings panel: single embed happy
 * path and error, batch embed happy path (one transaction for N inputs)
 * and error.
 *
 * @layer components/playground
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { embed: vi.fn(), embedBatch: vi.fn() },
}))

import { api } from '@/lib/api'

import { EmbeddingsPanel } from './EmbeddingsPanel.js'

const USAGE = {
  transactionId: 'txn-embed-1',
  model: 'mock-embed',
  tokensUsed: { input: 5, output: 0, total: 5 },
  cost: { rawNanoUsd: '1', billedNanoUsd: '1', formatted: '$0.000001' },
}

describe('EmbeddingsPanel', () => {
  // scenario: a single embed round-trips and renders a vector preview.
  it('submits a single embed and renders a preview', async () => {
    const user = userEvent.setup()
    vi.mocked(api.embed).mockResolvedValue({
      resourceId: 'playground-embed',
      vector: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
      usage: USAGE,
    })
    render(<EmbeddingsPanel />)

    await user.type(screen.getByLabelText('Single embed text'), 'hello world')
    await user.click(screen.getByRole('button', { name: 'Embed' }))

    await waitFor(() => expect(screen.getByText(/0.1000, 0.2000/)).toBeInTheDocument())
    expect(api.embed).toHaveBeenCalledWith({ text: 'hello world', resourceId: 'playground-embed' })
  })

  // scenario: a single embed rejection renders the canonical error envelope.
  it('renders the error envelope for a failed single embed', async () => {
    const user = userEvent.setup()
    vi.mocked(api.embed).mockRejectedValue(new ApiError('provider.timeout', 504, 'timed out'))
    render(<EmbeddingsPanel />)

    await user.type(screen.getByLabelText('Single embed text'), 'hello world')
    await user.click(screen.getByRole('button', { name: 'Embed' }))

    await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent('timed out'))
  })

  // scenario: batch embed of N lines settles as ONE transaction (scenario 2).
  it('submits a batch embed as one transaction for N inputs', async () => {
    const user = userEvent.setup()
    vi.mocked(api.embedBatch).mockResolvedValue({
      resourceId: 'playground-embed-batch',
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      batchSize: 2,
      usage: USAGE,
    })
    render(<EmbeddingsPanel />)

    await user.type(screen.getByLabelText('Batch embed texts'), 'first{Enter}second')
    await user.click(screen.getByRole('button', { name: 'Embed 2 text(s)' }))

    await waitFor(() =>
      expect(screen.getByText('2 inputs, ONE transaction: txn-embed-1')).toBeInTheDocument(),
    )
    expect(api.embedBatch).toHaveBeenCalledWith({
      texts: ['first', 'second'],
      resourceId: 'playground-embed-batch',
    })
  })

  // scenario: a batch embed rejection renders the canonical error envelope.
  it('renders the error envelope for a failed batch embed', async () => {
    const user = userEvent.setup()
    vi.mocked(api.embedBatch).mockRejectedValue(
      new ApiError('provider.rate_limited', 429, 'rate limited'),
    )
    render(<EmbeddingsPanel />)

    await user.type(screen.getByLabelText('Batch embed texts'), 'first')
    await user.click(screen.getByRole('button', { name: 'Embed 1 text(s)' }))

    await waitFor(() =>
      expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent('rate limited'),
    )
  })
})
