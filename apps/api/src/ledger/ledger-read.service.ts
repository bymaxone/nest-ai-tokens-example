/**
 * @fileoverview Read service for the ledger endpoints: builds the library's
 * `LedgerFilter` from the request identity plus the validated query,
 * delegates to `LedgerService` (items via `query`, totals via `sumCost`, a
 * single SQL aggregate; the item count of one page is never used as the
 * total), and maps results to JSON-safe payloads (bigint nano-USD renders
 * as decimal strings via the library's `toJsonSafe`).
 *
 * @layer ledger
 */
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { LedgerService, toJsonSafe } from '@bymax-one/nest-ai-tokens'
import type { JsonSafe, LedgerFilter, UsageRecord } from '@bymax-one/nest-ai-tokens'

import type { ListTransactionsQuery } from './dto/list-transactions.query.js'
import { GLOBAL_TENANT_ID } from '../ai/ai-tokens.config.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

/** One page of ledger rows plus the filter-wide total. */
export interface TransactionListPage {
  /** The page items in store order (`createdAt` ascending). */
  items: JsonSafe<UsageRecord>[]
  /** Filter-wide row count (SQL `COUNT`, independent of the page bounds). */
  total: number
  /** Echo of the applied page size. */
  limit: number
  /** Echo of the applied page start. */
  offset: number
}

/**
 * Build the library filter for one identity and one validated query. The
 * tenant mapping matches the module's `scopeResolver` exactly (null-tenant
 * identities read the global tenant), and the scope pins the caller, so a
 * user can only ever list their own rows.
 *
 * @param identity The request identity.
 * @param query The validated list query.
 * @returns The filter handed to `LedgerService`.
 */
export function buildLedgerFilter(
  identity: DemoIdentity,
  query: ListTransactionsQuery,
): LedgerFilter {
  return {
    tenantId: identity.tenantId ?? GLOBAL_TENANT_ID,
    scope: { type: 'user', id: identity.id },
    ...(query.feature === undefined ? {} : { feature: query.feature }),
    ...(query.features === undefined ? {} : { features: query.features }),
    ...(query.provider === undefined ? {} : { provider: query.provider }),
    ...(query.model === undefined ? {} : { model: query.model }),
    ...(query.operation === undefined ? {} : { operation: query.operation }),
    ...(query.serviceTier === undefined ? {} : { serviceTier: query.serviceTier }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.isSystemCost === undefined ? {} : { isSystemCost: query.isSystemCost }),
    ...(query.systemCostCategory === undefined
      ? {}
      : { systemCostCategory: query.systemCostCategory }),
    ...(query.from === undefined ? {} : { from: query.from }),
    ...(query.to === undefined ? {} : { to: query.to }),
    limit: query.limit,
    offset: query.offset,
  }
}

/** Serves the read side of `/ledger/*`. */
@Injectable()
export class LedgerReadService {
  /**
   * @param ledger The library's ledger service (container-resolved from the
   *   global dynamic module).
   */
  constructor(@Inject(LedgerService) private readonly ledger: LedgerService) {}

  /**
   * One page of the caller's transactions plus the filter-wide total.
   *
   * @param identity The request identity (owns the visible scope).
   * @param query The validated list query.
   * @returns The JSON-safe page.
   */
  async list(identity: DemoIdentity, query: ListTransactionsQuery): Promise<TransactionListPage> {
    const filter = buildLedgerFilter(identity, query)
    const [items, summary] = await Promise.all([
      this.ledger.query(filter),
      this.ledger.sumCost(filter),
    ])
    return {
      items: toJsonSafe(items),
      total: summary.records,
      limit: query.limit,
      offset: query.offset,
    }
  }

  /**
   * One transaction with its full payload.
   *
   * Ownership is an APP-LEVEL policy, not a library concern: the library
   * loads any row by id, and this service rejects rows that belong to a
   * different tenant or subject (403) so the endpoint cannot leak foreign
   * ledger data. Unknown ids are a clean 404.
   *
   * @param identity The request identity.
   * @param id The transaction id.
   * @returns The JSON-safe record.
   * @throws {NotFoundException} when no record has this id.
   * @throws {ForbiddenException} when the record belongs to someone else.
   */
  async detail(identity: DemoIdentity, id: string): Promise<JsonSafe<UsageRecord>> {
    const record = await this.ledger.findById(id)
    if (record === null) throw new NotFoundException('Transaction not found')
    const ownTenant = record.tenantId === (identity.tenantId ?? GLOBAL_TENANT_ID)
    const ownScope = record.scope.type === 'user' && record.scope.id === identity.id
    if (!ownTenant || !ownScope) {
      throw new ForbiddenException('Transaction belongs to another owner')
    }
    return toJsonSafe(record)
  }
}
