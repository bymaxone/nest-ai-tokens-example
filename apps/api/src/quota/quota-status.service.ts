/**
 * @fileoverview Read side of the enforcement surface: the combined
 * wallet-plus-budget access status for the caller. Delegates to
 * `MeteringService.getStatus` (no side effects) and returns the library's
 * `AccessStatus` verbatim, JSON-safe (bigint money as decimal strings).
 *
 * @layer quota
 */
import { Inject, Injectable } from '@nestjs/common'
import { MeteringService, toJsonSafe } from '@bymax-one/nest-ai-tokens'
import type { AccessStatus, JsonSafe } from '@bymax-one/nest-ai-tokens'

import { tenantIdOf } from '../ai/metering-context.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

/** Serves `GET /quota/status`. */
@Injectable()
export class QuotaStatusService {
  /**
   * @param metering The library's metering facade (container-resolved).
   */
  constructor(@Inject(MeteringService) private readonly metering: MeteringService) {}

  /**
   * The caller's combined access status: wallet balance/overdraft headroom
   * plus one status row per matching budget, with `hasAccess`/`blockedBy`
   * precomputed by the library.
   *
   * @param identity The request identity (the reported scope).
   * @returns The JSON-safe access status.
   */
  async status(identity: DemoIdentity): Promise<JsonSafe<AccessStatus>> {
    const status = await this.metering.getStatus(tenantIdOf(identity), {
      type: 'user',
      id: identity.id,
    })
    return toJsonSafe(status)
  }
}
