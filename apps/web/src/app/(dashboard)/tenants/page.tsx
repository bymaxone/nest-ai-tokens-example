/**
 * @fileoverview Tenants stub page. The identity switcher and the tenant
 * isolation walkthrough land in a later task.
 *
 * @layer app/(dashboard)/tenants
 */
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/tenants')

/**
 * The Tenants stub page.
 *
 * @returns The page scaffold with a placeholder content area.
 */
export default function TenantsPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <div className="empty">
        <div className="empty__title">Content lands next</div>
        <p>The identity switcher and isolation walkthrough wire up in a later task.</p>
      </div>
    </PageScaffold>
  )
}
