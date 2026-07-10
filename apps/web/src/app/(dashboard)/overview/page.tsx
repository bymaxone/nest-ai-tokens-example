/**
 * @fileoverview Overview page. The balance tile proves the live api
 * round-trip (`GET /usage/balance` through the typed client); the tokens
 * consumed, cost, and sparkline widgets land in a later phase.
 *
 * @layer app/(dashboard)/overview
 */
import { BalanceCard } from '@/components/overview/BalanceCard'
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/overview')

/**
 * The Overview page.
 *
 * @returns The page scaffold with the live balance tile.
 */
export default function OverviewPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <div className="grid-4">
        <BalanceCard />
      </div>
    </PageScaffold>
  )
}
