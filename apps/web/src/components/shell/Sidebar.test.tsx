/**
 * @fileoverview Unit tests for the sidebar nav rail and its active-route
 * logic.
 *
 * @layer components/shell
 */
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/overview'),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// Imported after the mocks so the component picks up the mocked modules.
import { usePathname } from 'next/navigation'

import { Sidebar } from './Sidebar.js'

describe('Sidebar', () => {
  // scenario: every one of the eight dashboard routes renders a link.
  it('renders a link for all eight nav routes', () => {
    vi.mocked(usePathname).mockReturnValue('/overview')
    render(<Sidebar />)
    expect(screen.getAllByRole('link')).toHaveLength(8)
  })

  // scenario: the exact-match route is marked active.
  it('marks the exact current route active', () => {
    vi.mocked(usePathname).mockReturnValue('/overview')
    render(<Sidebar />)
    expect(screen.getByRole('link', { name: /overview/i })).toHaveAttribute('aria-current', 'page')
  })

  // scenario: a route that is not the current path is never marked active.
  it('does not mark an unrelated route active', () => {
    vi.mocked(usePathname).mockReturnValue('/overview')
    render(<Sidebar />)
    expect(screen.getByRole('link', { name: /ledger/i })).not.toHaveAttribute('aria-current')
  })

  // scenario: a nested child path still activates its parent route (prefix match).
  it('marks a route active on a nested child path', () => {
    vi.mocked(usePathname).mockReturnValue('/ledger/tx-123')
    render(<Sidebar />)
    expect(screen.getByRole('link', { name: /ledger/i })).toHaveAttribute('aria-current', 'page')
  })

  // scenario: a route must not activate merely because another route's path prefixes it
  // (/ledgering shares the /ledger prefix WITHOUT a slash boundary).
  it('does not activate on a route name that merely shares a prefix', () => {
    vi.mocked(usePathname).mockReturnValue('/ledgering')
    render(<Sidebar />)
    expect(screen.getByRole('link', { name: /^ledger$/i })).not.toHaveAttribute('aria-current')
  })

  // scenario: the family footer note renders inside the nav landmark.
  it('renders the sidebar footer note', () => {
    vi.mocked(usePathname).mockReturnValue('/overview')
    render(<Sidebar />)
    expect(screen.getByText('nest-ai-tokens-example')).toBeInTheDocument()
  })
})
