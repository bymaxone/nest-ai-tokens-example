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
import type { ApiMutationState } from '@/lib/use-api-mutation'
import { useApiMutation } from '@/lib/use-api-mutation'

/** Hard cap on drain iterations, in case the balance never runs out. */
const MAX_DRAIN_CALLS = 50

/**
 * The lab prompt every call sends. `LabRunBody.prompt` is optional on the
 * wire, but the api's mock chat completion always echoes it as message
 * content with no default; omitting it crashes the provider on the
 * `content: undefined` case. Always supplying a prompt is the defensive,
 * web-side workaround for that api-side edge case (the fix belongs in
 * `apps/api`, out of this phase's scope).
 */
const LAB_PROMPT = 'Quota Lab demo call.'

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

/** A lab action button: idle/pending label, wired to a mutation's `run`. */
function LabActionButton<T>(props: {
  readonly ghost?: boolean
  readonly mutationState: ApiMutationState<T>
  readonly idleLabel: string
  readonly pendingLabel: string
  readonly onRun: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`btn ${props.ghost === true ? 'btn--ghost' : 'btn--outline'} btn--sm`}
      disabled={props.mutationState.status === 'pending'}
      onClick={props.onRun}
    >
      {props.mutationState.status === 'pending' ? props.pendingLabel : props.idleLabel}
    </button>
  )
}

/** A mutation's success/error outcome, rendered as a success toast or the canonical envelope. */
function MutationOutcome<T>(props: {
  readonly mutationState: ApiMutationState<T>
  readonly renderSuccess: (data: T) => React.ReactNode
}): React.JSX.Element | null {
  if (props.mutationState.status === 'success') {
    return (
      <div className="toast toast--success" style={{ maxWidth: 'none', marginTop: 10 }}>
        {props.renderSuccess(props.mutationState.data)}
      </div>
    )
  }
  if (props.mutationState.status === 'error') {
    return <ErrorBanner error={props.mutationState.error} />
  }
  return null
}

/** The drain shortcut's outcome: how many calls it took and whether it hit the quota wall. */
function DrainOutcome(props: {
  readonly outcome: ApiError
  readonly calls: number
}): React.JSX.Element {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="card__desc">
        Drained after {props.calls} call(s):{' '}
        {isCode(props.outcome, 'AI_TOKENS_INSUFFICIENT_CREDITS')
          ? 'hit the quota wall as expected.'
          : 'stopped on an unexpected error.'}
      </div>
      <ErrorBanner error={props.outcome} />
    </div>
  )
}

/** The Quota Lab's estimator buttons and drain/top-up shortcuts. */
export function LabRunner({ onBalanceChanged }: LabRunnerProps): React.JSX.Element {
  const constant = useApiMutation(() => api.runLabConstant({ prompt: LAB_PROMPT }))
  const modelBased = useApiMutation(() =>
    api.runLabModelBased({ model: 'mock-chat-pro', prompt: LAB_PROMPT }),
  )
  const topUp = useApiMutation(() =>
    api.credit({ amountNanoUsd: TOP_UP_AMOUNT_NANO_USD, type: 'purchase' }),
  )
  const [isDraining, setIsDraining] = useState(false)
  const [drainOutcome, setDrainOutcome] = useState<ApiError | undefined>(undefined)
  const [drainCalls, setDrainCalls] = useState(0)

  /** Repeats the constant lab call until it hits `AI_TOKENS_INSUFFICIENT_CREDITS` or the cap. */
  async function drain(): Promise<void> {
    setIsDraining(true)
    setDrainOutcome(undefined)
    let calls = 0
    for (; calls < MAX_DRAIN_CALLS; calls += 1) {
      try {
        await api.runLabConstant({ prompt: LAB_PROMPT })
      } catch (error) {
        setDrainOutcome(toApiError(error))
        break
      }
    }
    setDrainCalls(calls + 1)
    setIsDraining(false)
    onBalanceChanged()
  }

  /** Runs a mutation and, on success, tells the parent the balance may have changed. */
  function runAndReport<T>(run: () => Promise<T | undefined>): void {
    void run().then((result) => {
      if (result !== undefined) onBalanceChanged()
    })
  }

  return (
    <div className="card">
      <div className="card__title">Estimator lab</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <LabActionButton
          mutationState={constant.state}
          idleLabel="Run constant estimate"
          pendingLabel="Running…"
          onRun={() => runAndReport(constant.run)}
        />
        <LabActionButton
          mutationState={modelBased.state}
          idleLabel="Run model-based estimate"
          pendingLabel="Running…"
          onRun={() => runAndReport(modelBased.run)}
        />
        <LabActionButton
          ghost
          mutationState={{ status: isDraining ? 'pending' : 'idle' }}
          idleLabel="Drain balance"
          pendingLabel="Draining…"
          onRun={() => void drain()}
        />
        <LabActionButton
          ghost
          mutationState={topUp.state}
          idleLabel="Top up $10"
          pendingLabel="Crediting…"
          onRun={() => runAndReport(topUp.run)}
        />
      </div>

      <MutationOutcome
        mutationState={constant.state}
        renderSuccess={(data) => `Constant estimate settled: ${data.usage.total_tokens} tokens.`}
      />
      <MutationOutcome
        mutationState={modelBased.state}
        renderSuccess={(data) =>
          `Model-based estimate settled: ${data.totalTokens} tokens, billed ${data.billedNanoUsd} nano-USD.`
        }
      />
      <MutationOutcome
        mutationState={topUp.state}
        renderSuccess={(data) => `Credited $10. New balance: ${data.balance.formatted}.`}
      />

      {drainOutcome !== undefined && <DrainOutcome outcome={drainOutcome} calls={drainCalls} />}
    </div>
  )
}
