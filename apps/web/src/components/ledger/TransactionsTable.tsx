/**
 * @fileoverview The Ledger's transactions table: date, status badge,
 * model, signed/colored amount, and a short id, plus limit/offset
 * pagination. Row clicks open the row inspector.
 *
 * @layer components/ledger
 */
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { UsageRecordView } from '@/lib/api-types'
import { formatMoney } from '@/lib/money'

import { LEDGER_PAGE_SIZE } from './ledger-constants'

/** TransactionsTable props. */
export interface TransactionsTableProps {
  /** The current page's rows. */
  readonly items: readonly UsageRecordView[]
  /** The filter-wide row count. */
  readonly total: number
  /** The current page offset. */
  readonly offset: number
  /** Called with the new offset when a pagination control is used. */
  readonly onOffsetChange: (offset: number) => void
  /** Called with a row's id when it is clicked. */
  readonly onSelect: (id: string) => void
}

/** Whether a status counts as a credit (a reversal puts money back). */
function isCredit(status: UsageRecordView['status']): boolean {
  return status === 'reversed'
}

/** Shortens a ledger row id for the table's id column. */
function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id
}

/** One transaction row. */
function TransactionRow(props: {
  readonly item: UsageRecordView
  readonly onSelect: (id: string) => void
}): React.JSX.Element {
  const { item } = props
  // Rows are interactive, so they participate in the tab order and respond
  // to Enter/Space like a native control.
  function handleKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      props.onSelect(item.id)
    }
  }
  return (
    <TableRow
      onClick={() => props.onSelect(item.id)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label={`Inspect transaction ${shortId(item.id)}`}
      className="cursor-pointer"
    >
      <TableCell>{new Date(item.occurredAt).toLocaleString()}</TableCell>
      <TableCell>
        <Badge variant="outline">{item.status}</Badge>
      </TableCell>
      <TableCell>{item.model}</TableCell>
      <TableCell style={{ color: isCredit(item.status) ? 'var(--green)' : 'var(--red)' }}>
        {isCredit(item.status) ? '+' : '-'}
        {formatMoney(item.billedCostNanoUsd)}
      </TableCell>
      <TableCell title={item.id}>{shortId(item.id)}</TableCell>
    </TableRow>
  )
}

/** The page-count summary plus the Previous/Next controls. */
function PaginationFooter(props: {
  readonly offset: number
  readonly total: number
  readonly onOffsetChange: (offset: number) => void
}): React.JSX.Element {
  const page = Math.floor(props.offset / LEDGER_PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(props.total / LEDGER_PAGE_SIZE))
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
      }}
    >
      <span className="text-[13px] text-muted-foreground">
        Page {page} of {pageCount} ({props.total} total)
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.offset === 0}
          onClick={() => props.onOffsetChange(Math.max(0, props.offset - LEDGER_PAGE_SIZE))}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.offset + LEDGER_PAGE_SIZE >= props.total}
          onClick={() => props.onOffsetChange(props.offset + LEDGER_PAGE_SIZE)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

/** The transactions table with limit/offset pagination. */
export function TransactionsTable({
  items,
  total,
  offset,
  onOffsetChange,
  onSelect,
}: TransactionsTableProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="empty__title">No transactions match these filters</div>
        <p>Run a command in the Playground, or widen the filters above.</p>
      </div>
    )
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>date</TableHead>
            <TableHead>status</TableHead>
            <TableHead>model</TableHead>
            <TableHead>amount</TableHead>
            <TableHead>id</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TransactionRow key={item.id} item={item} onSelect={onSelect} />
          ))}
        </TableBody>
      </Table>
      <PaginationFooter offset={offset} total={total} onOffsetChange={onOffsetChange} />
    </div>
  )
}
