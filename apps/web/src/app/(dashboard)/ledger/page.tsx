/**
 * @fileoverview Ledger page: filters, the transactions table, the row
 * inspector, and the top-up dialog. `LedgerPageContent` calls
 * `useSearchParams` (the `?focus=` deep link), so Next.js requires it to
 * sit under a `Suspense` boundary even though this route has no server
 * data of its own to stream ahead of it.
 *
 * @layer app/(dashboard)/ledger
 */
import { Suspense } from 'react'

import { LedgerPageContent } from '@/components/ledger/LedgerPageContent'
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/ledger')

/** The Ledger page. */
export default function LedgerPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <Suspense fallback={<div className="skeleton" style={{ height: 240 }} />}>
        <LedgerPageContent />
      </Suspense>
    </PageScaffold>
  )
}
