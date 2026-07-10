/**
 * @fileoverview The Overview page's default-models card: the command and
 * embedding default models from `GET /workspace/models`, each with a
 * pricing badge (USD per 1M tokens, input/output).
 *
 * @layer components/overview
 */
'use client'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useApiQuery } from '@/lib/use-api-query'

/** The Overview page's default command/embedding models with pricing badges. */
export function ModelsBadge(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getModels())

  if (state.status === 'loading') {
    return (
      <div className="card" role="status" aria-label="Loading default models">
        <div className="card__title">Default models</div>
        <div className="skeleton" style={{ width: '80%', marginTop: 8 }} />
        <div className="skeleton" style={{ width: '60%', marginTop: 8 }} />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="card">
        <div className="card__title">Default models</div>
        <ErrorBanner error={state.error} />
      </div>
    )
  }

  const { command, embedding } = state.data
  return (
    <div className="card">
      <div className="card__title">Default models</div>
      <div className="card__desc">Per 1M tokens, input / output</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="chip mono">{command.model}</span>
          <span className="badge">{formatMoney(command.pricing.inputNanoUsdPerMillion)} in</span>
          <span className="badge">{formatMoney(command.pricing.outputNanoUsdPerMillion)} out</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="chip mono">{embedding.model}</span>
          <span className="badge">{formatMoney(embedding.pricing.inputNanoUsdPerMillion)} in</span>
        </div>
      </div>
    </div>
  )
}
