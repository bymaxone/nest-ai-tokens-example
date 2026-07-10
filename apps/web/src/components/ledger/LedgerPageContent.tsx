/**
 * @fileoverview The Ledger page's interactive content: filters (status
 * chips doubling as the debit/credit toggle, operation select, date
 * range), the paginated transactions table, the `?focus=` deep-linked row
 * inspector, and the top-up dialog. Kept out of `app/**` (route shells
 * are thin composition only, per the coverage config) so it is unit
 * tested directly.
 *
 * @layer components/ledger
 */
'use client'

import type { AiOperation, UsageStatus } from '@bymax-one/nest-ai-tokens/shared'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import { useApiQuery } from '@/lib/use-api-query'

import { LEDGER_PAGE_SIZE, OPERATIONS } from './ledger-constants'
import { RowInspector } from './RowInspector'
import { StatusChips } from './StatusChips'
import { TopUpDialog } from './TopUpDialog'
import { TransactionsTable } from './TransactionsTable'

/** The empty-string sentinel the operation `<select>` uses for "all operations". */
const ALL_OPERATIONS = ''

/** The Ledger page's filters, table, inspector, and top-up dialog. */
export function LedgerPageContent(): React.JSX.Element {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus') ?? undefined

  const [statuses, setStatuses] = useState<readonly UsageStatus[]>([])
  const [operation, setOperation] = useState<AiOperation | typeof ALL_OPERATIONS>(ALL_OPERATIONS)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [offset, setOffset] = useState(0)
  const [showTopUp, setShowTopUp] = useState(false)

  const queryKey = JSON.stringify({ statuses, operation, from, to, offset })
  const { state, refetch } = useApiQuery(
    () =>
      api.listTransactions({
        ...(statuses.length > 0 ? { status: [...statuses] } : {}),
        ...(operation !== ALL_OPERATIONS ? { operation } : {}),
        ...(from.length > 0 ? { from } : {}),
        ...(to.length > 0 ? { to } : {}),
        limit: LEDGER_PAGE_SIZE,
        offset,
      }),
    queryKey,
  )

  /** Opens the inspector on `id`, deep-linking it into the URL. */
  function openInspector(id: string): void {
    router.replace(`${pathname}?focus=${encodeURIComponent(id)}`)
  }

  /** Closes the inspector, clearing the deep link. */
  function closeInspector(): void {
    router.replace(pathname)
  }

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <StatusChips
            value={statuses}
            onChange={(next) => {
              setStatuses(next)
              setOffset(0)
            }}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setShowTopUp(true)}
          >
            Top up
          </button>
        </div>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div>
            <label className="label" htmlFor="ledger-operation">
              Operation
            </label>
            <select
              id="ledger-operation"
              className="input"
              value={operation}
              onChange={(event) => {
                setOperation(event.target.value as AiOperation | typeof ALL_OPERATIONS)
                setOffset(0)
              }}
            >
              <option value={ALL_OPERATIONS}>All operations</option>
              {OPERATIONS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div className="grid-2">
            <div>
              <label className="label" htmlFor="ledger-from">
                From
              </label>
              <input
                id="ledger-from"
                className="input"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value)
                  setOffset(0)
                }}
              />
            </div>
            <div>
              <label className="label" htmlFor="ledger-to">
                To
              </label>
              <input
                id="ledger-to"
                className="input"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value)
                  setOffset(0)
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {state.status === 'loading' && (
        <div role="status" aria-label="Loading transactions">
          <div className="skeleton" style={{ height: 240 }} />
        </div>
      )}
      {state.status === 'error' && <ErrorBanner error={state.error} />}
      {state.status === 'ready' && (
        <TransactionsTable
          items={state.data.items}
          total={state.data.total}
          offset={offset}
          onOffsetChange={setOffset}
          onSelect={openInspector}
        />
      )}

      {focusId !== undefined && (
        <RowInspector
          transactionId={focusId}
          onClose={closeInspector}
          onNavigate={openInspector}
          onRefunded={refetch}
        />
      )}

      {showTopUp && (
        <TopUpDialog
          onClose={() => setShowTopUp(false)}
          onCredited={() => {
            setShowTopUp(false)
            refetch()
          }}
        />
      )}
    </>
  )
}
