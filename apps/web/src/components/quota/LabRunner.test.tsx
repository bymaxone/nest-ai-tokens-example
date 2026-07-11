/**
 * @fileoverview Unit tests for the estimator lab buttons and the
 * drain/top-up shortcuts.
 *
 * @layer components/quota
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: {
    runLabConstant: vi.fn(),
    runLabModelBased: vi.fn(),
    drainWallet: vi.fn(),
    credit: vi.fn(),
  },
}))

import { api } from '@/lib/api'

import { LabRunner } from './LabRunner.js'

describe('LabRunner', () => {
  // scenario: running the constant estimate round-trips and reports the settled tokens.
  it('runs the constant estimate and reports settled tokens', async () => {
    const user = userEvent.setup()
    const onBalanceChanged = vi.fn()
    vi.mocked(api.runLabConstant).mockResolvedValue({
      id: 'mock-1',
      model: 'mock-chat-lite',
      choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1000, completion_tokens: 0, total_tokens: 1000 },
    })
    render(<LabRunner onBalanceChanged={onBalanceChanged} />)

    await user.click(screen.getByRole('button', { name: 'Run constant estimate' }))
    await waitFor(() =>
      expect(screen.getByText('Constant estimate settled: 1000 tokens.')).toBeInTheDocument(),
    )
    expect(onBalanceChanged).toHaveBeenCalledOnce()
    // Prompt-less contract: the api defaults the prompt server-side, so the
    // button sends no body at all (the former web-side prompt workaround).
    expect(api.runLabConstant).toHaveBeenCalledWith()
  })

  // scenario: a constant-estimate rejection renders the canonical envelope.
  it('renders the error envelope when the constant estimate is rejected', async () => {
    const user = userEvent.setup()
    vi.mocked(api.runLabConstant).mockRejectedValue(
      new ApiError('AI_TOKENS_INSUFFICIENT_CREDITS', 402, 'no balance'),
    )
    render(<LabRunner onBalanceChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Run constant estimate' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no balance'))
  })

  // scenario: running the model-based estimate round-trips and reports the settled cost.
  it('runs the model-based estimate and reports the settled cost', async () => {
    const user = userEvent.setup()
    vi.mocked(api.runLabModelBased).mockResolvedValue({
      model: 'mock-chat-pro',
      content: 'echo',
      transactionId: 'txn-1',
      billedNanoUsd: '5000000',
      totalTokens: 5000,
    })
    render(<LabRunner onBalanceChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Run model-based estimate' }))
    await waitFor(() =>
      expect(
        screen.getByText('Model-based estimate settled: 5000 tokens, billed 5000000 nano-USD.'),
      ).toBeInTheDocument(),
    )
    // Prompt-less contract: only the model pick travels; the api defaults
    // the prompt server-side.
    expect(api.runLabModelBased).toHaveBeenCalledWith({ model: 'mock-chat-pro' })
  })

  // scenario: a model-based rejection renders the canonical envelope.
  it('renders the error envelope when the model-based estimate is rejected', async () => {
    const user = userEvent.setup()
    vi.mocked(api.runLabModelBased).mockRejectedValue(
      new ApiError('AI_TOKENS_INSUFFICIENT_CREDITS', 402, 'no balance'),
    )
    render(<LabRunner onBalanceChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Run model-based estimate' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no balance'))
  })

  // scenario: the top-up shortcut credits $10 and reports the new balance.
  it('tops up $10 and reports the new balance', async () => {
    const user = userEvent.setup()
    const onBalanceChanged = vi.fn()
    vi.mocked(api.credit).mockResolvedValue({
      entryId: 'entry-1',
      type: 'purchase',
      amountNanoUsd: '10000000000',
      balance: { nanoUsd: '10000000000', credits: 10, formatted: '$10.000000' },
    })
    render(<LabRunner onBalanceChanged={onBalanceChanged} />)
    await user.click(screen.getByRole('button', { name: 'Top up $10' }))
    await waitFor(() =>
      expect(screen.getByText('Credited $10. New balance: $10.000000.')).toBeInTheDocument(),
    )
    expect(onBalanceChanged).toHaveBeenCalledOnce()
  })

  // scenario: a top-up rejection renders the canonical envelope.
  it('renders the error envelope when the top-up is rejected', async () => {
    const user = userEvent.setup()
    vi.mocked(api.credit).mockRejectedValue(
      new ApiError('ledger.invalid_amount', 400, 'bad amount'),
    )
    render(<LabRunner onBalanceChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Top up $10' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('bad amount'))
  })

  // scenario: draining zeroes the wallet and the post-drain hold rejects at the wall.
  it('drains and renders the canonical AI_TOKENS_INSUFFICIENT_CREDITS wall', async () => {
    const user = userEvent.setup()
    const onBalanceChanged = vi.fn()
    vi.mocked(api.drainWallet).mockRejectedValueOnce(
      new ApiError('AI_TOKENS_INSUFFICIENT_CREDITS', 402, 'drained'),
    )
    render(<LabRunner onBalanceChanged={onBalanceChanged} />)

    await user.click(screen.getByRole('button', { name: 'Drain balance' }))
    await waitFor(() =>
      expect(screen.getByText(/rejected at the quota wall, as expected\./)).toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('drained')
    expect(onBalanceChanged).toHaveBeenCalled()
    // A single round-trip now hits the wall (no client-side loop).
    expect(api.drainWallet).toHaveBeenCalledOnce()
  })

  // scenario: an overdraft floor lets the post-drain hold pass, so the wall is not reached.
  it('reports the residual balance when the wall is not reached (overdraft)', async () => {
    const user = userEvent.setup()
    vi.mocked(api.drainWallet).mockResolvedValueOnce({
      drainedNanoUsd: '60000000000',
      balanceNanoUsd: '0',
      balanceFormatted: '$0.000000',
      wallReached: false,
    })
    render(<LabRunner onBalanceChanged={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Drain balance' }))
    await waitFor(() =>
      expect(screen.getByText(/Wallet drained to \$0\.000000/)).toBeInTheDocument(),
    )
    expect(screen.getByText(/the wall was not reached\./)).toBeInTheDocument()
  })

  // scenario: a non-ApiError drain rejection is normalized before reporting.
  it('normalizes a non-ApiError drain rejection', async () => {
    const user = userEvent.setup()
    vi.mocked(api.drainWallet).mockRejectedValueOnce(new Error('boom'))
    render(<LabRunner onBalanceChanged={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Drain balance' }))
    await waitFor(() =>
      expect(screen.getByText(/Drain stopped on an unexpected error\./)).toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong running the lab.')
  })

  // scenario: an unexpected (non-402) drain error is still reported honestly.
  it('reports an unexpected drain error honestly', async () => {
    const user = userEvent.setup()
    vi.mocked(api.drainWallet).mockRejectedValueOnce(new ApiError('unknown_error', 500, 'boom'))
    render(<LabRunner onBalanceChanged={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Drain balance' }))
    await waitFor(() =>
      expect(screen.getByText(/Drain stopped on an unexpected error\./)).toBeInTheDocument(),
    )
  })
})
