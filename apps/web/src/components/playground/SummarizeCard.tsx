/**
 * @fileoverview The Summarize command card: text plus a style picker
 * (`POST /workspace/summarize`).
 *
 * @layer components/playground
 */
'use client'

import { useId, useState } from 'react'

import { api } from '@/lib/api'
import type { SummarizeBody } from '@/lib/api-types'
import { useApiMutation } from '@/lib/use-api-mutation'

import { CommandCardFooter, CommandCardOutcome } from './CommandCardChrome'
import { FailureHelperSelect } from './FailureHelperSelect'
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

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    void mutation.run({
      text: form.text,
      style,
      model: form.effectiveModel(models),
      resourceId: form.resourceId,
    })
  }

  return (
    <div className="card">
      <div className="card__title">Summarize</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
        <CommandCardFooter
          models={models}
          model={form.model}
          onModelChange={form.setModel}
          modelId={modelId}
          pending={mutation.state.status === 'pending'}
          idleLabel="Summarize"
          pendingLabel="Summarizing…"
        />
      </form>

      <CommandCardOutcome mutationState={mutation.state} renderContent={(data) => data.summary} />

      <FailureHelperSelect onInsert={form.appendMarker} id={`${modelId}-marker`} />
    </div>
  )
}
