/**
 * @fileoverview Guard helper for routes that need the simulated identity:
 * the middleware leaves `req.user` undefined when no `x-demo-user` header
 * was sent (so guard no-user paths stay reachable), and identity-scoped
 * endpoints reject that case with a 401 naming the header.
 *
 * @layer identity
 */
import { UnauthorizedException } from '@nestjs/common'

import type { AuthenticatedRequest, DemoIdentity } from './identity.middleware.js'

/**
 * Return the request identity or reject with 401.
 *
 * @param request The request the identity middleware processed.
 * @returns The attached demo identity.
 * @throws {UnauthorizedException} when no identity is attached.
 */
export function requireIdentity(request: AuthenticatedRequest): DemoIdentity {
  if (request.user === undefined) {
    throw new UnauthorizedException(
      'A demo identity is required for this endpoint. Send the x-demo-user header.',
    )
  }
  return request.user
}
