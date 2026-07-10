/**
 * @fileoverview Static demo user registry backing the identity SIMULATION.
 * Mirrors the seeded demo domain: three tenant users created by the Prisma
 * seed (ada/grace at acme, linus at globex) plus the global null-tenant
 * admin (root) defined by the spec's multi-tenant model. This is fixture
 * data for a reference app, not an account store.
 *
 * @layer identity
 */

/** One resolvable demo identity. */
export interface DemoUser {
  /** Stable user id, also the seeded usage-record scope id. */
  readonly id: string
  /** Tenant the user belongs to; `null` marks the global admin. */
  readonly tenantId: string | null
}

/** Every identity the demo middleware accepts. */
export const DEMO_USERS: readonly DemoUser[] = [
  { id: 'ada', tenantId: 'acme' },
  { id: 'grace', tenantId: 'acme' },
  { id: 'linus', tenantId: 'globex' },
  { id: 'root', tenantId: null },
]

/** The accepted demo user ids, for value-free 401 bodies and docs. */
export const DEMO_USER_IDS: readonly string[] = DEMO_USERS.map((user) => user.id)

/**
 * Look up a demo user by id.
 *
 * @param id The candidate user id from the `x-demo-user` header.
 * @returns The matching user, or `undefined` when the id is not registered.
 */
export function findDemoUser(id: string): DemoUser | undefined {
  return DEMO_USERS.find((user) => user.id === id)
}
