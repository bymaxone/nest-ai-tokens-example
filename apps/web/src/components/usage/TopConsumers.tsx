/**
 * @fileoverview The Usage page's top-consumers leaderboard:
 * `GET /usage/top-consumers` (the tenant-wide `scope` grouping, ordered by
 * billed spend server-side), rendered as a ranked list of tokens, cost,
 * and call count.
 *
 * @layer components/usage
 */
'use client'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useApiQuery } from '@/lib/use-api-query'

/** The Usage page's top-consumers leaderboard. */
export function TopConsumers(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getTopConsumers())

  return (
    <Card>
      <CardHeader accent>
        <CardTitle>Top consumers</CardTitle>
        <CardDescription>Tenant-wide spend, ranked highest first</CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === 'loading' && (
          <div role="status" aria-label="Loading top consumers">
            <div className="skeleton" style={{ height: 120, marginTop: 12 }} />
          </div>
        )}

        {state.status === 'error' && <ErrorBanner error={state.error} />}

        {state.status === 'ready' && state.data.items.length === 0 && (
          <div className="empty">
            <div className="empty__title">No consumers yet</div>
            <p>Run a command in the Playground to populate the leaderboard.</p>
          </div>
        )}

        {state.status === 'ready' && state.data.items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>scope</TableHead>
                <TableHead>calls</TableHead>
                <TableHead>tokens</TableHead>
                <TableHead>cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.items.map((item, index) => (
                <TableRow key={`${item.group.scope ?? 'unknown'}-${index}`}>
                  <TableCell>{item.group.scope ?? 'unknown'}</TableCell>
                  <TableCell>{item.records}</TableCell>
                  <TableCell>{item.totalTokens.toLocaleString('en-US')}</TableCell>
                  <TableCell>{formatMoney(item.billedCostNanoUsd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
