/**
 * @fileoverview Errors stub page. The catalog triggers land once the api
 * client can call `/errors-demo/*`.
 *
 * @layer app/(dashboard)/errors
 */
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/errors')

/**
 * The Errors stub page.
 *
 * @returns The page scaffold with a placeholder content area.
 */
export default function ErrorsPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <div className="empty">
        <div className="empty__title">Content lands next</div>
        <p>The error catalog triggers wire up once the api client is live.</p>
      </div>
    </PageScaffold>
  )
}
