/**
 * @fileoverview The Usage page's spend-by-type donut: `GET /usage/by-type`
 * (the `feature` dimension; this app's transaction types are its feature
 * labels, spec §11 reconciliation) rendered as a Recharts donut. Each
 * slice's color is set directly on its data entry (`fill`), which Recharts
 * reads without a `Cell`/`shape` render callback, so the categorical
 * palette applies during the chart's normal static render pass.
 *
 * @layer components/charts
 */
'use client'

import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useApiQuery } from '@/lib/use-api-query'

import { seriesColor } from './chart-colors'

/** Nano-USD per whole USD (chart-axis conversion only; never a billing computation). */
const NANO_PER_USD = 1_000_000_000

/** The Usage page's spend-by-feature donut. */
export function TypeDonut(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getUsageByType())

  return (
    <Card>
      <CardHeader accent>
        <CardTitle>Spend by type</CardTitle>
        <CardDescription>Billed cost per feature label</CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === 'loading' && (
          <div role="status" aria-label="Loading spend by type">
            <div className="skeleton" style={{ height: 200, marginTop: 12 }} />
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
          <div style={{ height: 200, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,15,15,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                  }}
                />
                <Pie
                  data={state.data.items.map((item, index) => ({
                    name: item.group.feature ?? 'unknown',
                    usd: Number(item.billedCostNanoUsd) / NANO_PER_USD,
                    fill: seriesColor(index),
                  }))}
                  dataKey="usd"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={80}
                  isAnimationActive={false}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
