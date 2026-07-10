/**
 * @fileoverview The Quota Lab's estimator buttons and drain/top-up
 * shortcuts. Two concrete lab endpoints exist: the declarative constant
 * estimate (`POST /quota/lab/constant`, flat 1000-token hold) and the
 * programmatic model-based estimate (`POST /quota/lab/model-based`, 5000
 * tokens for the flagship model, 1000 otherwise). "Resolver overrides" and
 * `@SkipQuota` are guard-configuration concepts, not separate demo
 * endpoints (see the phase Reconciliation note), so this component covers
 * the two real variants plus the drain/top-up shortcuts.
 *
 * @layer components/quota
 */
'use client'

import { useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import { ApiError, isCode } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'

/** Hard cap on drain iterations, in case the balance never runs out. */
const MAX_DRAIN_CALLS = 50

/** The fixed top-up amount the shortcut credits (10 USD, nano-USD). */
const TOP_UP_AMOUNT_NANO_USD = '10000000000'

/** LabRunner props. */
export interface LabRunnerProps {
  /** Called after any call that could change the balance. */
  readonly onBalanceChanged: () => void
}

/** Normalizes a caught rejection into an {@link ApiError}. */
function toApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError('client_error', 0, 'Something went wrong running the lab.')
}

/** The Quota Lab's estimator buttons and drain/top-up shortcuts. */
export function LabRunner({ onBalanceChanged }: LabRunnerProps): React.JSX.Element {
  const constant = useApiMutation(() => api.runLabConstant())
  const modelBased = useApiMutation(() => api.runLabModelBased({ model: 'mock-chat-pro' }))
  const topUp = useApiMutation(() =>
    api.credit({ amountNanoUsd: TOP_UP_AMOUNT_NANO_USD, type: 'purchase' }),
  )
  const [draining, setDraining] = useState(false)
  const [drainOutcome, setDrainOutcome] = useState<ApiError | undefined>(undefined)
  const [drainCalls, setDrainCalls] = useState(0)

  /** Repeats the constant lab call until it hits `402 quota.insufficient_balance` or the cap. */
  async function drain(): Promise<void> {
    setDraining(true)
    setDrainOutcome(undefined)
    let calls = 0
    for (; calls < MAX_DRAIN_CALLS; calls += 1) {
      try {
        await api.runLabConstant()
      } catch (error) {
        setDrainOutcome(toApiError(error))
        break
      }
    }
    setDrainCalls(calls + 1)
    setDraining(false)
    onBalanceChanged()
  }

  return (
    <div className="card">
      <div className="card__title">Estimator lab</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          disabled={constant.state.status === 'pending'}
          onClick={() =>
            void constant.run().then((result) => {
              if (result !== undefined) onBalanceChanged()
            })
          }
        >
          {constant.state.status === 'pending' ? 'Running…' : 'Run constant estimate'}
        </button>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          disabled={modelBased.state.status === 'pending'}
          onClick={() =>
            void modelBased.run().then((result) => {
              if (result !== undefined) onBalanceChanged()
            })
          }
        >
          {modelBased.state.status === 'pending' ? 'Running…' : 'Run model-based estimate'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={draining}
          onClick={() => void drain()}
        >
          {draining ? 'Draining…' : 'Drain balance'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={topUp.state.status === 'pending'}
          onClick={() =>
            void topUp.run().then((result) => {
              if (result !== undefined) onBalanceChanged()
            })
          }
        >
          {topUp.state.status === 'pending' ? 'Crediting…' : 'Top up $10'}
        </button>
      </div>

      {constant.state.status === 'success' && (
        <div className="toast toast--success" style={{ maxWidth: 'none', marginTop: 10 }}>
          Constant estimate settled: {constant.state.data.usage.total_tokens} tokens.
        </div>
      )}
      {constant.state.status === 'error' && <ErrorBanner error={constant.state.error} />}

      {modelBased.state.status === 'success' && (
        <div className="toast toast--success" style={{ maxWidth: 'none', marginTop: 10 }}>
          Model-based estimate settled: {modelBased.state.data.totalTokens} tokens, billed{' '}
          {modelBased.state.data.billedNanoUsd} nano-USD.
        </div>
      )}
      {modelBased.state.status === 'error' && <ErrorBanner error={modelBased.state.error} />}

      {topUp.state.status === 'success' && (
        <div className="toast toast--success" style={{ maxWidth: 'none', marginTop: 10 }}>
          Credited $10. New balance: {topUp.state.data.balance.formatted}.
        </div>
      )}
      {topUp.state.status === 'error' && <ErrorBanner error={topUp.state.error} />}

      {drainOutcome !== undefined && (
        <div style={{ marginTop: 10 }}>
          <div className="card__desc">
            Drained after {drainCalls} call(s):{' '}
            {isCode(drainOutcome, 'AI_TOKENS_INSUFFICIENT_CREDITS')
              ? 'hit the quota wall as expected.'
              : 'stopped on an unexpected error.'}
          </div>
          <ErrorBanner error={drainOutcome} />
        </div>
      )}
    </div>
  )
}
