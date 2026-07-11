/**
 * @fileoverview The Errors page: the catalog grid, grouped by source
 * (scenario §13.8). `availability: 'trigger'` codes get a button that
 * fires `POST /errors-demo/:code` and renders the canonical envelope
 * (status, code, message, details) it always fails with; every other
 * availability renders as an inert entry with its `summary` explaining
 * how the code is actually proven (boot variant, e2e-only, reserved).
 *
 * @layer components/errors
 */
'use client'

import { useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import type { ErrorCatalogEntryView } from '@/lib/api-types'
import { useApiQuery } from '@/lib/use-api-query'

import { groupCatalog } from './group-catalog'

/** The most recent trigger's outcome. */
type TriggerOutcome = { readonly code: string; readonly error: ApiError } | undefined

/** One catalog entry: code + status chips, plus a Trigger button or its inert explanation. */
function CatalogEntryRow(props: {
  readonly entry: ErrorCatalogEntryView
  readonly pendingCode: string | undefined
  readonly onTrigger: (code: string) => void
}): React.JSX.Element {
  const { entry } = props
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="chip mono">{entry.code}</span>
      <span className="chip">{entry.httpStatus}</span>
      {entry.availability === 'trigger' ? (
        <button
          type="button"
          className="btn btn--outline btn--sm"
          disabled={props.pendingCode === entry.code}
          onClick={() => props.onTrigger(entry.code)}
        >
          {props.pendingCode === entry.code ? 'Triggering…' : 'Trigger'}
        </button>
      ) : (
        <span className="card__desc">
          {entry.availability}: {entry.summary}
        </span>
      )}
    </div>
  )
}

/** One source-grouped card of catalog entries. */
function CatalogGroup(props: {
  readonly group: string
  readonly entries: readonly ErrorCatalogEntryView[]
  readonly pendingCode: string | undefined
  readonly onTrigger: (code: string) => void
}): React.JSX.Element {
  return (
    <div className="card">
      <div className="card__title">{props.group}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {props.entries.map((entry) => (
          <CatalogEntryRow
            key={entry.code}
            entry={entry}
            pendingCode={props.pendingCode}
            onTrigger={props.onTrigger}
          />
        ))}
      </div>
    </div>
  )
}

/** Normalizes a caught trigger rejection into an {@link ApiError}. */
function toApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError('client_error', 0, 'Something went wrong triggering this code.')
}

/** The Errors page's catalog grid. */
export function ErrorCatalogGrid(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getErrorCatalog())
  const [pendingCode, setPendingCode] = useState<string | undefined>(undefined)
  const [outcome, setOutcome] = useState<TriggerOutcome>(undefined)

  /** Fires the trigger for `code` and records the envelope it fails with. */
  function fire(code: string): void {
    setPendingCode(code)
    api
      .triggerError(code)
      .catch((error: unknown) => setOutcome({ code, error: toApiError(error) }))
      .finally(() => setPendingCode(undefined))
  }

  if (state.status === 'loading') {
    return (
      <div role="status" aria-label="Loading error catalog">
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    )
  }

  if (state.status === 'error') {
    return <ErrorBanner error={state.error} />
  }

  return (
    <>
      {outcome !== undefined && (
        <div>
          <div className="card__desc">Last trigger: {outcome.code}</div>
          <ErrorBanner error={outcome.error} />
        </div>
      )}
      {groupCatalog(state.data.entries).map(([group, entries]) => (
        <CatalogGroup
          key={group}
          group={group}
          entries={entries}
          pendingCode={pendingCode}
          onTrigger={fire}
        />
      ))}
    </>
  )
}
