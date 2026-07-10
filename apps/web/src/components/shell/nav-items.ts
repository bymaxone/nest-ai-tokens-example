/**
 * @fileoverview The eight-entry dashboard navigation table: route, label,
 * icon, and the one-line description each stub page renders (spec §14).
 * The single source of truth for both the sidebar and the stub pages, so
 * the route list and the page titles can never drift apart.
 *
 * @layer components/shell
 */
import type { ComponentType } from 'react'

import {
  ErrorsIcon,
  LedgerIcon,
  OverviewIcon,
  PlaygroundIcon,
  PricingIcon,
  QuotaIcon,
  TenantsIcon,
  UsageIcon,
} from './nav-icons'
import type { NavIconProps } from './nav-icons'

/** One sidebar entry: route, label, icon, and the stub page's description. */
export interface NavItem {
  /** Human-readable label shown in the sidebar and the page header. */
  readonly label: string
  /** App Router route the entry links to. */
  readonly href: string
  /** The icon rendered beside the label. */
  readonly icon: ComponentType<NavIconProps>
  /** One-line description rendered under the stub page title. */
  readonly description: string
}

/** The eight dashboard routes, in sidebar order (spec §14). */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Overview',
    href: '/overview',
    icon: OverviewIcon,
    description: 'Balance, tokens consumed, cost in USD, and the usage sparkline.',
  },
  {
    label: 'Playground',
    href: '/playground',
    icon: PlaygroundIcon,
    description: 'Run the five text commands and the embeddings panel against the mock provider.',
  },
  {
    label: 'Ledger',
    href: '/ledger',
    icon: LedgerIcon,
    description: 'The filterable, paginated transaction ledger with refund and top-up actions.',
  },
  {
    label: 'Pricing',
    href: '/pricing',
    icon: PricingIcon,
    description: 'Current price catalog, per-model history, and the admin price update form.',
  },
  {
    label: 'Usage',
    href: '/usage',
    icon: UsageIcon,
    description: 'Spend by period, type, and model, plus top consumers and system costs.',
  },
  {
    label: 'Quota Lab',
    href: '/quota',
    icon: QuotaIcon,
    description: 'Wallet and budget status, the estimator variants, and the drain/top-up lab.',
  },
  {
    label: 'Tenants',
    href: '/tenants',
    icon: TenantsIcon,
    description: 'Switch demo identity and walk through the tenant isolation guarantees.',
  },
  {
    label: 'Errors',
    href: '/errors',
    icon: ErrorsIcon,
    description: 'Trigger every catalog error code on demand and inspect the canonical envelope.',
  },
] as const

/**
 * Look up a nav entry by its route. Every stub page reads its title and
 * description from here so the sidebar and the pages can never drift.
 *
 * @param href The route to look up.
 * @returns The matching entry.
 * @throws {Error} When `href` is not one of the eight dashboard routes.
 */
export function requireNavItem(href: string): NavItem {
  const item = NAV_ITEMS.find((entry) => entry.href === href)
  if (item === undefined) {
    throw new Error(`No nav item registered for route "${href}".`)
  }
  return item
}
