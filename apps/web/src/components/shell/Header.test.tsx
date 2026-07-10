/**
 * @fileoverview Unit tests for the dashboard topbar.
 *
 * @layer components/shell
 */
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import { Header } from './Header.js'

describe('Header', () => {
  // scenario: the brand name and mark render.
  it('renders the brand name', () => {
    render(<Header />)
    expect(screen.getByText('nest-ai-tokens-example')).toBeInTheDocument()
  })

  // scenario: the brand mark links back to the Overview route.
  it('links the brand mark to /overview', () => {
    render(<Header />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/overview')
  })

  // scenario: no rightSlot renders an empty (but present) right-hand region.
  it('renders an empty right slot when none is given', () => {
    const { container } = render(<Header />)
    const rightSlot = container.querySelector('.topbar__right')
    expect(rightSlot).toBeInTheDocument()
    expect(rightSlot?.textContent).toBe('')
  })

  // scenario: a supplied rightSlot renders inside the topbar.
  it('renders the supplied rightSlot content', () => {
    render(<Header rightSlot={<span>identity switcher</span>} />)
    expect(screen.getByText('identity switcher')).toBeInTheDocument()
  })
})
