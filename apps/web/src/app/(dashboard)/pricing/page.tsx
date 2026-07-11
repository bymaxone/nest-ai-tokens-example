/**
 * @fileoverview Pricing page: the current pricing table, the selected
 * model's history timeline, and the admin update form.
 *
 * @layer app/(dashboard)/pricing
 */
import { PricingPageContent } from '@/components/pricing/PricingPageContent'
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/pricing')

/** The Pricing page. */
export default function PricingPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <PricingPageContent />
    </PageScaffold>
  )
}
