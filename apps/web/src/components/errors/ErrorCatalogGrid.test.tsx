/**
 * @fileoverview Unit tests for the Errors page's catalog grid: loading,
 * error, grouping, the trigger round trip rendering the canonical
 * envelope, and non-triggerable entries showing their explanation
 * instead of a button.
 *
 * @layer components/errors
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { getErrorCatalog: vi.fn(), triggerError: vi.fn() },
}))

import { api } from '@/lib/api'

import { ErrorCatalogGrid } from './ErrorCatalogGrid.js'

describe('ErrorCatalogGrid', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    vi.mocked(api.getErrorCatalog).mockReturnValue(new Promise(() => {}))
    render(<ErrorCatalogGrid />)
    expect(screen.getByRole('status', { name: 'Loading error catalog' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error banner.
  it('renders an error banner on a rejection', async () => {
    vi.mocked(api.getErrorCatalog).mockRejectedValue(new ApiError('unknown_error', 500, 'oops'))
    render(<ErrorCatalogGrid />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('oops'))
  })

  // scenario: entries render grouped by their dot-namespace, with a Trigger button for triggerable codes.
  it('renders grouped entries with a Trigger button for a triggerable code', async () => {
    vi.mocked(api.getErrorCatalog).mockResolvedValue({
      entries: [
        {
          code: 'ledger.transaction_not_found',
          source: 'app',
          httpStatus: 404,
          availability: 'trigger',
          summary: 'The transaction id is unknown.',
        },
      ],
      triggerable: ['ledger.transaction_not_found'],
    })
    render(<ErrorCatalogGrid />)
    await waitFor(() => expect(screen.getByText('ledger')).toBeInTheDocument())
    expect(screen.getByText('ledger.transaction_not_found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument()
  })

  // scenario: a non-triggerable code shows its explanation instead of a button.
  it('renders the explanation for a non-triggerable code', async () => {
    vi.mocked(api.getErrorCatalog).mockResolvedValue({
      entries: [
        {
          code: 'AI_TOKENS_INVALID_CONFIG',
          source: 'library',
          httpStatus: 500,
          availability: 'boot-variant',
          summary: 'Proven by an e2e boot with an invalid config.',
        },
      ],
      triggerable: [],
    })
    render(<ErrorCatalogGrid />)
    await waitFor(() =>
      expect(
        screen.getByText('boot-variant: Proven by an e2e boot with an invalid config.'),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: 'Trigger' })).not.toBeInTheDocument()
  })

  // scenario: triggering a code renders the canonical envelope it fails with.
  it('renders the canonical envelope after a trigger', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getErrorCatalog).mockResolvedValue({
      entries: [
        {
          code: 'AI_TOKENS_INSUFFICIENT_CREDITS',
          source: 'library',
          httpStatus: 402,
          availability: 'trigger',
          summary: 'A debit no demo wallet can cover.',
        },
      ],
      triggerable: ['AI_TOKENS_INSUFFICIENT_CREDITS'],
    })
    vi.mocked(api.triggerError).mockRejectedValue(
      new ApiError('AI_TOKENS_INSUFFICIENT_CREDITS', 402, 'not enough balance', {
        balance: '0',
        estimated: '1000',
      }),
    )
    render(<ErrorCatalogGrid />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Trigger' }))

    await waitFor(() =>
      expect(screen.getByText('Last trigger: AI_TOKENS_INSUFFICIENT_CREDITS')).toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('not enough balance')
    expect(api.triggerError).toHaveBeenCalledWith('AI_TOKENS_INSUFFICIENT_CREDITS')
  })

  // scenario: a non-ApiError rejection from the trigger is normalized.
  it('normalizes a non-ApiError rejection from a trigger', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getErrorCatalog).mockResolvedValue({
      entries: [
        {
          code: 'provider.timeout',
          source: 'app',
          httpStatus: 504,
          availability: 'trigger',
          summary: 'The mock provider simulated an upstream timeout.',
        },
      ],
      triggerable: ['provider.timeout'],
    })
    vi.mocked(api.triggerError).mockRejectedValue(new Error('boom'))
    render(<ErrorCatalogGrid />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Trigger' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Something went wrong triggering this code.',
      ),
    )
  })
})
