/**
 * @fileoverview The Translate command card: text, an optional source
 * language, and a comma-separated target-language list rendered as live
 * chips (`POST /workspace/translate`).
 *
 * @layer components/playground
 */
'use client'

import { useId, useState } from 'react'

import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/use-api-mutation'

import { CommandCardFooter, CommandCardOutcome } from './CommandCardChrome'
import { FailureHelperSelect } from './FailureHelperSelect'
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

/** The text, source-language, and target-languages fields (plus the live chip preview). */
function TranslateFields(props: {
  readonly text: string
  readonly onTextChange: (value: string) => void
  readonly sourceLanguage: string
  readonly onSourceLanguageChange: (value: string) => void
  readonly targetLanguagesRaw: string
  readonly onTargetLanguagesRawChange: (value: string) => void
  readonly targetLanguages: readonly string[]
}): React.JSX.Element {
  return (
    <>
      <div>
        <label className="label" htmlFor="translate-text">
          Text
        </label>
        <textarea
          id="translate-text"
          className="input"
          style={{ height: 80 }}
          value={props.text}
          onChange={(event) => props.onTextChange(event.target.value)}
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
            value={props.sourceLanguage}
            onChange={(event) => props.onSourceLanguageChange(event.target.value)}
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
            value={props.targetLanguagesRaw}
            onChange={(event) => props.onTargetLanguagesRawChange(event.target.value)}
            required
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {props.targetLanguages.map((language) => (
          <span key={language} className="chip">
            {language}
          </span>
        ))}
      </div>
    </>
  )
}

/** The Translate command card. */
export function TranslateCard({ models }: TranslateCardProps): React.JSX.Element {
  const form = useCommandForm('playground-translate')
  const [sourceLanguage, setSourceLanguage] = useState('')
  const [targetLanguagesRaw, setTargetLanguagesRaw] = useState('es')
  const mutation = useApiMutation(api.translate.bind(api))
  const modelId = useId()
  const targetLanguages = parseLanguages(targetLanguagesRaw)

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    void mutation.run({
      text: form.text,
      ...(sourceLanguage.length > 0 ? { sourceLanguage } : {}),
      targetLanguages,
      model: form.effectiveModel(models),
      resourceId: form.resourceId,
    })
  }

  return (
    <div className="card">
      <div className="card__title">Translate</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <TranslateFields
          text={form.text}
          onTextChange={form.setText}
          sourceLanguage={sourceLanguage}
          onSourceLanguageChange={setSourceLanguage}
          targetLanguagesRaw={targetLanguagesRaw}
          onTargetLanguagesRawChange={setTargetLanguagesRaw}
          targetLanguages={targetLanguages}
        />
        <CommandCardFooter
          models={models}
          model={form.model}
          onModelChange={form.setModel}
          modelId={modelId}
          pending={mutation.state.status === 'pending'}
          idleLabel="Translate"
          pendingLabel="Translating…"
        />
      </form>

      <CommandCardOutcome
        mutationState={mutation.state}
        renderContent={(data) =>
          Object.entries(data.translations)
            .map(([language, text]) => `${language}: ${text}`)
            .join('\n')
        }
      />

      <FailureHelperSelect onInsert={form.appendMarker} id={`${modelId}-marker`} />
    </div>
  )
}
