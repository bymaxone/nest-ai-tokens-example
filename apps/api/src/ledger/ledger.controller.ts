/**
 * @fileoverview `/ledger` routes: the filtered, paginated transaction list
 * and the single-transaction inspector. Thin controllers: identity
 * extraction plus delegation; the read service owns filter building,
 * library calls, and ownership policy.
 *
 * @layer ledger
 */
import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common'
import type { JsonSafe, UsageRecord } from '@bymax-one/nest-ai-tokens'

import { ListTransactionsQueryDto } from './dto/list-transactions.query.js'
import { LedgerReadService } from './ledger-read.service.js'
import type { TransactionListPage } from './ledger-read.service.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'
import { requireIdentity } from '../identity/require-identity.js'

/** Serves the ledger read surface. */
@Controller('ledger')
export class LedgerController {
  /**
   * @param ledger The ledger read service.
   */
  constructor(@Inject(LedgerReadService) private readonly ledger: LedgerReadService) {}

  /**
   * `GET /ledger/transactions`: the caller's transactions, filtered and
   * paginated. Requires a demo identity; every filter is optional and
   * validated by the query DTO.
   *
   * @param request The request carrying the simulated identity.
   * @param query The validated filters and page bounds.
   * @returns Items in store order plus the filter-wide total.
   */
  @Get('transactions')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<TransactionListPage> {
    return this.ledger.list(requireIdentity(request), query)
  }

  /**
   * `GET /ledger/transactions/:id`: one transaction with its full payload.
   * 404 on unknown ids; 403 when the row belongs to another tenant or user
   * (ownership is app-level policy; see the read service).
   *
   * @param request The request carrying the simulated identity.
   * @param id The transaction id.
   * @returns The JSON-safe record.
   */
  @Get('transactions/:id')
  detail(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<JsonSafe<UsageRecord>> {
    return this.ledger.detail(requireIdentity(request), id)
  }
}
