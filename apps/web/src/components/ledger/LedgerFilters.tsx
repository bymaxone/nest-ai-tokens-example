/**
 * @fileoverview The Ledger page's filter card: the status chips
 * (doubling as the debit/credit toggle), the operation select, the date
 * range, and the Top-up trigger button.
 *
 * @layer components/ledger
 */
import type { AiOperation, UsageStatus } from '@bymax-one/nest-ai-tokens/shared'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import { OPERATIONS } from './ledger-constants'
import { StatusChips } from './StatusChips'

/** The empty-string sentinel the operation `<select>` uses for "all operations". */
export const ALL_OPERATIONS = ''

/** LedgerFilters props. */
export interface LedgerFiltersProps {
  readonly statuses: readonly UsageStatus[]
  readonly onStatusesChange: (statuses: readonly UsageStatus[]) => void
  readonly operation: AiOperation | typeof ALL_OPERATIONS
  readonly onOperationChange: (operation: AiOperation | typeof ALL_OPERATIONS) => void
  readonly from: string
  readonly onFromChange: (value: string) => void
  readonly to: string
  readonly onToChange: (value: string) => void
  readonly onTopUp: () => void
}

/** The Ledger page's filter card. */
export function LedgerFilters(props: LedgerFiltersProps): React.JSX.Element {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <StatusChips value={props.statuses} onChange={props.onStatusesChange} />
          <Button type="button" size="sm" onClick={props.onTopUp}>
            Top up
          </Button>
        </div>
        <div className="grid-2 mt-3">
          <div>
            <label className="label" htmlFor="ledger-operation">
              Operation
            </label>
            <select
              id="ledger-operation"
              className="input"
              value={props.operation}
              onChange={(event) =>
                props.onOperationChange(event.target.value as AiOperation | typeof ALL_OPERATIONS)
              }
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
                value={props.from}
                onChange={(event) => props.onFromChange(event.target.value)}
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
                value={props.to}
                onChange={(event) => props.onToChange(event.target.value)}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
