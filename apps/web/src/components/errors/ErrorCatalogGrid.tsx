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
import { useApiQuery } from '@/lib/use-api-query'

import { groupCatalog } from './group-catalog'

/** The most recent trigger's outcome. */
type TriggerOutcome = { readonly code: string; readonly error: ApiError } | undefined

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
      .catch((error: unknown) => {
        const apiError =
          error instanceof ApiError
            ? error
            : new ApiError('client_error', 0, 'Something went wrong triggering this code.')
        setOutcome({ code, error: apiError })
      })
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
        <div key={group} className="card">
          <div className="card__title">{group}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {entries.map((entry) => (
              <div key={entry.code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="chip mono">{entry.code}</span>
                <span className="chip">{entry.httpStatus}</span>
                {entry.availability === 'trigger' ? (
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    disabled={pendingCode === entry.code}
                    onClick={() => fire(entry.code)}
                  >
                    {pendingCode === entry.code ? 'Triggering…' : 'Trigger'}
                  </button>
                ) : (
                  <span className="card__desc">
                    {entry.availability}: {entry.summary}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
