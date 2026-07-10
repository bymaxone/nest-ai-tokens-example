/**
 * @fileoverview Demo identity middleware. THIS IS A SIMULATION: it turns two
 * plain request headers (`x-demo-user`, `x-tenant-id`) into `req.user` so the
 * dashboard can switch identities without an auth stack. Headers are NOT a
 * trust boundary; nothing here verifies anything. A real service must
 * materialize `req.user` from verified credentials instead (for example with
 * `@bymax-one/nest-auth` JWT claims), which is exactly the shape the library's
 * `scopeResolver` expects to read.
 *
 * @layer identity
 */
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

import { DEMO_USER_IDS, findDemoUser } from './demo-users.js'
import type { DemoUser } from './demo-users.js'
import { tenantRequiredError } from './tenant-policy.js'
import { ENV_CONFIG } from '../config/env.js'
import type { EnvConfig } from '../config/env.js'

/** The identity this middleware attaches to the request. */
export interface DemoIdentity {
  /** The resolved demo user id. */
  readonly id: string
  /** Effective tenant: the `x-tenant-id` override or the registry default. */
  readonly tenantId: string | null
}

/** An Express request carrying the (optional) simulated identity. */
export interface AuthenticatedRequest extends Request {
  /** Present only when a known `x-demo-user` header was sent. */
  user?: DemoIdentity
}

/**
 * Resolves the simulated identity for every route outside `/health/*`.
 *
 * Behavior:
 * - no `x-demo-user` header: the request proceeds unauthenticated
 *   (`req.user` stays undefined) so guard no-user paths remain reachable;
 * - unknown `x-demo-user`: 401 with the list of valid demo users (the
 *   received value is never echoed back);
 * - known user: `req.user = { id, tenantId }` where `x-tenant-id` overrides
 *   the registry default (tenant isolation demos);
 * - known user with a null effective tenant under `TENANT_REQUIRED=true`:
 *   403 `tenant.required`. The middleware is the single choke point every
 *   identity-carrying request crosses, so the strict mode holds uniformly
 *   across metered calls, reads, and money-path writes.
 */
@Injectable()
export class IdentityMiddleware implements NestMiddleware {
  /** @param env The typed environment (drives the strict-tenancy mode). */
  constructor(@Inject(ENV_CONFIG) private readonly env: EnvConfig) {}

  /**
   * Attach the simulated identity, reject unknown demo users or (in strict
   * mode) tenant-less identities, or pass the request through untouched
   * when no identity header is present.
   *
   * @param req The incoming request.
   * @param _res The response (unused; rejection goes through the exception layer).
   * @param next Continues the middleware chain.
   * @throws {UnauthorizedException} when `x-demo-user` names an unknown user.
   * @throws {ApiException} `tenant.required` (403) for a null-tenant identity when `TENANT_REQUIRED=true`.
   */
  use(req: Request, _res: Response, next: NextFunction): void {
    const userId = req.get('x-demo-user')
    if (userId === undefined) {
      next()
      return
    }
    const user = findDemoUser(userId)
    if (user === undefined) {
      throw new UnauthorizedException({
        message: 'Unknown demo user. Set the x-demo-user header to one of the valid demo users.',
        validUsers: DEMO_USER_IDS,
      })
    }
    const identity = resolveIdentity(user, req.get('x-tenant-id'))
    if (identity.tenantId === null && this.env.TENANT_REQUIRED) {
      throw tenantRequiredError()
    }
    // Single widening cast at the boundary where the identity is attached;
    // downstream consumers type the request as AuthenticatedRequest.
    ;(req as AuthenticatedRequest).user = identity
    next()
  }
}

/**
 * Build the effective identity: the header tenant (when present) overrides
 * the registry default.
 *
 * @param user The registered demo user.
 * @param tenantHeader The raw `x-tenant-id` header value, if any.
 * @returns The identity to attach to the request.
 */
function resolveIdentity(user: DemoUser, tenantHeader: string | undefined): DemoIdentity {
  return { id: user.id, tenantId: tenantHeader ?? user.tenantId }
}
