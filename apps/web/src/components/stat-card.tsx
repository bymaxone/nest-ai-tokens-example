/**
 * @fileoverview The reusable KPI stat tile (design system §06): a label,
 * a mono value, and an optional colored delta line, with the same
 * loading-skeleton and error-message states BalanceCard established.
 * Built on the shadcn/ui {@link Card} surface so every tile shares the
 * project's glass-card chrome; the three states never drift between widgets.
 *
 * @layer components
 */
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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

/** The uppercase caption above every stat value. */
function StatLabel({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
  )
}

/** A single KPI stat tile: label, value, loading/error/ready states. */
export function StatCard({ label, state }: StatCardProps): React.JSX.Element {
  return (
    <Card>
      <CardContent className="p-[18px]">
        {state.status === 'loading' ? (
          <div role="status" aria-label={`Loading ${label}`}>
            <StatLabel label={label} />
            <div className="skeleton mt-2 w-3/5" />
          </div>
        ) : state.status === 'error' ? (
          <div role="alert">
            <StatLabel label={label} />
            <div className="mt-1 text-base font-bold text-[color:var(--red)]">{state.message}</div>
          </div>
        ) : (
          <div>
            <StatLabel label={label} />
            <div className="mt-1 font-mono text-[26px] font-bold leading-tight">{state.value}</div>
            {state.delta !== undefined && (
              <div
                data-tone={state.delta.tone}
                className={cn(
                  'mt-1 text-xs',
                  state.delta.tone === 'up'
                    ? 'text-[color:var(--red)]'
                    : 'text-[color:var(--green)]',
                )}
              >
                {state.delta.text}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
