/**
 * @fileoverview The Usage page's spend-by-model bar chart:
 * `GET /usage/by-model`, one bar per model, single brand color (the
 * categories are already distinguished by their x-axis labels).
 *
 * @layer components/charts
 */
'use client'

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useApiQuery } from '@/lib/use-api-query'

/** Nano-USD per whole USD (chart-axis conversion only; never a billing computation). */
const NANO_PER_USD = 1_000_000_000

/** The Usage page's spend-by-model bar chart. */
export function ModelBars(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getUsageByModel())

  return (
    <Card>
      <CardHeader accent>
        <CardTitle>Spend by model</CardTitle>
        <CardDescription>Billed cost per model</CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === 'loading' && (
          <div role="status" aria-label="Loading spend by model">
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
              <BarChart
                data={state.data.items.map((item) => ({
                  model: item.group.model ?? 'unknown',
                  usd: Number(item.billedCostNanoUsd) / NANO_PER_USD,
                }))}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <XAxis dataKey="model" stroke="rgba(255,255,255,0.4)" fontSize={11} />
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
                  fill="#60a5fa"
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
