/**
 * @fileoverview The Translate command card: text, an optional source
 * language, and a comma-separated target-language list rendered as live
 * chips (`POST /workspace/translate`).
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

/** TranslateCard props. */
export interface TranslateCardProps {
  /** The command models catalog (empty while still loading). */
  readonly models: readonly string[]
}

/** Splits a comma-separated language list into trimmed, non-empty codes. */
function parseLanguages(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

/** The Translate command card. */
export function TranslateCard({ models }: TranslateCardProps): React.JSX.Element {
  const form = useCommandForm('playground-translate')
  const [sourceLanguage, setSourceLanguage] = useState('')
  const [targetLanguagesRaw, setTargetLanguagesRaw] = useState('es')
  const mutation = useApiMutation(api.translate.bind(api))
  const modelId = useId()
  const targetLanguages = parseLanguages(targetLanguagesRaw)

  return (
    <div className="card">
      <div className="card__title">Translate</div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run({
            text: form.text,
            ...(sourceLanguage.length > 0 ? { sourceLanguage } : {}),
            targetLanguages,
            model: form.effectiveModel(models),
            resourceId: form.resourceId,
          })
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div>
          <label className="label" htmlFor="translate-text">
            Text
          </label>
          <textarea
            id="translate-text"
            className="input"
            style={{ height: 80 }}
            value={form.text}
            onChange={(event) => form.setText(event.target.value)}
            required
          />
        </div>
        <div className="grid-2">
          <div>
            <label className="label" htmlFor="translate-source">
              Source language (optional)
            </label>
            <input
              id="translate-source"
              className="input"
              value={sourceLanguage}
              onChange={(event) => setSourceLanguage(event.target.value)}
              placeholder="en"
            />
          </div>
          <div>
            <label className="label" htmlFor="translate-targets">
              Target languages (comma separated)
            </label>
            <input
              id="translate-targets"
              className="input"
              value={targetLanguagesRaw}
              onChange={(event) => setTargetLanguagesRaw(event.target.value)}
              required
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {targetLanguages.map((language) => (
            <span key={language} className="chip">
              {language}
            </span>
          ))}
        </div>
        <ModelPicker models={models} value={form.model} onChange={form.setModel} id={modelId} />
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={mutation.state.status === 'pending' || models.length === 0}
        >
          {mutation.state.status === 'pending' ? 'Translating…' : 'Translate'}
        </button>
      </form>

      {mutation.state.status === 'error' && <ErrorBanner error={mutation.state.error} />}
      {mutation.state.status === 'success' && (
        <ResultPanel
          content={Object.entries(mutation.state.data.translations)
            .map(([language, text]) => `${language}: ${text}`)
            .join('\n')}
          usage={mutation.state.data.usage}
        />
      )}

      <FailureHelperSelect onInsert={form.appendMarker} id={`${modelId}-marker`} />
    </div>
  )
}
