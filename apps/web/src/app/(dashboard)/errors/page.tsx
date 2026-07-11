/**
 * @fileoverview Errors page: the grouped error-catalog grid with its
 * on-demand triggers (scenario §13.8).
 *
 * @layer app/(dashboard)/errors
 */
import { ErrorCatalogGrid } from '@/components/errors/ErrorCatalogGrid'
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/errors')

/** The Errors page. */
export default function ErrorsPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <ErrorCatalogGrid />
    </PageScaffold>
  )
}
