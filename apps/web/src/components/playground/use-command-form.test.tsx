/**
 * @fileoverview Unit tests for the shared command-card input state.
 *
 * @layer components/playground
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useCommandForm } from './use-command-form.js'

describe('useCommandForm', () => {
  // scenario: text and model start empty; resourceId is the caller's stable value.
  it('starts with empty text and model, and the given resourceId', () => {
    const { result } = renderHook(() => useCommandForm('translate-1'))
    expect(result.current.text).toBe('')
    expect(result.current.model).toBe('')
    expect(result.current.resourceId).toBe('translate-1')
  })

  // scenario: setText replaces the free-text body.
  it('setText replaces the text', () => {
    const { result } = renderHook(() => useCommandForm('translate-1'))
    act(() => result.current.setText('hello'))
    expect(result.current.text).toBe('hello')
  })

  // scenario: setModel replaces the selected model.
  it('setModel replaces the model', () => {
    const { result } = renderHook(() => useCommandForm('translate-1'))
    act(() => result.current.setModel('mock-chat-lite'))
    expect(result.current.model).toBe('mock-chat-lite')
  })

  // scenario: appendMarker appends the token to empty text with no leading space.
  it('appendMarker appends to empty text without a leading space', () => {
    const { result } = renderHook(() => useCommandForm('translate-1'))
    act(() => result.current.appendMarker('@@fail:timeout@@'))
    expect(result.current.text).toBe('@@fail:timeout@@')
  })

  // scenario: appendMarker appends the token to existing text with a separating space.
  it('appendMarker appends to existing text with a separator', () => {
    const { result } = renderHook(() => useCommandForm('translate-1'))
    act(() => result.current.setText('hello'))
    act(() => result.current.appendMarker('@@fail:timeout@@'))
    expect(result.current.text).toBe('hello @@fail:timeout@@')
  })

  // scenario: effectiveModel prefers the explicit user pick.
  it('effectiveModel prefers an explicit pick over the catalog', () => {
    const { result } = renderHook(() => useCommandForm('translate-1'))
    act(() => result.current.setModel('mock-chat-lite'))
    expect(result.current.effectiveModel(['mock-chat-pro'])).toBe('mock-chat-lite')
  })

  // scenario: effectiveModel falls back to the catalog's first model when nothing is picked.
  it('effectiveModel falls back to the catalog default', () => {
    const { result } = renderHook(() => useCommandForm('translate-1'))
    expect(result.current.effectiveModel(['mock-chat-pro', 'mock-chat-lite'])).toBe('mock-chat-pro')
  })

  // scenario: effectiveModel returns an empty string when nothing is picked and the catalog is empty.
  it('effectiveModel returns empty when nothing is available', () => {
    const { result } = renderHook(() => useCommandForm('translate-1'))
    expect(result.current.effectiveModel([])).toBe('')
  })
})
