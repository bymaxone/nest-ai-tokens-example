/**
 * @fileoverview Unit tests for the transactions table: empty state, row
 * rendering (debit vs credit coloring), row selection, and pagination.
 *
 * @layer components/ledger
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { usageRecordFixture } from '@/test/fixtures'

import { TransactionsTable } from './TransactionsTable.js'

describe('TransactionsTable', () => {
  // scenario: no rows renders an action-oriented empty state.
  it('renders an empty state with no rows', () => {
    render(
      <TransactionsTable
        items={[]}
        total={0}
        offset={0}
        onOffsetChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('No transactions match these filters')).toBeInTheDocument()
  })

  // scenario: a posted row renders a debit-colored, minus-prefixed amount.
  it('renders a posted row as a debit', () => {
    render(
      <TransactionsTable
        items={[usageRecordFixture({ status: 'posted', billedCostNanoUsd: '1000000' })]}
        total={1}
        offset={0}
        onOffsetChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('-$0.001000')).toBeInTheDocument()
  })

  // scenario: a reversed row renders a credit-colored, plus-prefixed amount.
  it('renders a reversed row as a credit', () => {
    render(
      <TransactionsTable
        items={[usageRecordFixture({ status: 'reversed', billedCostNanoUsd: '1000000' })]}
        total={1}
        offset={0}
        onOffsetChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('+$0.001000')).toBeInTheDocument()
  })

  // scenario: clicking a row calls onSelect with its id.
  it('calls onSelect when a row is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <TransactionsTable
        items={[usageRecordFixture({ id: 'txn-77' })]}
        total={1}
        offset={0}
        onOffsetChange={vi.fn()}
        onSelect={onSelect}
      />,
    )
    await user.click(screen.getByText('mock-chat-standard'))
    expect(onSelect).toHaveBeenCalledWith('txn-77')
  })

  // scenario: rows are keyboard-operable; Enter and Space both select, other keys do not.
  it('calls onSelect on Enter and Space but not on other keys', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <TransactionsTable
        items={[usageRecordFixture({ id: 'txn-88' })]}
        total={1}
        offset={0}
        onOffsetChange={vi.fn()}
        onSelect={onSelect}
      />,
    )
    const row = screen.getByRole('row', { name: /inspect transaction/i })
    row.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('txn-88')
    await user.keyboard(' ')
    expect(onSelect).toHaveBeenCalledTimes(2)
    await user.keyboard('{ArrowDown}')
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  // scenario: Previous is disabled on the first page; Next advances the offset.
  it('disables Previous on the first page and advances Next', async () => {
    const user = userEvent.setup()
    const onOffsetChange = vi.fn()
    render(
      <TransactionsTable
        items={Array.from({ length: 20 }, (_unused, index) =>
          usageRecordFixture({ id: `txn-${index}` }),
        )}
        total={45}
        offset={0}
        onOffsetChange={onOffsetChange}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(onOffsetChange).toHaveBeenCalledWith(20)
    expect(screen.getByText('Page 1 of 3 (45 total)')).toBeInTheDocument()
  })

  // scenario: Next is disabled on the last page; Previous steps back.
  it('disables Next on the last page and steps Previous back', async () => {
    const user = userEvent.setup()
    const onOffsetChange = vi.fn()
    render(
      <TransactionsTable
        items={[usageRecordFixture()]}
        total={45}
        offset={40}
        onOffsetChange={onOffsetChange}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(onOffsetChange).toHaveBeenCalledWith(20)
  })

  // scenario: a long id is shortened in the table but the full id is kept as a title attribute.
  it('shortens a long id and keeps the full id as a title', () => {
    render(
      <TransactionsTable
        items={[usageRecordFixture({ id: 'a-very-long-transaction-identifier' })]}
        total={1}
        offset={0}
        onOffsetChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    const cell = screen.getByTitle('a-very-long-transaction-identifier')
    expect(cell).toHaveTextContent('a-very-l…')
  })
})
