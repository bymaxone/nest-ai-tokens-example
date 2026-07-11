/**
 * @fileoverview The admin price-update form (`PUT /pricing/:model`):
 * input/output USD per 1M tokens. The api closes the current window and
 * inserts the successor; old windows are never rewritten (scenario
 * §13.4), which the callout states explicitly. There is no separate
 * cache-flush endpoint to call (v0.1.0 clears its resolution cache on
 * every update internally; see the phase Reconciliation note), so this
 * form's success is the only feedback the page needs.
 *
 * @layer components/pricing
 */
'use client'

import { AI_OPERATIONS, SERVICE_TIERS } from '@bymax-one/nest-ai-tokens/shared'
import { useId, useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import type { PriceRowView } from '@/lib/api-types'
import { useApiMutation } from '@/lib/use-api-mutation'

/** Digit-string per-1M USD rate field validation (the api's own contract). */
const NANO_USD_PATTERN = /^\d+$/

/** UpdatePricingForm props. */
export interface UpdatePricingFormProps {
  /** Called after a successful update, so the table and timeline can refresh. */
  readonly onUpdated: () => void
}

/** The model + provider identity fields. */
function ModelProviderFields(props: {
  readonly model: string
  readonly onModelChange: (value: string) => void
  readonly provider: string
  readonly onProviderChange: (value: string) => void
  readonly modelId: string
  readonly providerId: string
}): React.JSX.Element {
  return (
    <div className="grid-2">
      <div>
        <label className="label" htmlFor={props.modelId}>
          Model
        </label>
        <input
          id={props.modelId}
          className="input"
          value={props.model}
          onChange={(event) => props.onModelChange(event.target.value)}
          placeholder="mock-chat-pro"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor={props.providerId}>
          Provider
        </label>
        <input
          id={props.providerId}
          className="input"
          value={props.provider}
          onChange={(event) => props.onProviderChange(event.target.value)}
          required
        />
      </div>
    </div>
  )
}

/** The operation + service-tier selects. */
function OperationTierFields(props: {
  readonly operation: (typeof AI_OPERATIONS)[number]
  readonly onOperationChange: (value: (typeof AI_OPERATIONS)[number]) => void
  readonly serviceTier: (typeof SERVICE_TIERS)[number]
  readonly onServiceTierChange: (value: (typeof SERVICE_TIERS)[number]) => void
  readonly operationId: string
  readonly tierId: string
}): React.JSX.Element {
  return (
    <div className="grid-2">
      <div>
        <label className="label" htmlFor={props.operationId}>
          Operation
        </label>
        <select
          id={props.operationId}
          className="input"
          value={props.operation}
          onChange={(event) =>
            props.onOperationChange(event.target.value as (typeof AI_OPERATIONS)[number])
          }
        >
          {AI_OPERATIONS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={props.tierId}>
          Service tier
        </label>
        <select
          id={props.tierId}
          className="input"
          value={props.serviceTier}
          onChange={(event) =>
            props.onServiceTierChange(event.target.value as (typeof SERVICE_TIERS)[number])
          }
        >
          {SERVICE_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** The input/output nano-USD-per-1M rate fields. */
function RateFields(props: {
  readonly inputRate: string
  readonly onInputRateChange: (value: string) => void
  readonly outputRate: string
  readonly onOutputRateChange: (value: string) => void
  readonly inputId: string
  readonly outputId: string
}): React.JSX.Element {
  return (
    <div className="grid-2">
      <div>
        <label className="label" htmlFor={props.inputId}>
          Input USD / 1M tokens (nano-USD)
        </label>
        <input
          id={props.inputId}
          className="input"
          inputMode="numeric"
          value={props.inputRate}
          onChange={(event) => props.onInputRateChange(event.target.value)}
          placeholder="1000000000"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor={props.outputId}>
          Output USD / 1M tokens (nano-USD)
        </label>
        <input
          id={props.outputId}
          className="input"
          inputMode="numeric"
          value={props.outputRate}
          onChange={(event) => props.onOutputRateChange(event.target.value)}
          placeholder="2000000000"
          required
        />
      </div>
    </div>
  )
}

/** The submit outcome banner: the error envelope, or the success toast naming the new window. */
function SubmitOutcome(props: {
  readonly mutationState: ReturnType<typeof useApiMutation<[string], PriceRowView>>['state']
}): React.JSX.Element | null {
  if (props.mutationState.status === 'error') {
    return <ErrorBanner error={props.mutationState.error} />
  }
  if (props.mutationState.status === 'success') {
    return (
      <div className="toast toast--success" style={{ maxWidth: 'none', marginTop: 10 }}>
        Updated: new window opens{' '}
        {new Date(props.mutationState.data.effectiveFrom).toLocaleString()}.
      </div>
    )
  }
  return null
}

/** A stable set of element ids, one per form field, for `<label htmlFor>` targeting. */
function useFieldIds(): Record<
  'model' | 'provider' | 'operation' | 'tier' | 'input' | 'output',
  string
> {
  return {
    model: useId(),
    provider: useId(),
    operation: useId(),
    tier: useId(),
    input: useId(),
    output: useId(),
  }
}

/** The form's field groups, submit button, and the immutability callout. */
function PricingFormBody(props: {
  readonly model: string
  readonly onModelChange: (value: string) => void
  readonly provider: string
  readonly onProviderChange: (value: string) => void
  readonly operation: (typeof AI_OPERATIONS)[number]
  readonly onOperationChange: (value: (typeof AI_OPERATIONS)[number]) => void
  readonly serviceTier: (typeof SERVICE_TIERS)[number]
  readonly onServiceTierChange: (value: (typeof SERVICE_TIERS)[number]) => void
  readonly inputRate: string
  readonly onInputRateChange: (value: string) => void
  readonly outputRate: string
  readonly onOutputRateChange: (value: string) => void
  readonly ids: ReturnType<typeof useFieldIds>
  readonly onSubmit: (event: React.FormEvent) => void
  readonly submitDisabled: boolean
  readonly submitLabel: string
}): React.JSX.Element {
  return (
    <>
      <p className="text-[13px] text-muted-foreground">
        History is immutable: an update closes the current window and opens a new one; older windows
        are never rewritten. Rates take integer nano-USD per 1,000,000 units (no cache flush
        endpoint exists; every update clears the resolution cache automatically).
      </p>
      <form onSubmit={props.onSubmit} className="mt-2.5 flex flex-col gap-2.5">
        <ModelProviderFields
          model={props.model}
          onModelChange={props.onModelChange}
          provider={props.provider}
          onProviderChange={props.onProviderChange}
          modelId={props.ids.model}
          providerId={props.ids.provider}
        />
        <OperationTierFields
          operation={props.operation}
          onOperationChange={props.onOperationChange}
          serviceTier={props.serviceTier}
          onServiceTierChange={props.onServiceTierChange}
          operationId={props.ids.operation}
          tierId={props.ids.tier}
        />
        <RateFields
          inputRate={props.inputRate}
          onInputRateChange={props.onInputRateChange}
          outputRate={props.outputRate}
          onOutputRateChange={props.onOutputRateChange}
          inputId={props.ids.input}
          outputId={props.ids.output}
        />
        <Button type="submit" size="sm" disabled={props.submitDisabled}>
          {props.submitLabel}
        </Button>
      </form>
    </>
  )
}

/** The admin price-update form. */
export function UpdatePricingForm({ onUpdated }: UpdatePricingFormProps): React.JSX.Element {
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('mock')
  const [operation, setOperation] = useState<(typeof AI_OPERATIONS)[number]>('chat')
  const [serviceTier, setServiceTier] = useState<(typeof SERVICE_TIERS)[number]>('standard')
  const [inputRate, setInputRate] = useState('')
  const [outputRate, setOutputRate] = useState('')
  const mutation = useApiMutation((targetModel: string) =>
    api.updatePricing(targetModel, {
      provider,
      operation,
      serviceTier,
      inputNanoUsdPerMillion: inputRate,
      outputNanoUsdPerMillion: outputRate,
    }),
  )
  const ids = useFieldIds()
  const validRates = NANO_USD_PATTERN.test(inputRate) && NANO_USD_PATTERN.test(outputRate)

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    void mutation.run(model).then((result) => {
      if (result !== undefined) onUpdated()
    })
  }

  return (
    <Card>
      <CardHeader accent>
        <CardTitle>Update pricing</CardTitle>
      </CardHeader>
      <CardContent>
        <PricingFormBody
          model={model}
          onModelChange={setModel}
          provider={provider}
          onProviderChange={setProvider}
          operation={operation}
          onOperationChange={setOperation}
          serviceTier={serviceTier}
          onServiceTierChange={setServiceTier}
          inputRate={inputRate}
          onInputRateChange={setInputRate}
          outputRate={outputRate}
          onOutputRateChange={setOutputRate}
          ids={ids}
          onSubmit={handleSubmit}
          submitDisabled={mutation.state.status === 'pending' || !validRates}
          submitLabel={mutation.state.status === 'pending' ? 'Updating…' : 'Update pricing'}
        />
        <SubmitOutcome mutationState={mutation.state} />
      </CardContent>
    </Card>
  )
}
