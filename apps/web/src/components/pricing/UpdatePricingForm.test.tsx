/**
 * @fileoverview Unit tests for the admin price-update form: happy path,
 * an error envelope render, rate validation gating submit, and field
 * selection.
 *
 * @layer components/pricing
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'
import { priceRowFixture } from '@/test/fixtures'

vi.mock('@/lib/api', () => ({
  api: { updatePricing: vi.fn() },
}))

import { api } from '@/lib/api'

import { UpdatePricingForm } from './UpdatePricingForm.js'

describe('UpdatePricingForm', () => {
  // scenario: submit is disabled while a rate field is not a valid digit string.
  it('disables submit until both rates are valid digit strings', async () => {
    const user = userEvent.setup()
    render(<UpdatePricingForm onUpdated={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Update pricing' })).toBeDisabled()

    await user.type(screen.getByLabelText('Model'), 'mock-chat-pro')
    await user.type(screen.getByLabelText('Input USD / 1M tokens (nano-USD)'), '1000000000')
    expect(screen.getByRole('button', { name: 'Update pricing' })).toBeDisabled()

    await user.type(screen.getByLabelText('Output USD / 1M tokens (nano-USD)'), '2000000000')
    expect(screen.getByRole('button', { name: 'Update pricing' })).toBeEnabled()
  })

  // scenario: a valid submit round-trips and renders the success toast.
  it('submits and renders a success toast', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    vi.mocked(api.updatePricing).mockResolvedValue(
      priceRowFixture({ effectiveFrom: '2026-07-10T00:00:00.000Z' }),
    )
    render(<UpdatePricingForm onUpdated={onUpdated} />)

    await user.type(screen.getByLabelText('Model'), 'mock-chat-pro')
    await user.type(screen.getByLabelText('Input USD / 1M tokens (nano-USD)'), '1000000000')
    await user.type(screen.getByLabelText('Output USD / 1M tokens (nano-USD)'), '2000000000')
    await user.click(screen.getByRole('button', { name: 'Update pricing' }))

    await waitFor(() => expect(screen.getByText(/Updated: new window opens/)).toBeInTheDocument())
    expect(api.updatePricing).toHaveBeenCalledWith('mock-chat-pro', {
      provider: 'mock',
      operation: 'chat',
      serviceTier: 'standard',
      inputNanoUsdPerMillion: '1000000000',
      outputNanoUsdPerMillion: '2000000000',
    })
    expect(onUpdated).toHaveBeenCalledOnce()
  })

  // scenario: picking a different operation and tier sends them through.
  it('sends the picked operation and service tier', async () => {
    const user = userEvent.setup()
    vi.mocked(api.updatePricing).mockResolvedValue(priceRowFixture())
    render(<UpdatePricingForm onUpdated={vi.fn()} />)

    await user.type(screen.getByLabelText('Model'), 'mock-embed')
    await user.selectOptions(screen.getByLabelText('Operation'), 'embeddings')
    await user.selectOptions(screen.getByLabelText('Service tier'), 'priority')
    await user.type(screen.getByLabelText('Input USD / 1M tokens (nano-USD)'), '100000000')
    await user.type(screen.getByLabelText('Output USD / 1M tokens (nano-USD)'), '0')
    await user.click(screen.getByRole('button', { name: 'Update pricing' }))

    await waitFor(() =>
      expect(api.updatePricing).toHaveBeenCalledWith(
        'mock-embed',
        expect.objectContaining({ operation: 'embeddings', serviceTier: 'priority' }),
      ),
    )
  })

  // scenario: an edited provider is sent through.
  it('sends an edited provider', async () => {
    const user = userEvent.setup()
    vi.mocked(api.updatePricing).mockResolvedValue(priceRowFixture())
    render(<UpdatePricingForm onUpdated={vi.fn()} />)

    await user.type(screen.getByLabelText('Model'), 'mock-chat-pro')
    const providerInput = screen.getByLabelText('Provider')
    await user.clear(providerInput)
    await user.type(providerInput, 'anthropic')
    await user.type(screen.getByLabelText('Input USD / 1M tokens (nano-USD)'), '1')
    await user.type(screen.getByLabelText('Output USD / 1M tokens (nano-USD)'), '1')
    await user.click(screen.getByRole('button', { name: 'Update pricing' }))

    await waitFor(() =>
      expect(api.updatePricing).toHaveBeenCalledWith(
        'mock-chat-pro',
        expect.objectContaining({ provider: 'anthropic' }),
      ),
    )
  })

  // scenario: a rejection renders the canonical error envelope.
  it('renders the error envelope on a rejection', async () => {
    const user = userEvent.setup()
    vi.mocked(api.updatePricing).mockRejectedValue(
      new ApiError('pricing.forbidden', 403, 'not an admin'),
    )
    render(<UpdatePricingForm onUpdated={vi.fn()} />)

    await user.type(screen.getByLabelText('Model'), 'mock-chat-pro')
    await user.type(screen.getByLabelText('Input USD / 1M tokens (nano-USD)'), '1')
    await user.type(screen.getByLabelText('Output USD / 1M tokens (nano-USD)'), '1')
    await user.click(screen.getByRole('button', { name: 'Update pricing' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not an admin'))
  })
})
