/**
 * @fileoverview A multi-select toggle over the ledger's lifecycle
 * statuses: doubles as the debit (`posted`) / credit (`reversed`) view
 * switch (see the phase Reconciliation note).
 *
 * @layer components/ledger
 */
import type { UsageStatus } from '@bymax-one/nest-ai-tokens/shared'

import { USAGE_STATUSES } from './ledger-constants'

/** StatusChips props. */
export interface StatusChipsProps {
  /** The currently-selected statuses (empty means "the api's own default"). */
  readonly value: readonly UsageStatus[]
  /** Called with the full new selection after a toggle. */
  readonly onChange: (statuses: readonly UsageStatus[]) => void
}

/** A row of toggleable status chips. */
export function StatusChips({ value, onChange }: StatusChipsProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Status">
      {USAGE_STATUSES.map((status) => {
        const active = value.includes(status)
        return (
          <button
            key={status}
            type="button"
            className={`chip chip--button${active ? ' role-pill' : ''}`}
            aria-pressed={active}
            onClick={() =>
              onChange(active ? value.filter((entry) => entry !== status) : [...value, status])
            }
          >
            {status}
          </button>
        )
      })}
    </div>
  )
}
