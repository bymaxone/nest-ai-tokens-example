/**
 * @fileoverview Usage page: the by-period chart (granularity switch), the
 * by-type donut, the by-model bars, the top-consumers leaderboard, and
 * the system-costs-by-category panel.
 *
 * @layer app/(dashboard)/usage
 */
import { ModelBars } from '@/components/charts/ModelBars'
import { PeriodChart } from '@/components/charts/PeriodChart'
import { TypeDonut } from '@/components/charts/TypeDonut'
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'
import { SystemCostsPanel } from '@/components/usage/SystemCostsPanel'
import { TopConsumers } from '@/components/usage/TopConsumers'

const NAV_ITEM = requireNavItem('/usage')

/** The Usage page. */
export default function UsagePage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <PeriodChart />
      <div className="grid-2">
        <TypeDonut />
        <ModelBars />
      </div>
      <div className="grid-2">
        <TopConsumers />
        <SystemCostsPanel />
      </div>
    </PageScaffold>
  )
}
