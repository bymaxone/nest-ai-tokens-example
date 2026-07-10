/**
 * @fileoverview Unit tests for the Analyze command card: happy path and
 * an error envelope render.
 *
 * @layer components/playground
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { analyze: vi.fn() },
}))

import { api } from '@/lib/api'

import { AnalyzeCard } from './AnalyzeCard.js'

const USAGE = {
  transactionId: 'txn-1',
  model: 'mock-chat-pro',
  tokensUsed: { input: 5, output: 10, total: 15 },
  cost: { rawNanoUsd: '1', billedNanoUsd: '1', formatted: '$0.000001' },
}

describe('AnalyzeCard', () => {
  // scenario: submitting renders the fixed sentiment/entities schema.
  it('submits and renders the analysis', async () => {
    const user = userEvent.setup()
    vi.mocked(api.analyze).mockResolvedValue({
      resourceId: 'playground-analyze',
      analysis: { sentiment: 'positive', entities: ['Bymax', 'Nest'] },
      usage: USAGE,
    })
    render(<AnalyzeCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'great product')
    await user.click(screen.getByRole('button', { name: 'Analyze' }))

    await waitFor(() => expect(screen.getByTestId('result-panel')).toBeInTheDocument())
    expect(screen.getByTestId('result-panel').textContent).toContain(
      'sentiment: positive\nentities: Bymax, Nest',
    )
    expect(api.analyze).toHaveBeenCalledWith({
      text: 'great product',
      model: 'mock-chat-pro',
      resourceId: 'playground-analyze',
    })
  })

  // scenario: a rejection renders the canonical error envelope.
  it('renders the error envelope on a rejection', async () => {
    const user = userEvent.setup()
    vi.mocked(api.analyze).mockRejectedValue(new ApiError('provider.empty_response', 502, 'empty'))
    render(<AnalyzeCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'great product')
    await user.click(screen.getByRole('button', { name: 'Analyze' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('empty'))
  })

  // scenario: the submit button is disabled while the models catalog is still loading.
  it('disables submit while the models catalog is empty', () => {
    render(<AnalyzeCard models={[]} />)
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeDisabled()
  })
})
