/**
 * @fileoverview The Custom command card: caller-shaped system/user prompts
 * and a text/JSON response-format toggle (`POST /workspace/custom`).
 *
 * @layer components/playground
 */
'use client'

import { useId, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import type { CustomBody } from '@/lib/api-types'
import { useApiMutation } from '@/lib/use-api-mutation'

import { CommandCardFooter, CommandCardOutcome } from './CommandCardChrome'
import { FailureHelperSelect } from './FailureHelperSelect'
import { useCommandForm } from './use-command-form'

/** CustomCard props. */
export interface CustomCardProps {
  /** The command models catalog (empty while still loading). */
  readonly models: readonly string[]
}

/** The system/user prompt fields and the response-format select. */
function CustomFields(props: {
  readonly systemPrompt: string
  readonly onSystemPromptChange: (value: string) => void
  readonly userPrompt: string
  readonly onUserPromptChange: (value: string) => void
  readonly responseFormat: NonNullable<CustomBody['responseFormat']>
  readonly onResponseFormatChange: (value: NonNullable<CustomBody['responseFormat']>) => void
}): React.JSX.Element {
  return (
    <>
      <div>
        <label className="label" htmlFor="custom-system">
          System prompt (optional)
        </label>
        <textarea
          id="custom-system"
          className="input"
          style={{ height: 60 }}
          value={props.systemPrompt}
          onChange={(event) => props.onSystemPromptChange(event.target.value)}
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
          value={props.userPrompt}
          onChange={(event) => props.onUserPromptChange(event.target.value)}
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
          value={props.responseFormat}
          onChange={(event) =>
            props.onResponseFormatChange(
              event.target.value as NonNullable<CustomBody['responseFormat']>,
            )
          }
        >
          <option value="text">text</option>
          <option value="json_object">json_object</option>
        </select>
      </div>
    </>
  )
}

/** The Custom command card (the caller-shaped escape hatch). */
export function CustomCard({ models }: CustomCardProps): React.JSX.Element {
  const form = useCommandForm('playground-custom')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [responseFormat, setResponseFormat] =
    useState<NonNullable<CustomBody['responseFormat']>>('text')
  const mutation = useApiMutation(api.custom.bind(api))
  const modelId = useId()

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    void mutation.run({
      ...(systemPrompt.length > 0 ? { systemPrompt } : {}),
      userPrompt: form.text,
      responseFormat,
      model: form.effectiveModel(models),
      resourceId: form.resourceId,
    })
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader accent>
        <CardTitle>Custom</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3.5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <CustomFields
            systemPrompt={systemPrompt}
            onSystemPromptChange={setSystemPrompt}
            userPrompt={form.text}
            onUserPromptChange={form.setText}
            responseFormat={responseFormat}
            onResponseFormatChange={setResponseFormat}
          />
          <CommandCardFooter
            models={models}
            model={form.model}
            onModelChange={form.setModel}
            modelId={modelId}
            pending={mutation.state.status === 'pending'}
            idleLabel="Run"
            pendingLabel="Running…"
          />
        </form>

        <CommandCardOutcome mutationState={mutation.state} renderContent={(data) => data.content} />

        <div className="mt-auto">
          <FailureHelperSelect onInsert={form.appendMarker} id={`${modelId}-marker`} />
        </div>
      </CardContent>
    </Card>
  )
}
