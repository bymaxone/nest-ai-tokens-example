/**
 * @fileoverview Unit tests for the shared command result panel.
 *
 * @layer components/playground
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { WorkspaceUsageView } from '@/lib/api-types'

import { ResultPanel } from './ResultPanel.js'

const USAGE: WorkspaceUsageView = {
  transactionId: 'txn-42',
  model: 'mock-chat-pro',
  tokensUsed: { input: 10, output: 20, total: 30 },
  cost: { rawNanoUsd: '1000', billedNanoUsd: '1000', formatted: '$0.000001' },
}

describe('ResultPanel', () => {
  // scenario: content, token split, and cost render together.
  it('renders content, token split, and cost', () => {
    render(<ResultPanel content="HELLO" usage={USAGE} />)
    expect(screen.getByText('HELLO')).toBeInTheDocument()
    expect(screen.getByText('tokens: 10 in / 20 out / 30 total')).toBeInTheDocument()
    expect(screen.getByText('cost: $0.000001')).toBeInTheDocument()
  })

  // scenario: the Ledger deep link targets the transaction's focus query param.
  it('links into the Ledger with the transaction id as focus', () => {
    render(<ResultPanel content="HELLO" usage={USAGE} />)
    expect(screen.getByRole('link', { name: 'View in Ledger' })).toHaveAttribute(
      'href',
      '/ledger?focus=txn-42',
    )
  })
})
