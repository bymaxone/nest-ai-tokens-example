/**
 * @fileoverview The Rewrite command card: text, an optional style, and an
 * optional target language (`POST /workspace/rewrite`).
 *
 * @layer components/playground
 */
'use client'

import { useId, useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/use-api-mutation'

import { FailureHelperSelect } from './FailureHelperSelect'
import { ModelPicker } from './ModelPicker'
import { ResultPanel } from './ResultPanel'
import { useCommandForm } from './use-command-form'

/** RewriteCard props. */
export interface RewriteCardProps {
  /** The command models catalog (empty while still loading). */
  readonly models: readonly string[]
}

/** The Rewrite command card. */
export function RewriteCard({ models }: RewriteCardProps): React.JSX.Element {
  const form = useCommandForm('playground-rewrite')
  const [style, setStyle] = useState('')
  const [language, setLanguage] = useState('')
  const mutation = useApiMutation(api.rewrite.bind(api))
  const modelId = useId()

  return (
    <div className="card">
      <div className="card__title">Rewrite</div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run({
            text: form.text,
            ...(style.length > 0 ? { style } : {}),
            ...(language.length > 0 ? { language } : {}),
            model: form.effectiveModel(models),
            resourceId: form.resourceId,
          })
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div>
          <label className="label" htmlFor="rewrite-text">
            Text
          </label>
          <textarea
            id="rewrite-text"
            className="input"
            style={{ height: 80 }}
            value={form.text}
            onChange={(event) => form.setText(event.target.value)}
            required
          />
        </div>
        <div className="grid-2">
          <div>
            <label className="label" htmlFor="rewrite-style">
              Style (optional)
            </label>
            <input
              id="rewrite-style"
              className="input"
              value={style}
              onChange={(event) => setStyle(event.target.value)}
              placeholder="formal"
            />
          </div>
          <div>
            <label className="label" htmlFor="rewrite-language">
              Language (optional)
            </label>
            <input
              id="rewrite-language"
              className="input"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder="en"
            />
          </div>
        </div>
        <ModelPicker models={models} value={form.model} onChange={form.setModel} id={modelId} />
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={mutation.state.status === 'pending' || models.length === 0}
        >
          {mutation.state.status === 'pending' ? 'Rewriting…' : 'Rewrite'}
        </button>
      </form>

      {mutation.state.status === 'error' && <ErrorBanner error={mutation.state.error} />}
      {mutation.state.status === 'success' && (
        <ResultPanel content={mutation.state.data.rewritten} usage={mutation.state.data.usage} />
      )}

      <FailureHelperSelect onInsert={form.appendMarker} id={`${modelId}-marker`} />
    </div>
  )
}
