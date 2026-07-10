/**
 * @fileoverview `/ledger` routes: the filtered, paginated transaction list,
 * the single-transaction inspector, and the money-path writes (credits and
 * refunds, the billing-webhook simulation). Thin controllers: identity
 * extraction plus delegation; the services own filter building, library
 * calls, ownership policy, and the money semantics.
 *
 * @layer ledger
 */
import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common'
import type { JsonSafe, UsageRecord } from '@bymax-one/nest-ai-tokens'

import { CreditBodyDto } from './dto/credit.body.js'
import { ListTransactionsQueryDto } from './dto/list-transactions.query.js'
import { RefundBodyDto } from './dto/refund.body.js'
import { LedgerCreditService } from './ledger-credit.service.js'
import type { CreditResult, RefundResult } from './ledger-credit.service.js'
import { LedgerReadService } from './ledger-read.service.js'
import type { TransactionListPage } from './ledger-read.service.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'
import { requireIdentity } from '../identity/require-identity.js'

/** Serves the ledger read surface. */
@Controller('ledger')
export class LedgerController {
  /**
   * @param ledger The ledger read service.
   * @param credits The money-path write service (credits and refunds).
   */
  constructor(
    @Inject(LedgerReadService) private readonly ledger: LedgerReadService,
    @Inject(LedgerCreditService) private readonly credits: LedgerCreditService,
  ) {}

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

  /**
   * `POST /ledger/credits`: top up the caller's wallet (the billing-webhook
   * simulation; strict positive-integer nano-USD validation).
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated credit body.
   * @returns The grant entry id plus the post-credit balance.
   */
  @Post('credits')
  credit(@Req() request: AuthenticatedRequest, @Body() body: CreditBodyDto): Promise<CreditResult> {
    return this.credits.credit(requireIdentity(request), body)
  }

  /**
   * `POST /ledger/refund`: reverse one of the caller's posted transactions
   * with a compensating record (404 unknown, 403 foreign, canonical 409
   * when the record is not posted).
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated refund body.
   * @returns The reversal summary plus the compensating record.
   */
  @Post('refund')
  refund(@Req() request: AuthenticatedRequest, @Body() body: RefundBodyDto): Promise<RefundResult> {
    return this.credits.refund(requireIdentity(request), body)
  }
}
