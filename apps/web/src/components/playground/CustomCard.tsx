/**
 * @fileoverview The Custom command card: caller-shaped system/user prompts
 * and a text/JSON response-format toggle (`POST /workspace/custom`).
 *
 * @layer components/playground
 */
'use client'

import { useId, useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import type { CustomBody } from '@/lib/api-types'
import { useApiMutation } from '@/lib/use-api-mutation'

import { FailureHelperSelect } from './FailureHelperSelect'
import { ModelPicker } from './ModelPicker'
import { ResultPanel } from './ResultPanel'
import { useCommandForm } from './use-command-form'

/** CustomCard props. */
export interface CustomCardProps {
  /** The command models catalog (empty while still loading). */
  readonly models: readonly string[]
}

/** The Custom command card (the caller-shaped escape hatch). */
export function CustomCard({ models }: CustomCardProps): React.JSX.Element {
  const form = useCommandForm('playground-custom')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [responseFormat, setResponseFormat] =
    useState<NonNullable<CustomBody['responseFormat']>>('text')
  const mutation = useApiMutation(api.custom.bind(api))
  const modelId = useId()

  return (
    <div className="card">
      <div className="card__title">Custom</div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run({
            ...(systemPrompt.length > 0 ? { systemPrompt } : {}),
            userPrompt: form.text,
            responseFormat,
            model: form.effectiveModel(models),
            resourceId: form.resourceId,
          })
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div>
          <label className="label" htmlFor="custom-system">
            System prompt (optional)
          </label>
          <textarea
            id="custom-system"
            className="input"
            style={{ height: 60 }}
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="custom-user">
            User prompt
          </label>
          <textarea
            id="custom-user"
            className="input"
            style={{ height: 80 }}
            value={form.text}
            onChange={(event) => form.setText(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="custom-format">
            Response format
          </label>
          <select
            id="custom-format"
            className="input"
            value={responseFormat}
            onChange={(event) =>
              setResponseFormat(event.target.value as NonNullable<CustomBody['responseFormat']>)
            }
          >
            <option value="text">text</option>
            <option value="json_object">json_object</option>
          </select>
        </div>
        <ModelPicker models={models} value={form.model} onChange={form.setModel} id={modelId} />
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={mutation.state.status === 'pending' || models.length === 0}
        >
          {mutation.state.status === 'pending' ? 'Running…' : 'Run'}
        </button>
      </form>

      {mutation.state.status === 'error' && <ErrorBanner error={mutation.state.error} />}
      {mutation.state.status === 'success' && (
        <ResultPanel content={mutation.state.data.content} usage={mutation.state.data.usage} />
      )}

      <FailureHelperSelect onInsert={form.appendMarker} id={`${modelId}-marker`} />
    </div>
  )
}
