/**
 * @fileoverview The current-pricing table: every open price window
 * (`GET /pricing`), input/output USD per 1M tokens, and a "History"
 * action that selects the row for the timeline below.
 *
 * @layer components/pricing
 */
import type { PriceRowView } from '@/lib/api-types'
import { formatMoney } from '@/lib/money'

/** CurrentPricingTable props. */
export interface CurrentPricingTableProps {
  /** The open price rows. */
  readonly items: readonly PriceRowView[]
  /** Called with a row when its "History" action is clicked. */
  readonly onSelect: (row: PriceRowView) => void
}

/** The current-pricing table. */
export function CurrentPricingTable({
  items,
  onSelect,
}: CurrentPricingTableProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="empty__title">No price rows yet</div>
        <p>Seed pricing runs on first boot; check the api's seed logs if this stays empty.</p>
      </div>
    )
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>model</th>
          <th>operation</th>
          <th>tier</th>
          <th>input / 1M</th>
          <th>output / 1M</th>
          <th>effective from</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((row) => (
          <tr key={row.id}>
            <td>{row.model}</td>
            <td>{row.operation}</td>
            <td>{row.serviceTier}</td>
            <td>{formatMoney(row.inputNanoUsdPerMillion)}</td>
            <td>{formatMoney(row.outputNanoUsdPerMillion)}</td>
            <td>{new Date(row.effectiveFrom).toLocaleDateString()}</td>
            <td>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => onSelect(row)}
              >
                History
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
