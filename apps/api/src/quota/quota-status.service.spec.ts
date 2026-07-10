/**
 * Unit tests for the quota status read service.
 *
 * Layer: unit.
 * Goal: prove the service reports the caller's scope (tenant fallback
 * included) through `MeteringService.getStatus` and renders the result
 * JSON-safe (bigint money as decimal strings), verbatim otherwise.
 * Mocks: a MeteringService double (getStatus only).
 */
import { describe, expect, it, jest } from '@jest/globals'
import type { MeteringService } from '@bymax-one/nest-ai-tokens'

import { QuotaStatusService } from './quota-status.service.js'

/** A metering double exposing only the delegated read. */
function meteringStatusWith(getStatus: jest.Mock<MeteringService['getStatus']>): MeteringService {
  const double: Pick<MeteringService, 'getStatus'> = { getStatus }
  // Single widening assertion at the fixture boundary: the service consumes
  // exactly this read of the class type.
  return double as MeteringService
}

describe('QuotaStatusService', () => {
  /**
   * Scope mapping and JSON-safety.
   *
   * The caller's identity becomes the user scope, and the library's
   * AccessStatus crosses the boundary with bigint fields as decimal
   * strings while numbers and flags stay verbatim.
   */
  it('reports the caller scope and renders bigint money as strings', async () => {
    const getStatus = jest.fn<MeteringService['getStatus']>().mockResolvedValue({
      hasAccess: true,
      wallet: { balanceNanoUsd: 50_000_000_000n, credits: 50, overdraftRemainingNanoUsd: 0n },
      budgets: [],
    })
    const service = new QuotaStatusService(meteringStatusWith(getStatus))

    const status = await service.status({ id: 'ada', tenantId: 'acme' })

    expect(getStatus).toHaveBeenCalledWith('acme', { type: 'user', id: 'ada' })
    expect(status).toEqual({
      hasAccess: true,
      wallet: { balanceNanoUsd: '50000000000', credits: 50, overdraftRemainingNanoUsd: '0' },
      budgets: [],
    })
  })

  /**
   * Global-tenant fallback.
   *
   * A null-tenant identity reads under the global tenant, mirroring the
   * scopeResolver mapping.
   */
  it('reads under the global tenant for null-tenant identities', async () => {
    const getStatus = jest
      .fn<MeteringService['getStatus']>()
      .mockResolvedValue({ hasAccess: true, budgets: [] })
    const service = new QuotaStatusService(meteringStatusWith(getStatus))

    await service.status({ id: 'root', tenantId: null })

    expect(getStatus).toHaveBeenCalledWith('global', { type: 'user', id: 'root' })
  })
})
