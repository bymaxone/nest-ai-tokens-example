/**
 * @fileoverview Ledger stub page. The filterable transaction table and the
 * row inspector land once the api client can call `/ledger/*`.
 *
 * @layer app/(dashboard)/ledger
 */
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/ledger')

/**
 * The Ledger stub page.
 *
 * @returns The page scaffold with a placeholder content area.
 */
export default function LedgerPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <div className="empty">
        <div className="empty__title">Content lands next</div>
        <p>The transaction table and row inspector wire up once the api client is live.</p>
      </div>
    </PageScaffold>
  )
}
