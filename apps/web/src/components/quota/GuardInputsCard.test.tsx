/**
 * @fileoverview Unit tests for the guard-decision inputs card: loading,
 * error, and ready states, plus the documented tolerance/minimum
 * defaults.
 *
 * @layer components/quota
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'

vi.mock('@/lib/api', () => ({
  api: { getBalance: vi.fn() },
}))

import { api } from '@/lib/api'

import { GuardInputsCard } from './GuardInputsCard.js'

describe('GuardInputsCard', () => {
  // scenario: the balance stat shows a loading skeleton before the fetch resolves.
  it('renders a loading balance', () => {
    vi.mocked(api.getBalance).mockReturnValue(new Promise(() => {}))
    render(<GuardInputsCard />)
    expect(screen.getByRole('status', { name: 'Loading Balance' })).toBeInTheDocument()
  })

  // scenario: a rejection renders the error banner instead of the balance stat.
  it('renders an error banner on failure', async () => {
    vi.mocked(api.getBalance).mockRejectedValue(
      new ApiError('quota.disabled', 503, 'wallets are off'),
    )
    render(<GuardInputsCard />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('wallets are off'))
  })

  // scenario: the ready state renders the balance plus the documented tolerance and minimum.
  it('renders the balance, tolerance, and minimum balance', async () => {
    vi.mocked(api.getBalance).mockResolvedValue({
      nanoUsd: '52500000000',
      credits: 52.5,
      formatted: '$52.500000',
    })
    render(<GuardInputsCard />)
    await waitFor(() => expect(screen.getByText('$52.500000')).toBeInTheDocument())
    expect(screen.getByText('1.2x')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })
})
