/**
 * @fileoverview Unit tests for the current-pricing table: empty state,
 * row rendering, and the History action.
 *
 * @layer components/pricing
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { priceRowFixture } from '@/test/fixtures'

import { CurrentPricingTable } from './CurrentPricingTable.js'

describe('CurrentPricingTable', () => {
  // scenario: no rows renders an action-oriented empty state.
  it('renders an empty state with no rows', () => {
    render(<CurrentPricingTable items={[]} onSelect={vi.fn()} />)
    expect(screen.getByText('No price rows yet')).toBeInTheDocument()
  })

  // scenario: a row renders its model, rates, and effective date.
  it('renders a price row', () => {
    render(<CurrentPricingTable items={[priceRowFixture()]} onSelect={vi.fn()} />)
    expect(screen.getByText('mock-chat-standard')).toBeInTheDocument()
    expect(screen.getByText('$1.000000')).toBeInTheDocument()
    expect(screen.getByText('$2.000000')).toBeInTheDocument()
  })

  // scenario: clicking History calls onSelect with the row.
  it('calls onSelect when History is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const row = priceRowFixture()
    render(<CurrentPricingTable items={[row]} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(onSelect).toHaveBeenCalledWith(row)
  })
})
