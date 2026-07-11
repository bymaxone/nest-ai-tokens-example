/**
 * @fileoverview Unit tests for the Custom command card: happy path with
 * and without the optional system prompt, the format toggle, and an
 * error envelope render.
 *
 * @layer components/playground
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { custom: vi.fn() },
}))

import { api } from '@/lib/api'

import { CustomCard } from './CustomCard.js'

const USAGE = {
  transactionId: 'txn-1',
  model: 'mock-chat-pro',
  tokensUsed: { input: 5, output: 10, total: 15 },
  cost: { rawNanoUsd: '1', billedNanoUsd: '1', formatted: '$0.000001' },
}

describe('CustomCard', () => {
  // scenario: submitting with no system prompt sends undefined and the default text format.
  it('submits with no system prompt and the default format', async () => {
    const user = userEvent.setup()
    vi.mocked(api.custom).mockResolvedValue({
      resourceId: 'playground-custom',
      content: 'RAW CONTENT',
      usage: USAGE,
    })
    render(<CustomCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('User prompt'), 'do the thing')
    await user.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => expect(screen.getByText('RAW CONTENT')).toBeInTheDocument())
    expect(api.custom).toHaveBeenCalledWith({
      userPrompt: 'do the thing',
      responseFormat: 'text',
      model: 'mock-chat-pro',
      resourceId: 'playground-custom',
    })
  })

  // scenario: filling the system prompt and switching format sends both through.
  it('sends the system prompt and the json_object format', async () => {
    const user = userEvent.setup()
    vi.mocked(api.custom).mockResolvedValue({
      resourceId: 'playground-custom',
      content: '{}',
      usage: USAGE,
    })
    render(<CustomCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('System prompt (optional)'), 'be terse')
    await user.type(screen.getByLabelText('User prompt'), 'do the thing')
    await user.selectOptions(screen.getByLabelText('Response format'), 'json_object')
    await user.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() =>
      expect(api.custom).toHaveBeenCalledWith(
        expect.objectContaining({ systemPrompt: 'be terse', responseFormat: 'json_object' }),
      ),
    )
  })

  // scenario: a rejection renders the canonical error envelope.
  it('renders the error envelope on a rejection', async () => {
    const user = userEvent.setup()
    vi.mocked(api.custom).mockRejectedValue(new ApiError('provider.invalid_json', 502, 'bad json'))
    render(<CustomCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('User prompt'), 'do the thing')
    await user.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('bad json'))
  })

  // scenario: the submit button is disabled while the models catalog is still loading.
  it('disables submit while the models catalog is empty', () => {
    render(<CustomCard models={[]} />)
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  })
})
