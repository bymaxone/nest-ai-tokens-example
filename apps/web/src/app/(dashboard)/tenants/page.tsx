/**
 * @fileoverview Tenants page: the identity switcher (in the header) and
 * the isolation walkthrough (scenario §13.6).
 *
 * @layer app/(dashboard)/tenants
 */
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'
import { BoundaryCallouts } from '@/components/tenants/BoundaryCallouts'
import { TenantSnapshot } from '@/components/tenants/TenantSnapshot'

const NAV_ITEM = requireNavItem('/tenants')

/** The Tenants page. */
export default function TenantsPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <TenantSnapshot />
      <BoundaryCallouts />
    </PageScaffold>
  )
}
