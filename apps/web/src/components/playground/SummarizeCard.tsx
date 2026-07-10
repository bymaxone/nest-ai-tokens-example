/**
 * @fileoverview The Summarize command card: text plus a style picker
 * (`POST /workspace/summarize`).
 *
 * @layer components/playground
 */
'use client'

import { useId, useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import type { SummarizeBody } from '@/lib/api-types'
import { useApiMutation } from '@/lib/use-api-mutation'

import { FailureHelperSelect } from './FailureHelperSelect'
import { ModelPicker } from './ModelPicker'
import { ResultPanel } from './ResultPanel'
import { useCommandForm } from './use-command-form'

/** The summary styles the command accepts. */
const STYLES: readonly NonNullable<SummarizeBody['style']>[] = ['bullet', 'paragraph', 'tldr']

/** SummarizeCard props. */
export interface SummarizeCardProps {
  /** The command models catalog (empty while still loading). */
  readonly models: readonly string[]
}

/** The Summarize command card. */
export function SummarizeCard({ models }: SummarizeCardProps): React.JSX.Element {
  const form = useCommandForm('playground-summarize')
  const [style, setStyle] = useState<NonNullable<SummarizeBody['style']>>('tldr')
  const mutation = useApiMutation(api.summarize.bind(api))
  const modelId = useId()

  return (
    <div className="card">
      <div className="card__title">Summarize</div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run({
            text: form.text,
            style,
            model: form.effectiveModel(models),
            resourceId: form.resourceId,
          })
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div>
          <label className="label" htmlFor="summarize-text">
            Text
          </label>
          <textarea
            id="summarize-text"
            className="input"
            style={{ height: 80 }}
            value={form.text}
            onChange={(event) => form.setText(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="summarize-style">
            Style
          </label>
          <select
            id="summarize-style"
            className="input"
            value={style}
            onChange={(event) =>
              setStyle(event.target.value as NonNullable<SummarizeBody['style']>)
            }
          >
            {STYLES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <ModelPicker models={models} value={form.model} onChange={form.setModel} id={modelId} />
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={mutation.state.status === 'pending' || models.length === 0}
        >
          {mutation.state.status === 'pending' ? 'Summarizing…' : 'Summarize'}
        </button>
      </form>

      {mutation.state.status === 'error' && <ErrorBanner error={mutation.state.error} />}
      {mutation.state.status === 'success' && (
        <ResultPanel content={mutation.state.data.summary} usage={mutation.state.data.usage} />
      )}

      <FailureHelperSelect onInsert={form.appendMarker} id={`${modelId}-marker`} />
    </div>
  )
}
