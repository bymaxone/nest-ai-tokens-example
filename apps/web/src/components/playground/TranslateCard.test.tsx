/**
 * @fileoverview Unit tests for the Translate command card: happy path,
 * an error envelope render, and the failure-marker helper wiring.
 *
 * @layer components/playground
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api-client'
import { FAILURE_MARKERS } from '@/lib/failure-markers'

vi.mock('@/lib/api', () => ({
  api: { translate: vi.fn() },
}))

import { api } from '@/lib/api'

import { TranslateCard } from './TranslateCard.js'

const USAGE = {
  transactionId: 'txn-1',
  model: 'mock-chat-pro',
  tokensUsed: { input: 5, output: 10, total: 15 },
  cost: { rawNanoUsd: '1', billedNanoUsd: '1', formatted: '$0.000001' },
}

describe('TranslateCard', () => {
  // scenario: submitting a filled form round-trips and renders the result panel.
  it('submits and renders the translations', async () => {
    const user = userEvent.setup()
    vi.mocked(api.translate).mockResolvedValue({
      resourceId: 'playground-translate',
      translations: { es: 'HOLA' },
      usage: USAGE,
    })
    render(<TranslateCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'hello')
    await user.click(screen.getByRole('button', { name: 'Translate' }))

    await waitFor(() => expect(screen.getByText('es: HOLA')).toBeInTheDocument())
    expect(api.translate).toHaveBeenCalledWith({
      text: 'hello',
      sourceLanguage: undefined,
      targetLanguages: ['es'],
      model: 'mock-chat-pro',
      resourceId: 'playground-translate',
    })
  })

  // scenario: a rejection renders the canonical error envelope.
  it('renders the error envelope on a rejection', async () => {
    const user = userEvent.setup()
    vi.mocked(api.translate).mockRejectedValue(
      new ApiError('AI_TOKENS_INSUFFICIENT_CREDITS', 402, 'not enough balance'),
    )
    render(<TranslateCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'hello')
    await user.click(screen.getByRole('button', { name: 'Translate' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not enough balance'))
  })

  // scenario: the failure-marker helper appends its token to the text field.
  it('appends a failure marker to the text field', async () => {
    const user = userEvent.setup()
    render(<TranslateCard models={['mock-chat-pro']} />)
    const target = FAILURE_MARKERS[1]
    if (target === undefined) throw new Error('expected at least two markers')

    await user.type(screen.getByLabelText('Text'), 'hi')
    const markerSelects = screen.getAllByRole('combobox')
    const markerSelect = markerSelects[markerSelects.length - 1]
    if (markerSelect === undefined) throw new Error('expected a marker select')
    await user.selectOptions(markerSelect, target.token)
    await user.click(screen.getByRole('button', { name: 'Insert into input' }))

    expect(screen.getByLabelText('Text')).toHaveValue(`hi ${target.token}`)
  })

  // scenario: the submit button is disabled while the models catalog is still loading.
  it('disables submit while the models catalog is empty', () => {
    render(<TranslateCard models={[]} />)
    expect(screen.getByRole('button', { name: 'Translate' })).toBeDisabled()
  })

  // scenario: editing the target languages field updates the sent list and the chip preview.
  it('sends an edited target-languages list', async () => {
    const user = userEvent.setup()
    vi.mocked(api.translate).mockResolvedValue({
      resourceId: 'playground-translate',
      translations: { fr: 'BONJOUR', de: 'HALLO' },
      usage: USAGE,
    })
    render(<TranslateCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'hello')
    const targets = screen.getByLabelText('Target languages (comma separated)')
    await user.clear(targets)
    await user.type(targets, 'fr,de')
    await user.click(screen.getByRole('button', { name: 'Translate' }))

    expect(screen.getByText('fr')).toBeInTheDocument()
    expect(screen.getByText('de')).toBeInTheDocument()
    await waitFor(() =>
      expect(api.translate).toHaveBeenCalledWith(
        expect.objectContaining({ targetLanguages: ['fr', 'de'] }),
      ),
    )
  })

  // scenario: an explicit source language is sent through untouched.
  it('sends an explicit source language', async () => {
    const user = userEvent.setup()
    vi.mocked(api.translate).mockResolvedValue({
      resourceId: 'playground-translate',
      translations: { es: 'HOLA' },
      usage: USAGE,
    })
    render(<TranslateCard models={['mock-chat-pro']} />)

    await user.type(screen.getByLabelText('Text'), 'hello')
    await user.type(screen.getByLabelText('Source language (optional)'), 'en')
    await user.click(screen.getByRole('button', { name: 'Translate' }))

    await waitFor(() =>
      expect(api.translate).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: 'en' })),
    )
  })
})
