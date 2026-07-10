/**
 * @fileoverview The row inspector's refund action: only offered on a
 * `posted` row (the api rejects any other status with a canonical 409),
 * requiring a two-step confirm before the destructive call fires.
 *
 * @layer components/ledger
 */
import { useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import type { ApiMutationState } from '@/lib/use-api-mutation'
import type { RefundResponse, UsageRecordView } from '@/lib/api-types'

/** RefundButton props. */
export interface RefundButtonProps {
  /** The row the button acts on. */
  readonly row: UsageRecordView
  /** The in-flight refund mutation's state. */
  readonly mutationState: ApiMutationState<RefundResponse>
  /** Fires the refund after the confirm step. */
  readonly onConfirm: () => void
}

/** A two-step confirm around the destructive refund call. */
export function RefundButton({
  row,
  mutationState,
  onConfirm,
}: RefundButtonProps): React.JSX.Element | null {
  const [confirming, setConfirming] = useState(false)

  if (row.status !== 'posted') return null

  if (mutationState.status === 'success') {
    return (
      <div className="toast toast--success" style={{ maxWidth: 'none' }}>
        Refunded: reversal {mutationState.data.reversalTransactionId}.
      </div>
    )
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="card__desc">Refund this transaction?</span>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={mutationState.status === 'pending'}
          onClick={onConfirm}
        >
          {mutationState.status === 'pending' ? 'Refunding…' : 'Confirm refund'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div>
      {mutationState.status === 'error' && <ErrorBanner error={mutationState.error} />}
      <button
        type="button"
        className="btn btn--outline btn--sm"
        onClick={() => setConfirming(true)}
      >
        Refund
      </button>
    </div>
  )
}
