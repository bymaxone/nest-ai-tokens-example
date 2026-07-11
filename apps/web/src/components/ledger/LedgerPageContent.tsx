/**
 * @fileoverview The Ledger page's interactive content: filters, the
 * paginated transactions table, the `?focus=` deep-linked row inspector,
 * and the top-up dialog. Kept out of `app/**` (route shells are thin
 * composition only, per the coverage config) so it is unit tested
 * directly.
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

import { ALL_OPERATIONS, LedgerFilters } from './LedgerFilters'
import { LEDGER_PAGE_SIZE } from './ledger-constants'
import { RowInspector } from './RowInspector'
import { TopUpDialog } from './TopUpDialog'
import { TransactionsTable } from './TransactionsTable'

/** The Ledger's filter state, each setter resetting pagination back to the first page. */
function useLedgerFilterState(): {
  readonly statuses: readonly UsageStatus[]
  readonly setStatuses: (value: readonly UsageStatus[]) => void
  readonly operation: AiOperation | typeof ALL_OPERATIONS
  readonly setOperation: (value: AiOperation | typeof ALL_OPERATIONS) => void
  readonly from: string
  readonly setFrom: (value: string) => void
  readonly to: string
  readonly setTo: (value: string) => void
  readonly offset: number
  readonly setOffset: (value: number) => void
} {
  const [statuses, setStatusesRaw] = useState<readonly UsageStatus[]>([])
  const [operation, setOperationRaw] = useState<AiOperation | typeof ALL_OPERATIONS>(ALL_OPERATIONS)
  const [from, setFromRaw] = useState('')
  const [to, setToRaw] = useState('')
  const [offset, setOffset] = useState(0)

  /** Applies a filter change and resets pagination back to the first page. */
  function withPageReset<T>(setter: (value: T) => void): (value: T) => void {
    return (value) => {
      setter(value)
      setOffset(0)
    }
  }

  return {
    statuses,
    setStatuses: withPageReset(setStatusesRaw),
    operation,
    setOperation: withPageReset(setOperationRaw),
    from,
    setFrom: withPageReset(setFromRaw),
    to,
    setTo: withPageReset(setToRaw),
    offset,
    setOffset,
  }
}

/** Deep-links the row inspector into the `?focus=` query param. */
function useFocusNavigation(): {
  readonly focusId: string | undefined
  readonly openInspector: (id: string) => void
  readonly closeInspector: () => void
} {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return {
    focusId: searchParams.get('focus') ?? undefined,
    openInspector: (id) => router.replace(`${pathname}?focus=${encodeURIComponent(id)}`),
    closeInspector: () => router.replace(pathname),
  }
}

/** The transactions table area: loading, error, or the ready table. */
function TransactionsSection(props: {
  readonly state: ReturnType<
    typeof useApiQuery<Awaited<ReturnType<typeof api.listTransactions>>>
  >['state']
  readonly offset: number
  readonly onOffsetChange: (offset: number) => void
  readonly onSelect: (id: string) => void
}): React.JSX.Element {
  if (props.state.status === 'loading') {
    return (
      <div role="status" aria-label="Loading transactions">
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    )
  }
  if (props.state.status === 'error') {
    return <ErrorBanner error={props.state.error} />
  }
  return (
    <TransactionsTable
      items={props.state.data.items}
      total={props.state.data.total}
      offset={props.offset}
      onOffsetChange={props.onOffsetChange}
      onSelect={props.onSelect}
    />
  )
}

/** The Ledger page's filters, table, inspector, and top-up dialog. */
export function LedgerPageContent(): React.JSX.Element {
  const filters = useLedgerFilterState()
  const { focusId, openInspector, closeInspector } = useFocusNavigation()
  const [isTopUpOpen, setIsTopUpOpen] = useState(false)

  const queryKey = JSON.stringify(filters)
  const { state, refetch } = useApiQuery(
    () =>
      api.listTransactions({
        ...(filters.statuses.length > 0 ? { status: [...filters.statuses] } : {}),
        ...(filters.operation !== ALL_OPERATIONS ? { operation: filters.operation } : {}),
        ...(filters.from.length > 0 ? { from: filters.from } : {}),
        ...(filters.to.length > 0 ? { to: filters.to } : {}),
        limit: LEDGER_PAGE_SIZE,
        offset: filters.offset,
      }),
    queryKey,
  )

  return (
    <>
      <LedgerFilters
        statuses={filters.statuses}
        onStatusesChange={filters.setStatuses}
        operation={filters.operation}
        onOperationChange={filters.setOperation}
        from={filters.from}
        onFromChange={filters.setFrom}
        to={filters.to}
        onToChange={filters.setTo}
        onTopUp={() => setIsTopUpOpen(true)}
      />

      <TransactionsSection
        state={state}
        offset={filters.offset}
        onOffsetChange={filters.setOffset}
        onSelect={openInspector}
      />

      {focusId !== undefined && (
        <RowInspector
          transactionId={focusId}
          onClose={closeInspector}
          onNavigate={openInspector}
          onRefunded={refetch}
        />
      )}

      {isTopUpOpen && (
        <TopUpDialog
          onClose={() => setIsTopUpOpen(false)}
          onCredited={() => {
            setIsTopUpOpen(false)
            refetch()
          }}
        />
      )}
    </>
  )
}
