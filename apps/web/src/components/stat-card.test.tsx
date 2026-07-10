/**
 * @fileoverview Unit tests for the StatCard presentational states.
 *
 * @layer components
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatCard } from './stat-card.js'

describe('StatCard', () => {
  // scenario: the loading state renders a labeled status skeleton.
  it('renders a loading skeleton', () => {
    render(<StatCard label="Tokens" state={{ status: 'loading' }} />)
    expect(screen.getByRole('status', { name: 'Loading Tokens' })).toBeInTheDocument()
  })

  // scenario: the error state renders the message with an alert role.
  it('renders an error message', () => {
    render(<StatCard label="Tokens" state={{ status: 'error', message: 'nope' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('nope')
  })

  // scenario: the ready state renders the value with no delta.
  it('renders the value with no delta', () => {
    render(<StatCard label="Tokens" state={{ status: 'ready', value: '1,234' }} />)
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  // scenario: the ready state renders an "up" delta with its tone class.
  it('renders an up delta', () => {
    render(
      <StatCard
        label="Cost"
        state={{ status: 'ready', value: '$1.00', delta: { text: '▲ 3%', tone: 'up' } }}
      />,
    )
    expect(screen.getByText('▲ 3%')).toHaveClass('stat__delta--up')
  })

  // scenario: the ready state renders an "ok" delta with its tone class.
  it('renders an ok delta', () => {
    render(
      <StatCard
        label="Cost"
        state={{ status: 'ready', value: '$1.00', delta: { text: 'stable', tone: 'ok' } }}
      />,
    )
    expect(screen.getByText('stable')).toHaveClass('stat__delta--ok')
  })
})
