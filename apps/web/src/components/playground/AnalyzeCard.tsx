/**
 * @fileoverview The Analyze command card: text against the fixed
 * sentiment/entities schema (`POST /workspace/analyze`).
 *
 * @layer components/playground
 */
'use client'

import { useId } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/use-api-mutation'

import { FailureHelperSelect } from './FailureHelperSelect'
import { ModelPicker } from './ModelPicker'
import { ResultPanel } from './ResultPanel'
import { useCommandForm } from './use-command-form'

/** AnalyzeCard props. */
export interface AnalyzeCardProps {
  /** The command models catalog (empty while still loading). */
  readonly models: readonly string[]
}

/** The Analyze command card. */
export function AnalyzeCard({ models }: AnalyzeCardProps): React.JSX.Element {
  const form = useCommandForm('playground-analyze')
  const mutation = useApiMutation(api.analyze.bind(api))
  const modelId = useId()

  return (
    <div className="card">
      <div className="card__title">Analyze</div>
      <p className="card__desc">Fixed output schema: sentiment plus a list of entities.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run({
            text: form.text,
            model: form.effectiveModel(models),
            resourceId: form.resourceId,
          })
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div>
          <label className="label" htmlFor="analyze-text">
            Text
          </label>
          <textarea
            id="analyze-text"
            className="input"
            style={{ height: 80 }}
            value={form.text}
            onChange={(event) => form.setText(event.target.value)}
            required
          />
        </div>
        <ModelPicker models={models} value={form.model} onChange={form.setModel} id={modelId} />
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={mutation.state.status === 'pending' || models.length === 0}
        >
          {mutation.state.status === 'pending' ? 'Analyzing…' : 'Analyze'}
        </button>
      </form>

      {mutation.state.status === 'error' && <ErrorBanner error={mutation.state.error} />}
      {mutation.state.status === 'success' && (
        <ResultPanel
          content={`sentiment: ${mutation.state.data.analysis.sentiment}\nentities: ${mutation.state.data.analysis.entities.join(', ')}`}
          usage={mutation.state.data.usage}
        />
      )}

      <FailureHelperSelect onInsert={form.appendMarker} id={`${modelId}-marker`} />
    </div>
  )
}
