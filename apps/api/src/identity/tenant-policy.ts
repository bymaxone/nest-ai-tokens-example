/**
 * @fileoverview The strict-tenancy rejection shared by every layer that
 * enforces `TENANT_REQUIRED`. The shipped library has no tenancy options
 * block: tenancy is HOST policy, applied where the host resolves an
 * identity into a tenant. This app enforces the strict mode at two layers:
 * the identity middleware (the single choke point every identity-carrying
 * request crosses) and the module `scopeResolver` (defense in depth for
 * metered calls, and the copy-paste seam for real apps whose resolver reads
 * verified claims instead of demo headers).
 *
 * @layer identity
 */
import { HttpStatus } from '@nestjs/common'

import { ApiException } from '../common/api-exception.js'

/** The canonical code for the strict-tenancy rejection. */
export const TENANT_REQUIRED_ERROR_CODE = 'tenant.required'

/**
 * The strict-tenancy rejection: a tenant-less identity on a deployment
 * running with `TENANT_REQUIRED=true`. 403 (not 401): the caller IS
 * authenticated; the deployment policy forbids tenant-less access.
 *
 * @returns The typed exception in the canonical envelope.
 */
export function tenantRequiredError(): ApiException {
  return new ApiException(
    TENANT_REQUIRED_ERROR_CODE,
    HttpStatus.FORBIDDEN,
    'A tenant is required (TENANT_REQUIRED=true). Use a tenant-scoped demo user or send x-tenant-id.',
  )
}
