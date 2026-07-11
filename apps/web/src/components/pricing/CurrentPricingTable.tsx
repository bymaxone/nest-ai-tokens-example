/**
 * @fileoverview The current-pricing table: every open price window
 * (`GET /pricing`), input/output USD per 1M tokens, and a "History"
 * action that selects the row for the timeline below.
 *
 * @layer components/pricing
 */
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>model</TableHead>
          <TableHead>operation</TableHead>
          <TableHead>tier</TableHead>
          <TableHead>input / 1M</TableHead>
          <TableHead>output / 1M</TableHead>
          <TableHead>effective from</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.model}</TableCell>
            <TableCell>{row.operation}</TableCell>
            <TableCell>{row.serviceTier}</TableCell>
            <TableCell>{formatMoney(row.inputNanoUsdPerMillion)}</TableCell>
            <TableCell>{formatMoney(row.outputNanoUsdPerMillion)}</TableCell>
            <TableCell>{new Date(row.effectiveFrom).toLocaleDateString()}</TableCell>
            <TableCell>
              <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(row)}>
                History
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
