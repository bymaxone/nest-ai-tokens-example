/**
 * @fileoverview The 250px glass nav rail: the eight dashboard routes with an
 * orange active-item highlight, per the design-system shell recipe. Hidden
 * below the responsive breakpoint (the CSS handles the collapse; §7.2
 * accepts a hidden rail on narrow viewports rather than an overlay, since
 * pages are stubs until phase 08).
 *
 * @layer components/shell
 */
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { NAV_ITEMS } from './nav-items'

/**
 * Whether `href` is the active route for `pathname`: an exact match, or a
 * nested child of it.
 *
 * @param href The nav entry's route.
 * @param pathname The current pathname.
 * @returns True when the entry should render as active.
 */
function isActiveRoute(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** The dashboard sidebar: eight nav entries, active-route highlight. */
export function Sidebar(): React.JSX.Element {
  const pathname = usePathname()
  return (
    <aside className="sidebar" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => {
        const active = isActiveRoute(item.href, pathname)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={active ? 'nav-item nav-item--active' : 'nav-item'}
          >
            <Icon className="nav-item__icon" />
            {item.label}
          </Link>
        )
      })}
      <div className="sidebar__spacer" />
      <div className="sidebar__footer">
        <span>nest-ai-tokens-example</span>
      </div>
    </aside>
  )
}
