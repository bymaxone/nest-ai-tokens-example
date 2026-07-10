/**
 * @fileoverview Quota module: the enforcement surface the workspace (and the
 * quota lab) build on. The library's wallet/budget services and guard resolve
 * from the global dynamic module; this module contributes the app-owned,
 * null-tolerant `EnforcementGuard` so metered controllers work in both the
 * enforcing and the disabled configuration.
 *
 * @layer quota
 */
import { Module } from '@nestjs/common'

import { EnforcementGuard } from './enforcement.guard.js'

/** Wires the app-owned enforcement primitives. */
@Module({
  providers: [EnforcementGuard],
  exports: [EnforcementGuard],
})
export class QuotaModule {}
