/**
 * @fileoverview Unit test for the Tenants page's boundary callouts.
 *
 * @layer components/tenants
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BoundaryCallouts } from './BoundaryCallouts.js'

describe('BoundaryCallouts', () => {
  // scenario: both the shared-pricing and the required-mode callouts render.
  it('renders the shared-pricing and required-mode callouts', () => {
    render(<BoundaryCallouts />)
    expect(screen.getByText(/Pricing is intentionally shared across tenants/)).toBeInTheDocument()
    expect(screen.getByText(/Default tenancy mode is/)).toBeInTheDocument()
  })
})
