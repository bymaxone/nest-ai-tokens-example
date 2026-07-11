/**
 * @fileoverview The canonical `ApiError` renderer: code, message, and
 * details, faithfully and never swallowed (rules-of-phase §2). Every page
 * that reads through {@link useApiQuery} or {@link useApiMutation} renders
 * its error state through this one component.
 *
 * @layer components/common
 */
import type { ApiError } from '@/lib/api-client'

/** ErrorBanner props. */
export interface ErrorBannerProps {
  /** The failure to render. */
  readonly error: ApiError
}

/** Renders a canonical error envelope: code, message, and details. */
export function ErrorBanner({ error }: ErrorBannerProps): React.JSX.Element {
  return (
    <div className="toast toast--error" role="alert" style={{ maxWidth: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="level__dot" style={{ color: 'var(--red)' }} />
          <span className="chip mono">{error.code}</span>
          {error.status > 0 && <span className="chip mono">{error.status}</span>}
        </div>
        <div>{error.message}</div>
        {error.details !== undefined && (
          <pre className="mono" style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
            {JSON.stringify(error.details, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
