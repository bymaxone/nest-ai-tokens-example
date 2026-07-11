/**
 * @fileoverview Unit tests for the canonical error-envelope renderer.
 *
 * @layer components/common
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/lib/api-client'

import { ErrorBanner } from './ErrorBanner.js'

describe('ErrorBanner', () => {
  // scenario: code, status, and message all render, with an alert role.
  it('renders the code, status, and message', () => {
    render(<ErrorBanner error={new ApiError('ledger.transaction_not_found', 404, 'no such row')} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('ledger.transaction_not_found')
    expect(alert).toHaveTextContent('404')
    expect(alert).toHaveTextContent('no such row')
  })

  // scenario: details, when present, render as formatted JSON.
  it('renders details verbatim', () => {
    render(
      <ErrorBanner
        error={
          new ApiError('AI_TOKENS_INSUFFICIENT_CREDITS', 402, 'not enough balance', {
            balance: '100',
            estimated: '500',
          })
        }
      />,
    )
    expect(screen.getByText(/"balance": "100"/)).toBeInTheDocument()
  })

  // scenario: a network failure (status 0) omits the status chip.
  it('omits the status chip for a network failure', () => {
    render(<ErrorBanner error={new ApiError('network_error', 0, 'Could not reach the api.')} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  // scenario: no details means no JSON block is rendered.
  it('renders no details block when absent', () => {
    const { container } = render(<ErrorBanner error={new ApiError('unknown_error', 500, 'oops')} />)
    expect(container.querySelector('pre')).toBeNull()
  })
})
