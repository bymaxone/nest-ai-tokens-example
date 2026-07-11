/**
 * @fileoverview The Usage page's by-period chart: a granularity switch
 * (day/week/month, the design system's `.tabs` recipe) driving
 * `GET /usage/by-period`, rendered as a single-series bar chart of billed
 * cost per bucket.
 *
 * @layer components/charts
 */
'use client'

import { useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import type { ByPeriodQuery } from '@/lib/api-types'
import { useApiQuery } from '@/lib/use-api-query'

/** The granularities the tab switch offers, in display order. */
const GRANULARITIES: readonly NonNullable<ByPeriodQuery['granularity']>[] = ['day', 'week', 'month']

/** One rendered bucket: its label and billed cost in plain USD (chart geometry only). */
interface PeriodPoint {
  readonly label: string
  readonly usd: number
}

/** Nano-USD per whole USD (chart-axis conversion only; never a billing computation). */
const NANO_PER_USD = 1_000_000_000

/** The Usage page's granularity-switchable spend-over-time chart. */
export function PeriodChart(): React.JSX.Element {
  const [granularity, setGranularity] = useState<NonNullable<ByPeriodQuery['granularity']>>('day')
  const { state } = useApiQuery(() => api.getUsageByPeriod({ granularity }), granularity)

  return (
    <Card>
      <CardHeader accent>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Spend over time</CardTitle>
            <CardDescription>Billed cost per {granularity} bucket</CardDescription>
          </div>
          <div className="tabs" role="tablist" aria-label="Granularity">
            {GRANULARITIES.map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={option === granularity}
                className={`tab${option === granularity ? ' tab--active' : ''}`}
                onClick={() => setGranularity(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {state.status === 'loading' && (
          <div role="status" aria-label="Loading spend over time">
            <div className="skeleton" style={{ height: 220, marginTop: 12 }} />
          </div>
        )}

        {state.status === 'error' && <ErrorBanner error={state.error} />}

        {state.status === 'ready' && state.data.items.length === 0 && (
          <div className="empty">
            <div className="empty__title">No usage yet</div>
            <p>Run a command in the Playground to populate this chart.</p>
          </div>
        )}

        {state.status === 'ready' && state.data.items.length > 0 && (
          <div style={{ height: 220, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={state.data.items.map((item): PeriodPoint => ({
                  label: item.group[granularity] ?? '',
                  usd: Number(item.billedCostNanoUsd) / NANO_PER_USD,
                }))}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,15,15,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                />
                <Bar
                  dataKey="usd"
                  name="USD"
                  fill="#ff6224"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
