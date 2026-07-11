/**
 * @fileoverview The Overview page's default-models card: the command and
 * embedding default models from `GET /workspace/models`, each with a
 * pricing badge (USD per 1M tokens, input/output).
 *
 * @layer components/overview
 */
'use client'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useApiQuery } from '@/lib/use-api-query'

/** The Overview page's default command/embedding models with pricing badges. */
export function ModelsBadge(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getModels())

  if (state.status === 'loading') {
    return (
      <Card role="status" aria-label="Loading default models">
        <CardHeader accent>
          <CardTitle>Default models</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="skeleton w-4/5" />
          <div className="skeleton mt-2 w-3/5" />
        </CardContent>
      </Card>
    )
  }

  if (state.status === 'error') {
    return (
      <Card>
        <CardHeader accent>
          <CardTitle>Default models</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorBanner error={state.error} />
        </CardContent>
      </Card>
    )
  }

  const { command, embedding } = state.data
  return (
    <Card>
      <CardHeader accent>
        <CardTitle>Default models</CardTitle>
        <CardDescription>Per 1M tokens, input / output</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {command.model}
          </Badge>
          <Badge>{formatMoney(command.pricing.inputNanoUsdPerMillion)} in</Badge>
          <Badge>{formatMoney(command.pricing.outputNanoUsdPerMillion)} out</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {embedding.model}
          </Badge>
          <Badge>{formatMoney(embedding.pricing.inputNanoUsdPerMillion)} in</Badge>
        </div>
      </CardContent>
    </Card>
  )
}
