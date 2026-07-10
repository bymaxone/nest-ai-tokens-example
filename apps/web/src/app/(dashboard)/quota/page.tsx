/**
 * @fileoverview Quota Lab stub page. The wallet/budget status, estimator
 * variants, and drain/top-up lab land once the api client can call
 * `/quota/*`.
 *
 * @layer app/(dashboard)/quota
 */
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/quota')

/**
 * The Quota Lab stub page.
 *
 * @returns The page scaffold with a placeholder content area.
 */
export default function QuotaPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <div className="empty">
        <div className="empty__title">Content lands next</div>
        <p>The wallet/budget status and estimator lab wire up once the api client is live.</p>
      </div>
    </PageScaffold>
  )
}
