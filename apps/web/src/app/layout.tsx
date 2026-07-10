/**
 * @fileoverview Root App Router layout. Loads the Geist Sans/Mono fonts as
 * CSS custom properties and forces the design system's dark theme (this
 * design system ships no light mode; `design_system.html` is forced-dark by
 * construction). All page content renders inside the dashboard route group.
 *
 * @layer app/layout
 */
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'

import './globals.css'

export const metadata: Metadata = {
  title: 'nest-ai-tokens-example',
  description: 'AI token metering dashboard: nest-ai-tokens reference app.',
}

/**
 * Root App Router layout: Geist fonts and the forced-dark html shell.
 *
 * @param props Layout props.
 * @param props.children Page or nested layout subtree.
 * @returns The full HTML document shell.
 */
export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
