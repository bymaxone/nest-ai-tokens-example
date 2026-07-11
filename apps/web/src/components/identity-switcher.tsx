/**
 * @fileoverview The topbar identity switcher: a dropdown of the four demo
 * users with their tenant badge. Selecting one updates the identity store,
 * which persists it to `localStorage` and feeds the api client's
 * `x-demo-user`/`x-tenant-id` headers.
 *
 * @layer components
 */
'use client'

import { useSyncExternalStore } from 'react'
import type { ChangeEvent } from 'react'

import {
  DEMO_USERS,
  findDemoUser,
  getIdentity,
  getServerSnapshot,
  setIdentity,
  subscribe,
} from '@/lib/identity-store'

/** The demo identity dropdown, wired to the identity store. */
export function IdentitySwitcher(): React.JSX.Element {
  const identity = useSyncExternalStore(subscribe, getIdentity, getServerSnapshot)

  /**
   * Applies the selected option to the identity store, clearing the
   * selection when the placeholder option is chosen.
   *
   * @param event The select change event.
   */
  function handleChange(event: ChangeEvent<HTMLSelectElement>): void {
    const userId = event.target.value
    if (userId === '') {
      setIdentity(null)
      return
    }
    const user = findDemoUser(userId)
    /* v8 ignore next 2 -- unreachable: the select's options are exactly DEMO_USERS' ids */
    if (user === undefined) return
    setIdentity({ userId: user.id, tenantId: user.tenantId })
  }

  return (
    <div className="chip" role="group" aria-label="Demo identity">
      <select
        aria-label="Select demo identity"
        className="chip-select"
        value={identity?.userId ?? ''}
        onChange={handleChange}
      >
        <option value="">Select identity</option>
        {DEMO_USERS.map((user) => (
          <option key={user.id} value={user.id}>
            {user.id} · {user.tenantLabel}
          </option>
        ))}
      </select>
    </div>
  )
}
