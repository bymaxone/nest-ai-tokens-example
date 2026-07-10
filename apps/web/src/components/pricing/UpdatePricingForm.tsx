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
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/use-api-mutation'

/** Digit-string per-1M USD rate field validation (the api's own contract). */
const NANO_USD_PATTERN = /^\d+$/

/** UpdatePricingForm props. */
export interface UpdatePricingFormProps {
  /** Called after a successful update, so the table and timeline can refresh. */
  readonly onUpdated: () => void
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
  const ids = {
    model: useId(),
    provider: useId(),
    operation: useId(),
    tier: useId(),
    input: useId(),
    output: useId(),
  }
  const validRates = NANO_USD_PATTERN.test(inputRate) && NANO_USD_PATTERN.test(outputRate)

  return (
    <div className="card">
      <div className="card__title">Update pricing</div>
      <p className="card__desc">
        History is immutable: an update closes the current window and opens a new one; older windows
        are never rewritten. Rates take integer nano-USD per 1,000,000 units (no cache flush
        endpoint exists; every update clears the resolution cache automatically).
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run(model).then((result) => {
            if (result !== undefined) onUpdated()
          })
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}
      >
        <div className="grid-2">
          <div>
            <label className="label" htmlFor={ids.model}>
              Model
            </label>
            <input
              id={ids.model}
              className="input"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="mock-chat-pro"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor={ids.provider}>
              Provider
            </label>
            <input
              id={ids.provider}
              className="input"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              required
            />
          </div>
        </div>
        <div className="grid-2">
          <div>
            <label className="label" htmlFor={ids.operation}>
              Operation
            </label>
            <select
              id={ids.operation}
              className="input"
              value={operation}
              onChange={(event) =>
                setOperation(event.target.value as (typeof AI_OPERATIONS)[number])
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
            <label className="label" htmlFor={ids.tier}>
              Service tier
            </label>
            <select
              id={ids.tier}
              className="input"
              value={serviceTier}
              onChange={(event) =>
                setServiceTier(event.target.value as (typeof SERVICE_TIERS)[number])
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
        <div className="grid-2">
          <div>
            <label className="label" htmlFor={ids.input}>
              Input USD / 1M tokens (nano-USD)
            </label>
            <input
              id={ids.input}
              className="input"
              inputMode="numeric"
              value={inputRate}
              onChange={(event) => setInputRate(event.target.value)}
              placeholder="1000000000"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor={ids.output}>
              Output USD / 1M tokens (nano-USD)
            </label>
            <input
              id={ids.output}
              className="input"
              inputMode="numeric"
              value={outputRate}
              onChange={(event) => setOutputRate(event.target.value)}
              placeholder="2000000000"
              required
            />
          </div>
        </div>
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={mutation.state.status === 'pending' || !validRates}
        >
          {mutation.state.status === 'pending' ? 'Updating…' : 'Update pricing'}
        </button>
      </form>
      {mutation.state.status === 'error' && <ErrorBanner error={mutation.state.error} />}
      {mutation.state.status === 'success' && (
        <div className="toast toast--success" style={{ maxWidth: 'none', marginTop: 10 }}>
          Updated: new window opens {new Date(mutation.state.data.effectiveFrom).toLocaleString()}.
        </div>
      )}
    </div>
  )
}
