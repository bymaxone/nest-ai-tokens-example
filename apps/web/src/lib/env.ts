/**
 * @fileoverview The single module allowed to read `process.env` in the web
 * app. Every `NEXT_PUBLIC_*` value the dashboard needs is resolved here once
 * so no other module touches `process.env` directly (the workspace-wide
 * invariant grep excludes this file by name).
 *
 * @layer lib
 */

/** The API origin used when `NEXT_PUBLIC_API_URL` is not set (local dev). */
const DEFAULT_API_URL = 'http://localhost:3001'

/**
 * The backend API origin the dashboard talks to. Baked in at build time by
 * Next.js (`NEXT_PUBLIC_*` variables are inlined into the client bundle).
 *
 * @returns The configured API origin, or the local dev default.
 */
export function getApiUrl(): string {
  // Dot access is required: Next.js inlines NEXT_PUBLIC_* values into the
  // client bundle only for the literal process.env.NAME form.
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL
}
