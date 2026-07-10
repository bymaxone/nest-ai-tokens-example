/**
 * @fileoverview Unit tests for the standard page scaffold.
 *
 * @layer components/shell
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PageScaffold } from './PageScaffold.js'

describe('PageScaffold', () => {
  // scenario: title, description, and children all render.
  it('renders the title, description, and children', () => {
    render(
      <PageScaffold title="Ledger" description="The transaction ledger.">
        <p>content</p>
      </PageScaffold>,
    )
    expect(screen.getByRole('heading', { name: 'Ledger' })).toBeInTheDocument()
    expect(screen.getByText('The transaction ledger.')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  // scenario: no actions prop renders no actions region.
  it('renders no actions region when none is given', () => {
    const { container } = render(
      <PageScaffold title="Ledger" description="desc">
        <p>content</p>
      </PageScaffold>,
    )
    expect(container.querySelectorAll('.page-header > div > div')).toHaveLength(0)
  })

  // scenario: a supplied actions node renders beside the title.
  it('renders the supplied actions node', () => {
    render(
      <PageScaffold
        title="Ledger"
        description="desc"
        actions={<button type="button">Refund</button>}
      >
        <p>content</p>
      </PageScaffold>,
    )
    expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument()
  })
})
