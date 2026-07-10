/**
 * @fileoverview Unit tests for the Rewrite command card: happy path with
 * and without the optional fields, and an error envelope render.
 *
 * @layer components/playground
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { rewrite: vi.fn() },
}))

import { api } from '@/lib/api'

import { RewriteCard } from './RewriteCard.js'

const USAGE = {
  transactionId: 'txn-1',
  model: 'mock-chat-pro',
  tokensUsed: { input: 5, output: 10, total: 15 },
  cost: { rawNanoUsd: '1', billedNanoUsd: '1', formatted: '$0.000001' },
}

describe('RewriteCard', () => {
  // scenario: submitting with no optional fields sends undefined for both.
  it('submits with no optional fields', async () => {
    const user = userEvent.setup()
    vi.mocked(api.rewrite).mockResolvedValue({
      resourceId: 'playground-rewrite',
      rewritten: 'REWRITTEN',
      usage: USAGE,
    })
    render(<RewriteCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'original text')
    await user.click(screen.getByRole('button', { name: 'Rewrite' }))

    await waitFor(() => expect(screen.getByText('REWRITTEN')).toBeInTheDocument())
    expect(api.rewrite).toHaveBeenCalledWith({
      text: 'original text',
      style: undefined,
      language: undefined,
      model: 'mock-chat-pro',
      resourceId: 'playground-rewrite',
    })
  })

  // scenario: filling the optional fields sends them through.
  it('sends the style and language when filled', async () => {
    const user = userEvent.setup()
    vi.mocked(api.rewrite).mockResolvedValue({
      resourceId: 'playground-rewrite',
      rewritten: 'REWRITTEN',
      usage: USAGE,
    })
    render(<RewriteCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'original text')
    await user.type(screen.getByLabelText('Style (optional)'), 'formal')
    await user.type(screen.getByLabelText('Language (optional)'), 'pt')
    await user.click(screen.getByRole('button', { name: 'Rewrite' }))

    await waitFor(() =>
      expect(api.rewrite).toHaveBeenCalledWith(
        expect.objectContaining({ style: 'formal', language: 'pt' }),
      ),
    )
  })

  // scenario: a rejection renders the canonical error envelope.
  it('renders the error envelope on a rejection', async () => {
    const user = userEvent.setup()
    vi.mocked(api.rewrite).mockRejectedValue(
      new ApiError('provider.content_filter', 400, 'blocked'),
    )
    render(<RewriteCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'original text')
    await user.click(screen.getByRole('button', { name: 'Rewrite' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('blocked'))
  })

  // scenario: the submit button is disabled while the models catalog is still loading.
  it('disables submit while the models catalog is empty', () => {
    render(<RewriteCard models={[]} />)
    expect(screen.getByRole('button', { name: 'Rewrite' })).toBeDisabled()
  })
})
