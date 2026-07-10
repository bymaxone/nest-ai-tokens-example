/**
 * @fileoverview Inline SVG icons for the sidebar nav entries. Outline-style,
 * 24x24 viewBox, `stroke="currentColor"`: the same convention
 * `design_system.html` uses for its nav-item icons, so no icon library
 * dependency is needed for eight simple glyphs.
 *
 * @layer components/shell
 */
import type { SVGProps } from 'react'

/** Props every nav icon accepts (only the class the sidebar applies). */
export type NavIconProps = Pick<SVGProps<SVGSVGElement>, 'className'>

/** Shared wrapper attributes for every nav icon. */
function iconProps(className: NavIconProps['className']): SVGProps<SVGSVGElement> {
  return {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
}

/** Four-square grid: Overview. */
export function OverviewIcon({ className }: NavIconProps): React.JSX.Element {
  return (
    <svg {...iconProps(className)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

/** Lightning bolt: Playground. */
export function PlaygroundIcon({ className }: NavIconProps): React.JSX.Element {
  return (
    <svg {...iconProps(className)}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
    </svg>
  )
}

/** Three stacked lines: Ledger. */
export function LedgerIcon({ className }: NavIconProps): React.JSX.Element {
  return (
    <svg {...iconProps(className)}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  )
}

/** Price tag: Pricing. */
export function PricingIcon({ className }: NavIconProps): React.JSX.Element {
  return (
    <svg {...iconProps(className)}>
      <path d="M20.59 13.41 12 22l-9-9V4a1 1 0 0 1 1-1h9l9 9a2 2 0 0 1 0 2.41Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  )
}

/** Ascending bars: Usage. */
export function UsageIcon({ className }: NavIconProps): React.JSX.Element {
  return (
    <svg {...iconProps(className)}>
      <path d="M3 3v18h18" />
      <rect x="7" y="13" width="3" height="5" />
      <rect x="12" y="9" width="3" height="9" />
      <rect x="17" y="5" width="3" height="13" />
    </svg>
  )
}

/** Bell (budget/alert metaphor): Quota Lab. */
export function QuotaIcon({ className }: NavIconProps): React.JSX.Element {
  return (
    <svg {...iconProps(className)}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

/** Building: Tenants. */
export function TenantsIcon({ className }: NavIconProps): React.JSX.Element {
  return (
    <svg {...iconProps(className)}>
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
      <path d="M2 21h20" />
      <path d="M9 8h1M9 12h1M14 8h1M14 12h1M9 16h1M14 16h1" />
    </svg>
  )
}

/** Alert triangle: Errors. */
export function ErrorsIcon({ className }: NavIconProps): React.JSX.Element {
  return (
    <svg {...iconProps(className)}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
