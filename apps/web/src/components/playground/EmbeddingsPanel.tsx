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

/** The single-text embedding half of the panel. */
function SingleEmbed(): React.JSX.Element {
  const [text, setText] = useState('')
  const mutation = useApiMutation(api.embed.bind(api))
  const id = useId()

  return (
    <div>
      <div className="card__title">Single embed</div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run({ text, resourceId: 'playground-embed' })
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
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
        <button
          type="submit"
          className="btn btn--outline btn--sm"
          disabled={mutation.state.status === 'pending'}
        >
          {mutation.state.status === 'pending' ? 'Embedding…' : 'Embed'}
        </button>
      </form>
      {mutation.state.status === 'error' && <ErrorBanner error={mutation.state.error} />}
      {mutation.state.status === 'success' && (
        <ResultPanel
          content={formatPreview(mutation.state.data.vector)}
          usage={mutation.state.data.usage}
        />
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
      <div className="card__title">Batch embed</div>
      <div className="card__desc">One text per line, up to 50 inputs, ONE ledger transaction.</div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run({ texts: lines, resourceId: 'playground-embed-batch' })
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}
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
        <button
          type="submit"
          className="btn btn--outline btn--sm"
          disabled={mutation.state.status === 'pending'}
        >
          {mutation.state.status === 'pending' ? 'Embedding…' : `Embed ${lines.length} text(s)`}
        </button>
      </form>
      {mutation.state.status === 'error' && <ErrorBanner error={mutation.state.error} />}
      {batchResult !== undefined && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="badge">
            {batchResult.batchSize} inputs, ONE transaction: {batchResult.usage.transactionId}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {batchResult.embeddings.map((vector, index) => (
              <div
                key={`${batchResult.usage.transactionId}-${index}`}
                className="mono"
                style={{ fontSize: 12 }}
              >
                {formatPreview(vector)}
              </div>
            ))}
          </div>
          <ResultPanel content={`batch of ${batchResult.batchSize}`} usage={batchResult.usage} />
        </div>
      )}
    </div>
  )
}

/** The Playground's embeddings panel: single and batch embed side by side. */
export function EmbeddingsPanel(): React.JSX.Element {
  return (
    <div className="card">
      <div className="card__title">Embeddings</div>
      <div className="grid-2" style={{ marginTop: 8 }}>
        <SingleEmbed />
        <BatchEmbed />
      </div>
    </div>
  )
}
