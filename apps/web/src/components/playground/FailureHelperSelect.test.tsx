/**
 * @fileoverview Unit tests for the failure-marker helper.
 *
 * @layer components/playground
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FAILURE_MARKERS } from '@/lib/failure-markers'

import { FailureHelperSelect } from './FailureHelperSelect.js'

describe('FailureHelperSelect', () => {
  // scenario: the first marker is selected by default with its explanation shown.
  it('defaults to the first marker and shows its explanation', () => {
    render(<FailureHelperSelect onInsert={vi.fn()} id="marker" />)
    const first = FAILURE_MARKERS[0]
    if (first === undefined) throw new Error('expected at least one marker')
    expect(screen.getByRole('combobox')).toHaveValue(first.token)
    expect(screen.getByText(first.explanation)).toBeInTheDocument()
  })

  // scenario: picking a different marker updates the shown explanation.
  it('updates the explanation when a different marker is picked', async () => {
    const user = userEvent.setup()
    render(<FailureHelperSelect onInsert={vi.fn()} id="marker" />)
    const target = FAILURE_MARKERS[1]
    if (target === undefined) throw new Error('expected at least two markers')
    await user.selectOptions(screen.getByRole('combobox'), target.token)
    expect(screen.getByText(target.explanation)).toBeInTheDocument()
  })

  // scenario: clicking insert calls onInsert with the selected token.
  it('calls onInsert with the selected token', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()
    render(<FailureHelperSelect onInsert={onInsert} id="marker" />)
    const first = FAILURE_MARKERS[0]
    if (first === undefined) throw new Error('expected at least one marker')
    await user.click(screen.getByRole('button', { name: 'Insert into input' }))
    expect(onInsert).toHaveBeenCalledWith(first.token)
  })
})
