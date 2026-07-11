/**
 * @fileoverview The embeddings panel: single-text embedding
 * (`POST /workspace/embed`) and batch embedding (`POST /workspace/embed/batch`,
 * one text per line), each showing a first-8-dimensions vector preview and
 * the cost. The batch call settles as ONE transaction for every input
 * (scenario §13.2), called out explicitly in the batch result.
 *
 * @layer components/playground
 */
'use client'

import { useId, useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/use-api-mutation'

import { ResultPanel } from './ResultPanel'

/** Dimensions shown in a vector preview. */
const PREVIEW_DIMENSIONS = 8

/** Renders the first {@link PREVIEW_DIMENSIONS} of an embedding vector. */
function formatPreview(vector: readonly number[]): string {
  return `[${vector
    .slice(0, PREVIEW_DIMENSIONS)
    .map((value) => value.toFixed(4))
    .join(', ')}${vector.length > PREVIEW_DIMENSIONS ? ', …' : ''}]`
}

/** Splits a textarea's lines into trimmed, non-empty inputs. */
function parseLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/** A sub-section heading inside the embeddings card. */
function SectionTitle({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <div className="mb-1 font-mono text-base font-bold">{children}</div>
}

/** The single-text embedding half of the panel. */
function SingleEmbed(): React.JSX.Element {
  const [text, setText] = useState('')
  const mutation = useApiMutation(api.embed.bind(api))
  const id = useId()

  return (
    <div>
      <SectionTitle>Single embed</SectionTitle>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run({ text, resourceId: 'playground-embed' })
        }}
        className="flex flex-col gap-2.5"
      >
        <textarea
          id={id}
          className="input"
          aria-label="Single embed text"
          style={{ height: 60 }}
          value={text}
          onChange={(event) => setText(event.target.value)}
          required
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={mutation.state.status === 'pending'}
        >
          {mutation.state.status === 'pending' ? 'Embedding…' : 'Embed'}
        </Button>
      </form>
      {mutation.state.status === 'error' && <ErrorBanner error={mutation.state.error} />}
      {mutation.state.status === 'success' && (
        <div className="mt-2.5">
          <ResultPanel
            content={formatPreview(mutation.state.data.vector)}
            usage={mutation.state.data.usage}
          />
        </div>
      )}
    </div>
  )
}

/** The batch-embedding half of the panel: one text per line, ONE transaction for the whole batch. */
function BatchEmbed(): React.JSX.Element {
  const [linesRaw, setLinesRaw] = useState('')
  const mutation = useApiMutation(api.embedBatch.bind(api))
  const id = useId()
  const lines = parseLines(linesRaw)
  // Extracted so the discriminated-union narrowing below survives into the
  // nested `.map()` closure: TS only narrows `mutation.state` within the
  // current function body, not inside a further-nested arrow function.
  const batchResult = mutation.state.status === 'success' ? mutation.state.data : undefined

  return (
    <div>
      <SectionTitle>Batch embed</SectionTitle>
      <p className="text-[13px] text-muted-foreground">
        One text per line, up to 50 inputs, ONE ledger transaction.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run({ texts: lines, resourceId: 'playground-embed-batch' })
        }}
        className="mt-2 flex flex-col gap-2.5"
      >
        <textarea
          id={id}
          className="input"
          aria-label="Batch embed texts"
          style={{ height: 80 }}
          value={linesRaw}
          onChange={(event) => setLinesRaw(event.target.value)}
          required
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={mutation.state.status === 'pending'}
        >
          {mutation.state.status === 'pending' ? 'Embedding…' : `Embed ${lines.length} text(s)`}
        </Button>
      </form>
      {mutation.state.status === 'error' && <ErrorBanner error={mutation.state.error} />}
      {batchResult !== undefined && (
        <Card className="mt-2">
          <CardContent className="flex flex-col gap-2 pt-6">
            <Badge className="self-start">
              {batchResult.batchSize} inputs, ONE transaction: {batchResult.usage.transactionId}
            </Badge>
            <div className="flex flex-col gap-1.5">
              {batchResult.embeddings.map((vector, index) => (
                <div key={`${batchResult.usage.transactionId}-${index}`} className="mono text-xs">
                  {formatPreview(vector)}
                </div>
              ))}
            </div>
            <ResultPanel content={`batch of ${batchResult.batchSize}`} usage={batchResult.usage} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** The Playground's embeddings panel: single and batch embed side by side. */
export function EmbeddingsPanel(): React.JSX.Element {
  return (
    <Card>
      <CardHeader accent>
        <CardTitle>Embeddings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid-2">
          <SingleEmbed />
          <BatchEmbed />
        </div>
      </CardContent>
    </Card>
  )
}
