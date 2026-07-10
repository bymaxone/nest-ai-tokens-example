/**
 * @fileoverview Root route redirect. The dashboard shell and every page live
 * under the `(dashboard)` route group; `/` always forwards to the Overview
 * page so the app has one canonical landing route.
 *
 * @layer app/page
 */
import { redirect } from 'next/navigation'

/**
 * Redirects `/` to `/overview`.
 *
 * @returns Never returns: `redirect` throws Next.js's internal control-flow signal.
 */
export default function RootPage(): never {
  redirect('/overview')
}
