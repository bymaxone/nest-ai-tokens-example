/**
 * @fileoverview Unit tests for the Summarize command card: happy path,
 * style selection, and an error envelope render.
 *
 * @layer components/playground
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { summarize: vi.fn() },
}))

import { api } from '@/lib/api'

import { SummarizeCard } from './SummarizeCard.js'

const USAGE = {
  transactionId: 'txn-1',
  model: 'mock-chat-pro',
  tokensUsed: { input: 5, output: 10, total: 15 },
  cost: { rawNanoUsd: '1', billedNanoUsd: '1', formatted: '$0.000001' },
}

describe('SummarizeCard', () => {
  // scenario: submitting with the default style round-trips and renders the summary.
  it('submits with the default style and renders the summary', async () => {
    const user = userEvent.setup()
    vi.mocked(api.summarize).mockResolvedValue({
      resourceId: 'playground-summarize',
      summary: 'a short summary',
      usage: USAGE,
    })
    render(<SummarizeCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'a long article')
    await user.click(screen.getByRole('button', { name: 'Summarize' }))

    await waitFor(() => expect(screen.getByText('a short summary')).toBeInTheDocument())
    expect(api.summarize).toHaveBeenCalledWith({
      text: 'a long article',
      style: 'tldr',
      model: 'mock-chat-pro',
      resourceId: 'playground-summarize',
    })
  })

  // scenario: picking a different style sends it through.
  it('sends the picked style', async () => {
    const user = userEvent.setup()
    vi.mocked(api.summarize).mockResolvedValue({
      resourceId: 'playground-summarize',
      summary: '- point one',
      usage: USAGE,
    })
    render(<SummarizeCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'a long article')
    await user.selectOptions(screen.getByLabelText('Style'), 'bullet')
    await user.click(screen.getByRole('button', { name: 'Summarize' }))

    await waitFor(() =>
      expect(api.summarize).toHaveBeenCalledWith(expect.objectContaining({ style: 'bullet' })),
    )
  })

  // scenario: a rejection renders the canonical error envelope.
  it('renders the error envelope on a rejection', async () => {
    const user = userEvent.setup()
    vi.mocked(api.summarize).mockRejectedValue(new ApiError('provider.timeout', 504, 'timed out'))
    render(<SummarizeCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'a long article')
    await user.click(screen.getByRole('button', { name: 'Summarize' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('timed out'))
  })

  // scenario: the submit button is disabled while the models catalog is still loading.
  it('disables submit while the models catalog is empty', () => {
    render(<SummarizeCard models={[]} />)
    expect(screen.getByRole('button', { name: 'Summarize' })).toBeDisabled()
  })
})
