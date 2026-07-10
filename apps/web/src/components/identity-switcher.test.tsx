/**
 * @fileoverview Unit tests for the identity switcher dropdown.
 *
 * @layer components
 */
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { setIdentity } from '@/lib/identity-store'

import { IdentitySwitcher, getServerSnapshot } from './identity-switcher.js'

describe('IdentitySwitcher', () => {
  afterEach(() => {
    // Cleared through act(): a component from the just-finished test may still
    // be subscribed at this point (testing-library's own unmount afterEach runs
    // in registration order relative to this one), and setIdentity notifies
    // synchronously outside of React's event handling.
    act(() => {
      setIdentity(null)
    })
  })

  // scenario: every one of the four demo users appears as an option.
  it('lists all four demo users with their tenant badge', () => {
    render(<IdentitySwitcher />)
    expect(screen.getByRole('option', { name: 'ada · acme' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'grace · acme' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'linus · globex' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'root · global' })).toBeInTheDocument()
  })

  // scenario: no selection shows the placeholder option.
  it('shows the placeholder option when no identity is selected', () => {
    render(<IdentitySwitcher />)
    const select = screen.getByRole('combobox', { name: 'Select demo identity' })
    expect(within(select).getByRole('option', { selected: true })).toHaveTextContent(
      'Select identity',
    )
  })

  // scenario: a persisted identity pre-selects its option.
  it('reflects a previously selected identity on mount', () => {
    setIdentity({ userId: 'grace', tenantId: 'acme' })
    render(<IdentitySwitcher />)
    const select = screen.getByRole('combobox', { name: 'Select demo identity' })
    expect(within(select).getByRole('option', { selected: true })).toHaveTextContent('grace')
  })

  // scenario: choosing a demo user updates the identity store.
  it('updates the identity store when a demo user is selected', async () => {
    render(<IdentitySwitcher />)
    const select = screen.getByRole('combobox', { name: 'Select demo identity' })
    await userEvent.selectOptions(select, 'linus · globex')
    const { getIdentity } = await import('@/lib/identity-store')
    expect(getIdentity()).toEqual({ userId: 'linus', tenantId: 'globex' })
  })

  // scenario: choosing the placeholder clears the identity store.
  it('clears the identity store when the placeholder option is chosen', async () => {
    setIdentity({ userId: 'ada', tenantId: 'acme' })
    render(<IdentitySwitcher />)
    const select = screen.getByRole('combobox', { name: 'Select demo identity' })
    await userEvent.selectOptions(select, 'Select identity')
    const { getIdentity } = await import('@/lib/identity-store')
    expect(getIdentity()).toBeNull()
  })

  // scenario: the server snapshot (used before hydration) always reports no selection.
  it('getServerSnapshot always returns null', () => {
    expect(getServerSnapshot()).toBeNull()
  })
})
