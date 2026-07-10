/**
 * @fileoverview The localStorage-backed demo identity store: which demo
 * user (and their tenant) the switcher currently has selected. Persists
 * only the demo ids the api's `x-demo-user`/`x-tenant-id` headers already
 * accept: never anything secret, never a token. A module-level singleton
 * with a subscribe API so the switcher and the api client's header
 * provider both react to a selection change.
 *
 * @layer lib
 */

/** One demo identity the switcher can select. */
export interface DemoUser {
  /** The `x-demo-user` header value. */
  readonly id: string
  /** The user's tenant; `null` is the global (null-tenant) admin. */
  readonly tenantId: string | null
  /** Human-readable tenant badge; `'global'` for the null-tenant admin. */
  readonly tenantLabel: string
}

/** The four demo identities the api's identity middleware accepts. */
export const DEMO_USERS: readonly DemoUser[] = [
  { id: 'ada', tenantId: 'acme', tenantLabel: 'acme' },
  { id: 'grace', tenantId: 'acme', tenantLabel: 'acme' },
  { id: 'linus', tenantId: 'globex', tenantLabel: 'globex' },
  { id: 'root', tenantId: null, tenantLabel: 'global' },
]

/** The persisted selection: a demo user id plus the effective tenant. */
export interface Identity {
  readonly userId: string
  readonly tenantId: string | null
}

/** A listener notified on every selection change (including to `null`). */
type IdentityListener = (identity: Identity | null) => void

/** The localStorage key the selection persists under. */
const STORAGE_KEY = 'nest-ai-tokens-example:identity'

let current: Identity | null = null
let isHydrated = false
const listeners = new Set<IdentityListener>()

/**
 * Whether `value` has the shape of a persisted {@link Identity}.
 *
 * @param value The candidate value (parsed from localStorage).
 * @returns True when `value` is a well-formed `Identity`.
 */
function isIdentity(value: unknown): value is Identity {
  if (typeof value !== 'object' || value === null) return false
  const { userId, tenantId } = value as { userId?: unknown; tenantId?: unknown }
  return typeof userId === 'string' && (tenantId === null || typeof tenantId === 'string')
}

/**
 * Loads the persisted selection on first access. A no-op on the server
 * (`window` is undefined during SSR) and on a corrupted or absent value.
 */
function hydrate(): void {
  if (isHydrated) return
  isHydrated = true
  if (typeof window === 'undefined') return
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) return
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isIdentity(parsed)) current = parsed
  } catch {
    // Corrupted value: start from no identity rather than throwing.
  }
}

/**
 * Look up a demo user by id.
 *
 * @param userId The candidate id.
 * @returns The matching demo user, or `undefined` when unregistered.
 */
export function findDemoUser(userId: string): DemoUser | undefined {
  return DEMO_USERS.find((user) => user.id === userId)
}

/**
 * The currently selected identity, hydrating from localStorage on first
 * call.
 *
 * @returns The selection, or `null` when none is set.
 */
export function getIdentity(): Identity | null {
  hydrate()
  return current
}

/**
 * Sets (or clears) the selection, persists it, and notifies every
 * subscriber.
 *
 * @param next The new selection, or `null` to clear it.
 */
export function setIdentity(next: Identity | null): void {
  hydrate()
  current = next
  if (typeof window !== 'undefined') {
    if (next === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  for (const listener of listeners) listener(current)
}

/**
 * Subscribes to selection changes (for `useSyncExternalStore`).
 *
 * @param listener Called with the new selection on every change.
 * @returns An unsubscribe function.
 */
export function subscribe(listener: IdentityListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Projects a selection into the api client's request headers.
 *
 * @param identity The current selection.
 * @returns `{}` when `identity` is `null`; otherwise the demo headers.
 */
export function identityHeaders(identity: Identity | null): Record<string, string> {
  if (identity === null) return {}
  const headers: Record<string, string> = { 'x-demo-user': identity.userId }
  if (identity.tenantId !== null) headers['x-tenant-id'] = identity.tenantId
  return headers
}

/**
 * The server-render snapshot for `useSyncExternalStore` consumers: no
 * selection ever exists on the server pass.
 *
 * @returns Always `null`.
 */
export function getServerSnapshot(): null {
  return null
}
