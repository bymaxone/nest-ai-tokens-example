/**
 * @fileoverview Playground stub page. The five command cards and the
 * embeddings panel land once the api client can call `/workspace/*`.
 *
 * @layer app/(dashboard)/playground
 */
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'

const NAV_ITEM = requireNavItem('/playground')

/**
 * The Playground stub page.
 *
 * @returns The page scaffold with a placeholder content area.
 */
export default function PlaygroundPage(): React.JSX.Element {
  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <div className="empty">
        <div className="empty__title">Content lands next</div>
        <p>The command cards and embeddings panel wire up once the api client is live.</p>
      </div>
    </PageScaffold>
  )
}
