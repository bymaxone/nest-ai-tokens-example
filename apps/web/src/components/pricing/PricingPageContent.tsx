/**
 * @fileoverview The Pricing page's interactive content: the current
 * pricing table, the selected model's history timeline, and the update
 * form. Kept out of `app/**` (route shells are thin composition only, per
 * the coverage config) so it is unit tested directly.
 *
 * @layer components/pricing
 */
'use client'

import { useState } from 'react'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { api } from '@/lib/api'
import type { PriceRowView } from '@/lib/api-types'
import { useApiQuery } from '@/lib/use-api-query'

import { CurrentPricingTable } from './CurrentPricingTable'
import { HistoryTimeline } from './HistoryTimeline'
import { UpdatePricingForm } from './UpdatePricingForm'

/** The Pricing page's table, timeline, and update form. */
export function PricingPageContent(): React.JSX.Element {
  const { state, refetch } = useApiQuery(() => api.getCurrentPricing())
  const [selected, setSelected] = useState<PriceRowView | undefined>(undefined)

  return (
    <>
      <div className="card">
        <div className="card__title">Current pricing</div>
        {state.status === 'loading' && (
          <div role="status" aria-label="Loading current pricing">
            <div className="skeleton" style={{ height: 160, marginTop: 12 }} />
          </div>
        )}
        {state.status === 'error' && <ErrorBanner error={state.error} />}
        {state.status === 'ready' && (
          <CurrentPricingTable items={state.data.items} onSelect={setSelected} />
        )}
      </div>

      {selected !== undefined && <HistoryTimeline row={selected} />}

      <UpdatePricingForm onUpdated={refetch} />
    </>
  )
}
