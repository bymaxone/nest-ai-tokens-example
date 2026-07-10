/**
 * @fileoverview The standard page scaffold every dashboard route wraps its
 * content in: a title, a one-line description, an optional actions slot,
 * and the content area itself.
 *
 * @layer components/shell
 */
import type { ReactNode } from 'react'

/** PageScaffold props. */
export interface PageScaffoldProps {
  /** The page title (matches the sidebar label). */
  readonly title: string
  /** The one-line description shown under the title. */
  readonly description: string
  /** Optional page-level actions rendered beside the title. */
  readonly actions?: ReactNode
  /** The page content. */
  readonly children: ReactNode
}

/** Title, description, optional actions, and the content area. */
export function PageScaffold({
  title,
  description,
  actions,
  children,
}: PageScaffoldProps): React.JSX.Element {
  return (
    <div className="main__inner">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1>{title}</h1>
          {actions !== undefined && <div>{actions}</div>}
        </div>
        <p>{description}</p>
      </div>
      {children}
    </div>
  )
}
