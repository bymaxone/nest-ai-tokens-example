/**
 * @fileoverview The Rewrite command card: text, an optional style, and an
 * optional target language (`POST /workspace/rewrite`).
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

/** RewriteCard props. */
export interface RewriteCardProps {
  /** The command models catalog (empty while still loading). */
  readonly models: readonly string[]
}

/** The optional style and language fields. */
function RewriteOptionalFields(props: {
  readonly style: string
  readonly onStyleChange: (value: string) => void
  readonly language: string
  readonly onLanguageChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="grid-2">
      <div>
        <label className="label" htmlFor="rewrite-style">
          Style (optional)
        </label>
        <input
          id="rewrite-style"
          className="input"
          value={props.style}
          onChange={(event) => props.onStyleChange(event.target.value)}
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
          value={props.language}
          onChange={(event) => props.onLanguageChange(event.target.value)}
          placeholder="en"
        />
      </div>
    </div>
  )
}

/** The Rewrite command card. */
export function RewriteCard({ models }: RewriteCardProps): React.JSX.Element {
  const form = useCommandForm('playground-rewrite')
  const [style, setStyle] = useState('')
  const [language, setLanguage] = useState('')
  const mutation = useApiMutation(api.rewrite.bind(api))
  const modelId = useId()

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    void mutation.run({
      text: form.text,
      ...(style.length > 0 ? { style } : {}),
      ...(language.length > 0 ? { language } : {}),
      model: form.effectiveModel(models),
      resourceId: form.resourceId,
    })
  }

  return (
    <div className="card">
      <div className="card__title">Rewrite</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
        <RewriteOptionalFields
          style={style}
          onStyleChange={setStyle}
          language={language}
          onLanguageChange={setLanguage}
        />
        <CommandCardFooter
          models={models}
          model={form.model}
          onModelChange={form.setModel}
          modelId={modelId}
          pending={mutation.state.status === 'pending'}
          idleLabel="Rewrite"
          pendingLabel="Rewriting…"
        />
      </form>

      <CommandCardOutcome mutationState={mutation.state} renderContent={(data) => data.rewritten} />

      <FailureHelperSelect onInsert={form.appendMarker} id={`${modelId}-marker`} />
    </div>
  )
}
