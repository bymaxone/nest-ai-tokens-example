/**
 * @fileoverview The Ledger's row inspector: fetches one transaction by id
 * and renders it as a drawer with the full JSON-safe row (tags,
 * extraUnits, systemCostCategory, cost snapshot; see the phase
 * Reconciliation note on why there is no separate "metadata" field), the
 * refund action (with a two-step confirm), and the reversal back-links.
 *
 * @layer components/ledger
 */
'use client'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import type { RefundResponse, UsageRecordView } from '@/lib/api-types'
import type { UseApiMutationResult } from '@/lib/use-api-mutation'
import { useApiMutation } from '@/lib/use-api-mutation'
import { useApiQuery } from '@/lib/use-api-query'

import { RefundButton } from './RefundButton'

/** RowInspector props. */
export interface RowInspectorProps {
  /** The transaction id to inspect. */
  readonly transactionId: string
  /** Closes the drawer. */
  readonly onClose: () => void
  /** Opens the inspector on a different transaction (a reversal back-link). */
  readonly onNavigate: (transactionId: string) => void
  /** Called after a successful refund, so the table can refresh. */
  readonly onRefunded: () => void
}

/** The loaded row's content: status chips, reversal back-links, the JSON viewer, and refund. */
function RowInspectorBody(props: {
  readonly data: UsageRecordView
  readonly onNavigate: (transactionId: string) => void
  readonly refund: UseApiMutationResult<[{ transactionId: string }], RefundResponse>
  readonly onRefunded: () => void
  readonly refetch: () => void
}): React.JSX.Element {
  const { data } = props
  // Extracted (rather than narrowed inline) so the value stays a plain
  // `string | undefined` local: TS narrowing on `data.<field>` does not
  // survive into the button's nested onClick closure below.
  const reversesId = data.reversesRecordId
  const reversedById = data.reversedByRecordId

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="chip">{data.status}</span>
        <span className="chip mono">{data.model}</span>
        {data.isSystemCost && <span className="badge">system cost</span>}
      </div>

      {reversesId !== undefined && (
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={() => props.onNavigate(reversesId)}
        >
          View refunded transaction
        </button>
      )}
      {reversedById !== undefined && (
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={() => props.onNavigate(reversedById)}
        >
          View refund
        </button>
      )}

      <pre className="mono" style={{ fontSize: 11, whiteSpace: 'pre-wrap', overflow: 'auto' }}>
        {JSON.stringify(data, null, 2)}
      </pre>

      <RefundButton
        row={data}
        mutationState={props.refund.state}
        onConfirm={() =>
          void props.refund.run({ transactionId: data.id }).then((result) => {
            if (result !== undefined) {
              props.refetch()
              props.onRefunded()
            }
          })
        }
      />
    </>
  )
}

/** The row inspector drawer. */
export function RowInspector({
  transactionId,
  onClose,
  onNavigate,
  onRefunded,
}: RowInspectorProps): React.JSX.Element {
  const { state, refetch } = useApiQuery(() => api.getTransaction(transactionId), transactionId)
  const refund = useApiMutation(api.refund.bind(api))

  return (
    <div className="overlay" role="dialog" aria-label="Transaction detail" onClick={onClose}>
      <div className="drawer" onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card__title">Transaction detail</div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>

        {state.status === 'loading' && (
          <div role="status" aria-label="Loading transaction">
            <div className="skeleton" style={{ height: 200 }} />
          </div>
        )}

        {state.status === 'error' && <ErrorBanner error={state.error} />}

        {state.status === 'ready' && (
          <RowInspectorBody
            data={state.data}
            onNavigate={onNavigate}
            refund={refund}
            onRefunded={onRefunded}
            refetch={refetch}
          />
        )}
      </div>
    </div>
  )
}
