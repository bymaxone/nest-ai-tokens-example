/**
 * @fileoverview The Analyze command card: text against the fixed
 * sentiment/entities schema (`POST /workspace/analyze`).
 *
 * @layer components/playground
 */
'use client'

import { useId } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/use-api-mutation'

import { CommandCardFooter, CommandCardOutcome } from './CommandCardChrome'
import { FailureHelperSelect } from './FailureHelperSelect'
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

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    void mutation.run({
      text: form.text,
      model: form.effectiveModel(models),
      resourceId: form.resourceId,
    })
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader accent>
        <CardTitle>Analyze</CardTitle>
        <CardDescription>Fixed output schema: sentiment plus a list of entities.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3.5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
          <CommandCardFooter
            models={models}
            model={form.model}
            onModelChange={form.setModel}
            modelId={modelId}
            pending={mutation.state.status === 'pending'}
            idleLabel="Analyze"
            pendingLabel="Analyzing…"
          />
        </form>

        <CommandCardOutcome
          mutationState={mutation.state}
          renderContent={(data) =>
            `sentiment: ${data.analysis.sentiment}\nentities: ${data.analysis.entities.join(', ')}`
          }
        />

        <div className="mt-auto">
          <FailureHelperSelect onInsert={form.appendMarker} id={`${modelId}-marker`} />
        </div>
      </CardContent>
    </Card>
  )
}
