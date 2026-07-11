/**
 * @fileoverview Unit tests for the shared model-select control.
 *
 * @layer components/playground
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ModelPicker } from './ModelPicker.js'

describe('ModelPicker', () => {
  // scenario: an empty catalog renders a disabled loading placeholder.
  it('renders a disabled loading placeholder with no models', () => {
    render(<ModelPicker models={[]} value="" onChange={vi.fn()} id="model" />)
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByText('Loading models…')).toBeInTheDocument()
  })

  // scenario: a populated catalog renders every model as an option.
  it('renders every catalog model as an option', () => {
    render(
      <ModelPicker
        models={['mock-chat-pro', 'mock-chat-lite']}
        value="mock-chat-pro"
        onChange={vi.fn()}
        id="model"
      />,
    )
    expect(screen.getByRole('option', { name: 'mock-chat-pro' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'mock-chat-lite' })).toBeInTheDocument()
  })

  // scenario: picking a model calls onChange with the new value.
  it('calls onChange when a new model is picked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ModelPicker
        models={['mock-chat-pro', 'mock-chat-lite']}
        value="mock-chat-pro"
        onChange={onChange}
        id="model"
      />,
    )
    await user.selectOptions(screen.getByRole('combobox'), 'mock-chat-lite')
    expect(onChange).toHaveBeenCalledWith('mock-chat-lite')
  })
})
