/**
 * @fileoverview Overview stub page. Real content (balance, tokens consumed,
 * cost, sparkline) lands with the api client wiring in a later task.
 *
 * @layer app/(dashboard)/overview
 */
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/overview')

/**
 * The Overview stub page.
 *
 * @returns The page scaffold with a placeholder content area.
 */
export default function OverviewPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <div className="empty">
        <div className="empty__title">Content lands next</div>
        <p>The balance, usage, and cost widgets wire up once the api client is live.</p>
      </div>
    </PageScaffold>
  )
}
