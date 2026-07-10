/**
 * @fileoverview The Overview page's 30-day spend sparkline: a compact
 * Recharts area chart over `GET /usage/by-period?granularity=day`, the
 * caller's own daily billed cost for the trailing 30 days. Uses Recharts'
 * built-in tooltip (static style props only, no custom render callback):
 * a custom `content`/`formatter` function only ever fires on a real
 * pointer hover, which a headless jsdom test cannot reliably simulate
 * against a zero-size layout, so it would sit permanently uncovered.
 *
 * @layer components/charts
 */
'use client'

import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import { useApiQuery } from '@/lib/use-api-query'

/** Days of history the sparkline covers. */
const WINDOW_DAYS = 30

/** One rendered point: the day bucket label and its billed cost in plain USD (chart geometry only). */
interface SparklinePoint {
  readonly label: string
  readonly usd: number
}

/** Nano-USD per whole USD (chart-axis conversion only; never a billing computation). */
const NANO_PER_USD = 1_000_000_000

/**
 * The ISO instants covering the trailing {@link WINDOW_DAYS} days ending now.
 *
 * @returns The `from`/`to` bounds for the by-period query.
 */
function trailingWindow(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** The Overview page's 30-day daily spend sparkline. */
export function UsageSparkline(): React.JSX.Element {
  const { state } = useApiQuery(() => {
    const { from, to } = trailingWindow()
    return api.getUsageByPeriod({ granularity: 'day', from, to })
  })

  if (state.status === 'loading') {
    return (
      <div className="card" role="status" aria-label="Loading usage sparkline">
        <div className="card__title">30-day spend</div>
        <div className="skeleton" style={{ height: 120, marginTop: 8 }} />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="card">
        <div className="card__title">30-day spend</div>
        <ErrorBanner error={state.error} />
      </div>
    )
  }

  if (state.data.items.length === 0) {
    return (
      <div className="card">
        <div className="card__title">30-day spend</div>
        <div className="empty">
          <div className="empty__title">No usage yet</div>
          <p>Run a command in the Playground to start the trend.</p>
        </div>
      </div>
    )
  }

  const points: SparklinePoint[] = state.data.items.map((item) => ({
    label: item.group.day ?? '',
    usd: Number(item.billedCostNanoUsd) / NANO_PER_USD,
  }))

  return (
    <div className="card">
      <div className="card__title">30-day spend</div>
      <div className="card__desc">Billed cost per day, {points.length} day(s) with usage</div>
      <div style={{ height: 140, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="sparklineFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff6224" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#ff6224" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              contentStyle={{
                background: 'rgba(15,15,15,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
              }}
              labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            />
            <Area
              type="monotone"
              dataKey="usd"
              name="USD"
              stroke="#ff6224"
              strokeWidth={2}
              fill="url(#sparklineFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
