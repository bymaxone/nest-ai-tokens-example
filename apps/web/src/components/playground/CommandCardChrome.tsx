/**
 * @fileoverview The chrome every command card shares below its
 * command-specific fields: the model picker + submit button, and the
 * result/error outcome. Extracted once so the five command cards (which
 * differ only in their input fields and which api method they call) do
 * not each re-render the same footer and outcome markup.
 *
 * @layer components/playground
 */
import { ErrorBanner } from '@/components/common/ErrorBanner'
import { Button } from '@/components/ui/button'
import type { ApiMutationState } from '@/lib/use-api-mutation'
import type { WorkspaceUsageView } from '@/lib/api-types'

import { ModelPicker } from './ModelPicker'
import { ResultPanel } from './ResultPanel'

/** The model picker plus the submit button, sharing the pending/disabled state. */
export function CommandCardFooter(props: {
  readonly models: readonly string[]
  readonly model: string
  readonly onModelChange: (value: string) => void
  readonly modelId: string
  readonly pending: boolean
  readonly idleLabel: string
  readonly pendingLabel: string
}): React.JSX.Element {
  return (
    <>
      <ModelPicker
        models={props.models}
        value={props.model}
        onChange={props.onModelChange}
        id={props.modelId}
      />
      <Button type="submit" size="sm" disabled={props.pending || props.models.length === 0}>
        {props.pending ? props.pendingLabel : props.idleLabel}
      </Button>
    </>
  )
}

/** A command mutation's outcome: the error envelope, or the result panel. */
export function CommandCardOutcome<T extends { readonly usage: WorkspaceUsageView }>(props: {
  readonly mutationState: ApiMutationState<T>
  readonly renderContent: (data: T) => string
}): React.JSX.Element | null {
  if (props.mutationState.status === 'error') {
    return <ErrorBanner error={props.mutationState.error} />
  }
  if (props.mutationState.status === 'success') {
    return (
      <ResultPanel
        content={props.renderContent(props.mutationState.data)}
        usage={props.mutationState.data.usage}
      />
    )
  }
  return null
}
