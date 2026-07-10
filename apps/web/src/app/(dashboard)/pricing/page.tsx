/**
 * @fileoverview Pricing stub page. The current-price table, the history
 * timeline, and the update form land once the api client can call
 * `/pricing/*`.
 *
 * @layer app/(dashboard)/pricing
 */
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/pricing')

/**
 * The Pricing stub page.
 *
 * @returns The page scaffold with a placeholder content area.
 */
export default function PricingPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <div className="empty">
        <div className="empty__title">Content lands next</div>
        <p>The price catalog and history timeline wire up once the api client is live.</p>
      </div>
    </PageScaffold>
  )
}
