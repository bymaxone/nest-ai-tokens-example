/**
 * @fileoverview The shared {@link ApiClient} singleton every page imports.
 * Its header provider reads the identity store on every request, so the
 * switcher's selection travels as `x-demo-user`/`x-tenant-id` without any
 * page wiring headers by hand.
 *
 * @layer lib
 */
import { ApiClient } from './api-client'
import { getIdentity, identityHeaders } from './identity-store'

/** The api client every dashboard page calls through. */
export const api = new ApiClient({
  headerProvider: () => identityHeaders(getIdentity()),
})
