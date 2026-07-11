/**
 * @fileoverview The row inspector's refund action: only offered on a
 * `posted` row (the api rejects any other status with a canonical 409),
 * requiring a two-step confirm before the destructive call fires.
 *
 * @layer components/ledger
 */
import { useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { Button } from '@/components/ui/button'
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
  const [isConfirming, setIsConfirming] = useState(false)

  if (row.status !== 'posted') return null

  if (mutationState.status === 'success') {
    return (
      <div className="toast toast--success" style={{ maxWidth: 'none' }}>
        Refunded: reversal {mutationState.data.reversalTransactionId}.
      </div>
    )
  }

  if (isConfirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-muted-foreground">Refund this transaction?</span>
        <Button
          type="button"
          size="sm"
          disabled={mutationState.status === 'pending'}
          onClick={onConfirm}
        >
          {mutationState.status === 'pending' ? 'Refunding…' : 'Confirm refund'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsConfirming(false)}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div>
      {mutationState.status === 'error' && <ErrorBanner error={mutationState.error} />}
      <Button type="button" variant="outline" size="sm" onClick={() => setIsConfirming(true)}>
        Refund
      </Button>
    </div>
  )
}
