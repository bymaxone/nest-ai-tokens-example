/**
 * @fileoverview Quota Lab page: the guard-decision inputs and the
 * estimator lab (scenario §13.5).
 *
 * @layer app/(dashboard)/quota
 */
import { QuotaPageContent } from '@/components/quota/QuotaPageContent'
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/quota')

/** The Quota Lab page. */
export default function QuotaPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <QuotaPageContent />
    </PageScaffold>
  )
}
