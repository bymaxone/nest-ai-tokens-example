/**
 * @fileoverview The reusable KPI stat tile (design system §06): a label,
 * a mono value, and an optional colored delta line, with the same
 * loading-skeleton and error-message states BalanceCard established.
 * Every stat card on Overview and Usage renders through this component so
 * the three states never drift between widgets.
 *
 * @layer components
 */

/** One stat tile's presentational state, decided by the caller's data fetch. */
export type StatCardState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'ready'
      readonly value: string
      /** An optional trend line under the value (e.g. "▲ 12 today"). */
      readonly delta?: { readonly text: string; readonly tone: 'up' | 'ok' }
    }

/** StatCard props. */
export interface StatCardProps {
  /** The uppercase label above the value. */
  readonly label: string
  /** The tile's current state. */
  readonly state: StatCardState
}

/** A single KPI stat tile: label, value, loading/error/ready states. */
export function StatCard({ label, state }: StatCardProps): React.JSX.Element {
  if (state.status === 'loading') {
    return (
      <div className="stat" role="status" aria-label={`Loading ${label}`}>
        <div className="stat__label">{label}</div>
        <div className="skeleton" style={{ width: '60%', marginTop: 8 }} />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="stat" role="alert">
        <div className="stat__label">{label}</div>
        <div className="stat__value" style={{ fontSize: 16, color: 'var(--red)' }}>
          {state.message}
        </div>
      </div>
    )
  }

  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{state.value}</div>
      {state.delta !== undefined && (
        <div className={`stat__delta stat__delta--${state.delta.tone}`}>{state.delta.text}</div>
      )}
    </div>
  )
}
