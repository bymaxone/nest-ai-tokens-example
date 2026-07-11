/**
 * @fileoverview Unit tests for the Ledger page content: loading, error,
 * the ready table, filter wiring (status/operation/date re-query),
 * pagination, the `?focus=` deep link opening the inspector, and the
 * top-up dialog.
 *
 * @layer components/ledger
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { usageRecordFixture } from '@/test/fixtures'

const replace = vi.fn()
let focusParam: string | null = null

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/ledger',
  useSearchParams: () => ({ get: (key: string) => (key === 'focus' ? focusParam : null) }),
}))

vi.mock('@/lib/api', () => ({
  api: {
    listTransactions: vi.fn(),
    getTransaction: vi.fn(),
    refund: vi.fn(),
    credit: vi.fn(),
  },
}))

import { api } from '@/lib/api'

import { LedgerPageContent } from './LedgerPageContent.js'

const EMPTY_PAGE = { items: [], total: 0, limit: 20, offset: 0 }

describe('LedgerPageContent', () => {
  // scenario: the loading state shows a status skeleton.
  it('renders a loading skeleton', () => {
    focusParam = null
    vi.mocked(api.listTransactions).mockReturnValue(new Promise(() => {}))
    render(<LedgerPageContent />)
    expect(screen.getByRole('status', { name: 'Loading transactions' })).toBeInTheDocument()
  })

  // scenario: the ready state renders the table with the fetched rows.
  it('renders the table once transactions load', async () => {
    focusParam = null
    vi.mocked(api.listTransactions).mockResolvedValue({
      items: [usageRecordFixture({ id: 'txn-1' })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    render(<LedgerPageContent />)
    await waitFor(() => expect(screen.getByText('mock-chat-standard')).toBeInTheDocument())
    expect(api.listTransactions).toHaveBeenCalledWith({ limit: 20, offset: 0 })
  })

  // scenario: toggling a status chip re-queries with the status filter.
  it('re-queries when a status chip is toggled', async () => {
    const user = userEvent.setup()
    focusParam = null
    vi.mocked(api.listTransactions).mockResolvedValue(EMPTY_PAGE)
    render(<LedgerPageContent />)
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith({ limit: 20, offset: 0 }))

    await user.click(screen.getByRole('button', { name: 'posted' }))
    await waitFor(() =>
      expect(api.listTransactions).toHaveBeenCalledWith({
        status: ['posted'],
        limit: 20,
        offset: 0,
      }),
    )
  })

  // scenario: picking an operation re-queries with the operation filter.
  it('re-queries when an operation is picked', async () => {
    const user = userEvent.setup()
    focusParam = null
    vi.mocked(api.listTransactions).mockResolvedValue(EMPTY_PAGE)
    render(<LedgerPageContent />)
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith({ limit: 20, offset: 0 }))

    await user.selectOptions(screen.getByLabelText('Operation'), 'embeddings')
    await waitFor(() =>
      expect(api.listTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'embeddings' }),
      ),
    )
  })

  // scenario: setting the From/To dates re-queries with the date window.
  it('re-queries when the date range is set', async () => {
    const user = userEvent.setup()
    focusParam = null
    vi.mocked(api.listTransactions).mockResolvedValue(EMPTY_PAGE)
    render(<LedgerPageContent />)
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith({ limit: 20, offset: 0 }))

    await user.type(screen.getByLabelText('From'), '2026-06-01')
    await user.type(screen.getByLabelText('To'), '2026-07-01')
    await waitFor(() =>
      expect(api.listTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ from: '2026-06-01', to: '2026-07-01' }),
      ),
    )
  })

  // scenario: a rejection renders the error banner.
  it('renders an error banner on a rejection', async () => {
    focusParam = null
    const { ApiError } = await import('@/lib/api-client')
    vi.mocked(api.listTransactions).mockRejectedValue(new ApiError('unknown_error', 500, 'oops'))
    render(<LedgerPageContent />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('oops'))
  })

  // scenario: selecting a row deep-links it via router.replace.
  it('deep-links a selected row via router.replace', async () => {
    const user = userEvent.setup()
    focusParam = null
    replace.mockClear()
    vi.mocked(api.listTransactions).mockResolvedValue({
      items: [usageRecordFixture({ id: 'txn-1' })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    render(<LedgerPageContent />)
    await waitFor(() => expect(screen.getByText('mock-chat-standard')).toBeInTheDocument())
    await user.click(screen.getByText('mock-chat-standard'))
    expect(replace).toHaveBeenCalledWith('/ledger?focus=txn-1')
  })

  // scenario: a ?focus= param opens the row inspector on mount.
  it('opens the inspector for a ?focus= deep link', async () => {
    focusParam = 'txn-1'
    vi.mocked(api.listTransactions).mockResolvedValue(EMPTY_PAGE)
    vi.mocked(api.getTransaction).mockResolvedValue(usageRecordFixture({ id: 'txn-1' }))
    render(<LedgerPageContent />)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    focusParam = null
  })

  // scenario: closing the inspector clears the deep link via router.replace.
  it('clears the deep link when the inspector closes', async () => {
    const user = userEvent.setup()
    focusParam = 'txn-1'
    replace.mockClear()
    vi.mocked(api.listTransactions).mockResolvedValue(EMPTY_PAGE)
    vi.mocked(api.getTransaction).mockResolvedValue(usageRecordFixture({ id: 'txn-1' }))
    render(<LedgerPageContent />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(replace).toHaveBeenCalledWith('/ledger')
    focusParam = null
  })

  // scenario: canceling the top-up dialog closes it without crediting.
  it('closes the top-up dialog on cancel', async () => {
    const user = userEvent.setup()
    focusParam = null
    vi.mocked(api.listTransactions).mockResolvedValue(EMPTY_PAGE)
    render(<LedgerPageContent />)
    await waitFor(() =>
      expect(screen.getByText('No transactions match these filters')).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'Top up' }))
    const dialog = screen.getByRole('dialog', { name: 'Top up balance' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Top up balance' })).not.toBeInTheDocument()
    expect(api.credit).not.toHaveBeenCalled()
  })

  // scenario: the Top up button opens the dialog, and a successful credit closes it and refetches.
  it('opens the top-up dialog and refetches after a credit', async () => {
    const user = userEvent.setup()
    focusParam = null
    vi.mocked(api.listTransactions).mockResolvedValue(EMPTY_PAGE)
    vi.mocked(api.credit).mockResolvedValue({
      entryId: 'entry-1',
      type: 'purchase',
      amountNanoUsd: '10000000000',
      balance: { nanoUsd: '10000000000', credits: 10, formatted: '$10.000000' },
    })
    render(<LedgerPageContent />)
    await waitFor(() =>
      expect(screen.getByText('No transactions match these filters')).toBeInTheDocument(),
    )
    const callsBefore = vi.mocked(api.listTransactions).mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Top up' }))
    const dialog = screen.getByRole('dialog', { name: 'Top up balance' })

    await user.click(within(dialog).getByRole('button', { name: 'Top up' }))
    await waitFor(() => expect(api.credit).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Top up balance' })).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledTimes(callsBefore + 1))
  })
})
