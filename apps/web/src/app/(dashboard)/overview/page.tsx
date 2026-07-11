/**
 * @fileoverview Overview page: the balance tile, the tokens-consumed and
 * cost-USD stat cards, the 30-day spend sparkline, and the default-models
 * card. Every widget fetches through the typed client and refetches on an
 * identity switch (the BalanceCard pattern, `useApiQuery`).
 *
 * @layer app/(dashboard)/overview
 */
import { BalanceCard } from '@/components/overview/BalanceCard'
import { ModelsBadge } from '@/components/overview/ModelsBadge'
import { TotalsStats } from '@/components/overview/TotalsStats'
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'
import { UsageSparkline } from '@/components/charts/UsageSparkline'

const NAV_ITEM = requireNavItem('/overview')

/**
 * The Overview page.
 *
 * @returns The page scaffold with the balance tile, totals, sparkline, and default models.
 */
export default function OverviewPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <div className="grid-4">
        <BalanceCard />
        <TotalsStats />
      </div>
      <div className="grid-2">
        <UsageSparkline />
        <ModelsBadge />
      </div>
    </PageScaffold>
  )
}
