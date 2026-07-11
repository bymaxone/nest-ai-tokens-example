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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { ApiError, isCode } from '@/lib/api-client'
import type { DrainResponse } from '@/lib/api-types'
import type { ApiMutationState } from '@/lib/use-api-mutation'
import { useApiMutation } from '@/lib/use-api-mutation'

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
    <Button
      type="button"
      variant={props.ghost === true ? 'ghost' : 'outline'}
      size="sm"
      disabled={props.mutationState.status === 'pending'}
      onClick={props.onRun}
    >
      {props.mutationState.status === 'pending' ? props.pendingLabel : props.idleLabel}
    </Button>
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

/**
 * The drain shortcut's outcome. The common path is an error: the drained
 * wallet rejected the post-drain hold with the canonical 402, rendered as the
 * envelope below a one-line verdict. A `residual` instead means the wall was
 * NOT reached — an overdraft floor covered the hold — reported as a warning.
 */
function DrainOutcome(props: {
  readonly error: ApiError | undefined
  readonly residual: DrainResponse | undefined
}): React.JSX.Element | null {
  if (props.error !== undefined) {
    return (
      <div style={{ marginTop: 10 }}>
        <div className="text-[13px] text-muted-foreground">
          {isCode(props.error, 'AI_TOKENS_INSUFFICIENT_CREDITS')
            ? 'Wallet drained — the next hold was rejected at the quota wall, as expected.'
            : 'Drain stopped on an unexpected error.'}
        </div>
        <ErrorBanner error={props.error} />
      </div>
    )
  }
  if (props.residual !== undefined) {
    return (
      <div className="toast toast--warning" style={{ maxWidth: 'none', marginTop: 10 }}>
        <div style={{ width: '100%' }}>
          Wallet drained to {props.residual.balanceFormatted}, but the hold was still allowed: an
          overdraft floor leaves headroom, so the wall was not reached.
        </div>
      </div>
    )
  }
  return null
}

/** The Quota Lab's estimator buttons and drain/top-up shortcuts. */
export function LabRunner({ onBalanceChanged }: LabRunnerProps): React.JSX.Element {
  // Prompt-less bodies are the natural button shape: the api's lab DTO
  // defaults the prompt server-side and answers deterministically.
  const constant = useApiMutation(() => api.runLabConstant())
  const modelBased = useApiMutation(() => api.runLabModelBased({ model: 'mock-chat-pro' }))
  const topUp = useApiMutation(() =>
    api.credit({ amountNanoUsd: TOP_UP_AMOUNT_NANO_USD, type: 'purchase' }),
  )
  const [isDraining, setIsDraining] = useState(false)
  const [drainError, setDrainError] = useState<ApiError | undefined>(undefined)
  const [drainResidual, setDrainResidual] = useState<DrainResponse | undefined>(undefined)

  /**
   * Exhaust the wallet in one call: `POST /quota/lab/drain` zeroes the balance
   * server-side, then the post-drain hold is rejected with the canonical 402
   * (the common path, surfaced as an error). A resolved value instead means
   * an overdraft floor let the hold pass, so the wall was not reached.
   */
  async function drain(): Promise<void> {
    setIsDraining(true)
    setDrainError(undefined)
    setDrainResidual(undefined)
    try {
      setDrainResidual(await api.drainWallet())
    } catch (error) {
      setDrainError(toApiError(error))
    }
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
    <Card>
      <CardHeader accent>
        <CardTitle>Estimator lab</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

        <DrainOutcome error={drainError} residual={drainResidual} />
      </CardContent>
    </Card>
  )
}
