/**
 * @fileoverview Unit tests for the ledger status filter chips.
 *
 * @layer components/ledger
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { StatusChips } from './StatusChips.js'

describe('StatusChips', () => {
  // scenario: every status renders as an unpressed chip when nothing is selected.
  it('renders every status unpressed with no selection', () => {
    render(<StatusChips value={[]} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'posted' })).toHaveAttribute('aria-pressed', 'false')
  })

  // scenario: a selected status renders pressed.
  it('renders a selected status as pressed', () => {
    render(<StatusChips value={['posted']} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'posted' })).toHaveAttribute('aria-pressed', 'true')
  })

  // scenario: clicking an unselected chip adds it to the selection.
  it('adds a status when its chip is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatusChips value={['posted']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'reversed' }))
    expect(onChange).toHaveBeenCalledWith(['posted', 'reversed'])
  })

  // scenario: clicking a selected chip removes it from the selection.
  it('removes a status when its chip is clicked again', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatusChips value={['posted', 'reversed']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'posted' }))
    expect(onChange).toHaveBeenCalledWith(['reversed'])
  })
})
