/**
 * @fileoverview Usage stub page. The by-period chart, by-type donut,
 * by-model bars, top consumers, and system costs land once the api client
 * can call `/usage/*`.
 *
 * @layer app/(dashboard)/usage
 */
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/usage')

/**
 * The Usage stub page.
 *
 * @returns The page scaffold with a placeholder content area.
 */
export default function UsagePage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <div className="empty">
        <div className="empty__title">Content lands next</div>
        <p>The usage charts and leaderboards wire up once the api client is live.</p>
      </div>
    </PageScaffold>
  )
}
