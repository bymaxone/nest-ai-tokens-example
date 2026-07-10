/**
 * @fileoverview The Ledger's top-up dialog: a USD amount and a credit
 * type, `POST /ledger/credits`. The USD amount is converted to the wire's
 * nano-USD digit string with the library's own `floatUsdToNanoUsd`
 * (shared subpath), never a hand-rolled parser (see the phase
 * Reconciliation note).
 *
 * @layer components/ledger
 */
'use client'

import { floatUsdToNanoUsd } from '@bymax-one/nest-ai-tokens/shared'
import { useId, useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import type { CreditBody } from '@/lib/api-types'
import { useApiMutation } from '@/lib/use-api-mutation'

/** The credit kinds the dialog offers. */
const CREDIT_TYPES: readonly CreditBody['type'][] = [
  'purchase',
  'monthly_allocation',
  'trial_allocation',
]

/** TopUpDialog props. */
export interface TopUpDialogProps {
  /** Closes the dialog. */
  readonly onClose: () => void
  /** Called after a successful top-up, so the header balance can refresh. */
  readonly onCredited: () => void
}

/** The top-up dialog: amount plus credit type, posted to the ledger. */
export function TopUpDialog({ onClose, onCredited }: TopUpDialogProps): React.JSX.Element {
  const [amount, setAmount] = useState('10')
  const [type, setType] = useState<CreditBody['type']>('purchase')
  const mutation = useApiMutation(api.credit.bind(api))
  const amountId = useId()
  const typeId = useId()

  return (
    <div className="dialog-overlay" role="dialog" aria-label="Top up balance" onClick={onClose}>
      <div className="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="card__title">Top up balance</div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const amountNanoUsd = floatUsdToNanoUsd(Number(amount)).toString()
            void mutation.run({ amountNanoUsd, type }).then((result) => {
              if (result !== undefined) onCredited()
            })
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div>
            <label className="label" htmlFor={amountId}>
              Amount (USD)
            </label>
            <input
              id={amountId}
              className="input"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor={typeId}>
              Credit type
            </label>
            <select
              id={typeId}
              className="input"
              value={type}
              onChange={(event) => setType(event.target.value as CreditBody['type'])}
            >
              {CREDIT_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              className="btn btn--primary btn--sm"
              disabled={mutation.state.status === 'pending'}
            >
              {mutation.state.status === 'pending' ? 'Crediting…' : 'Top up'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
        {mutation.state.status === 'error' && <ErrorBanner error={mutation.state.error} />}
        {mutation.state.status === 'success' && (
          <div className="toast toast--success" style={{ maxWidth: 'none' }}>
            Credited. New balance: {mutation.state.data.balance.formatted}.
          </div>
        )}
      </div>
    </div>
  )
}
