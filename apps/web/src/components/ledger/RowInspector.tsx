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
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="chip">{state.data.status}</span>
              <span className="chip mono">{state.data.model}</span>
              {state.data.isSystemCost && <span className="badge">system cost</span>}
            </div>

            {state.data.reversesRecordId !== undefined && (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => onNavigate(state.data.reversesRecordId!)}
              >
                View refunded transaction
              </button>
            )}
            {state.data.reversedByRecordId !== undefined && (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => onNavigate(state.data.reversedByRecordId!)}
              >
                View refund
              </button>
            )}

            <pre
              className="mono"
              style={{ fontSize: 11, whiteSpace: 'pre-wrap', overflow: 'auto' }}
            >
              {JSON.stringify(state.data, null, 2)}
            </pre>

            <RefundButton
              row={state.data}
              mutationState={refund.state}
              onConfirm={() =>
                void refund.run({ transactionId: state.data.id }).then((result) => {
                  if (result !== undefined) {
                    refetch()
                    onRefunded()
                  }
                })
              }
            />
          </>
        )}
      </div>
    </div>
  )
}
