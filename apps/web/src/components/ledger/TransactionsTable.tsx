/**
 * @fileoverview The Ledger's transactions table: date, status badge,
 * model, signed/colored amount, and a short id, plus limit/offset
 * pagination. Row clicks open the row inspector.
 *
 * @layer components/ledger
 */
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

  const page = Math.floor(offset / LEDGER_PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE))

  return (
    <div>
      <table className="table">
        <thead>
          <tr>
            <th>date</th>
            <th>status</th>
            <th>model</th>
            <th>amount</th>
            <th>id</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} onClick={() => onSelect(item.id)} style={{ cursor: 'pointer' }}>
              <td>{new Date(item.occurredAt).toLocaleString()}</td>
              <td>
                <span className="chip">{item.status}</span>
              </td>
              <td>{item.model}</td>
              <td style={{ color: isCredit(item.status) ? 'var(--green)' : 'var(--red)' }}>
                {isCredit(item.status) ? '+' : '-'}
                {formatMoney(item.billedCostNanoUsd)}
              </td>
              <td title={item.id}>{shortId(item.id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 12,
        }}
      >
        <span className="card__desc">
          Page {page} of {pageCount} ({total} total)
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            disabled={offset === 0}
            onClick={() => onOffsetChange(Math.max(0, offset - LEDGER_PAGE_SIZE))}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            disabled={offset + LEDGER_PAGE_SIZE >= total}
            onClick={() => onOffsetChange(offset + LEDGER_PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
