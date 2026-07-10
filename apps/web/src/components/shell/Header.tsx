/**
 * @fileoverview The 64px topbar: the brand mark plus a right-hand slot for
 * the identity switcher (wired in a later task), per the design-system
 * shell recipe.
 *
 * @layer components/shell
 */
import Link from 'next/link'
import type { ReactNode } from 'react'

/** Header props. */
export interface HeaderProps {
  /** Rendered on the right side of the topbar (the switcher, once wired). */
  readonly rightSlot?: ReactNode
}

/** The dashboard topbar: brand mark plus a right-hand slot. */
export function Header({ rightSlot }: HeaderProps): React.JSX.Element {
  return (
    <header className="topbar">
      <Link className="brand" href="/overview">
        <span className="brand__mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="#ff6224"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="brand__name">nest-ai-tokens-example</span>
      </Link>
      <div className="topbar__right">{rightSlot}</div>
    </header>
  )
}
