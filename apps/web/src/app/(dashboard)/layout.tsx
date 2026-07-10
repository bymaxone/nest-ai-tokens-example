/**
 * @fileoverview The dashboard shell: topbar, sidebar, and the fluid main
 * area every dashboard route renders inside, per the design-system shell
 * recipe (64px topbar, 250px sidebar, fluid main).
 *
 * @layer app/(dashboard)/layout
 */
import type { ReactNode } from 'react'

import { Header } from '@/components/shell/Header'
import { Sidebar } from '@/components/shell/Sidebar'

/**
 * Wraps every dashboard route in the shared topbar/sidebar/main shell.
 *
 * @param props Layout props.
 * @param props.children The active route's page content.
 * @returns The dashboard shell.
 */
export default function DashboardLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="shell">
      <Header />
      <div className="shell__body">
        <Sidebar />
        <main className="main">{children}</main>
      </div>
    </div>
  )
}
