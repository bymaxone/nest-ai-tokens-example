/**
 * Unit tests for the ledger controller.
 *
 * Layer: unit.
 * Goal: prove the controller is thin: it extracts the identity (401 when
 * absent) and delegates to the read and money-path services untouched.
 * Mocks: the read and credit services; requests are plain stubs.
 */
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, jest } from '@jest/globals'
import { toJsonSafe } from '@bymax-one/nest-ai-tokens'

import { creditBodySchema } from './dto/credit.body.js'
import { refundBodySchema } from './dto/refund.body.js'
import { LedgerController } from './ledger.controller.js'
import type { LedgerCreditService } from './ledger-credit.service.js'
import type { LedgerReadService, TransactionListPage } from './ledger-read.service.js'
import { listTransactionsQuerySchema } from './dto/list-transactions.query.js'
import type { AuthenticatedRequest, DemoIdentity } from '../identity/identity.middleware.js'
import { recordWith } from '../../test/fixtures/usage-record.fixture.js'

/** A request stub carrying an optional identity. */
function requestWith(user: DemoIdentity | undefined): AuthenticatedRequest {
  return { user } as AuthenticatedRequest
}

/** An empty JSON-safe page fixture. */
const emptyPage: TransactionListPage = { items: [], total: 0, limit: 20, offset: 0 }

/** The controller under test plus its service doubles. */
function controllerWith() {
  const list = jest.fn<LedgerReadService['list']>().mockResolvedValue(emptyPage)
  const detail = jest.fn<LedgerReadService['detail']>()
  const credit = jest.fn<LedgerCreditService['credit']>()
  const refund = jest.fn<LedgerCreditService['refund']>()
  const controller = new LedgerController(
    { list, detail } as unknown as LedgerReadService,
    { credit, refund } as unknown as LedgerCreditService,
  )
  return { controller, list, detail, credit, refund }
}

describe('LedgerController.list', () => {
  /**
   * Thin delegation.
   *
   * The controller forwards the identity and the validated query verbatim;
   * all behavior lives in the service.
   */
  it('delegates to the read service with the identity and query', async () => {
    const { controller, list } = controllerWith()
    const query = listTransactionsQuerySchema.parse({ limit: '5' })

    const page = await controller.list(requestWith({ id: 'ada', tenantId: 'acme' }), query)

    expect(page).toBe(emptyPage)
    expect(list).toHaveBeenCalledWith({ id: 'ada', tenantId: 'acme' }, query)
  })

  /**
   * Missing identity.
   *
   * The ledger is identity-scoped; without the simulation header the
   * request is rejected with 401 before any service call.
   */
  it('throws 401 without an identity', () => {
    const { controller, list } = controllerWith()

    expect(() =>
      controller.list(requestWith(undefined), listTransactionsQuerySchema.parse({})),
    ).toThrow(UnauthorizedException)
    expect(list).not.toHaveBeenCalled()
  })
})

describe('LedgerController.detail', () => {
  /**
   * Thin delegation.
   *
   * The id path parameter reaches the service untouched together with the
   * identity.
   */
  it('delegates to the read service with the identity and id', async () => {
    const { controller, detail } = controllerWith()
    detail.mockResolvedValue(toJsonSafe(recordWith()))

    await controller.detail(requestWith({ id: 'ada', tenantId: 'acme' }), 'seed-usage-0001')

    expect(detail).toHaveBeenCalledWith({ id: 'ada', tenantId: 'acme' }, 'seed-usage-0001')
  })

  /**
   * Missing identity.
   *
   * Detail is equally identity-scoped: 401 before any lookup, so ids
   * cannot be probed anonymously.
   */
  it('throws 401 without an identity', () => {
    const { controller, detail } = controllerWith()

    expect(() => controller.detail(requestWith(undefined), 'seed-usage-0001')).toThrow(
      UnauthorizedException,
    )
    expect(detail).not.toHaveBeenCalled()
  })
})

describe('LedgerController.credit', () => {
  /**
   * Thin delegation.
   *
   * The controller forwards the identity and the validated (bigint) body
   * to the money-path service untouched.
   */
  it('delegates to the credit service with the identity and body', async () => {
    const { controller, credit } = controllerWith()
    const body = creditBodySchema.parse({ amountNanoUsd: '1000000000', type: 'purchase' })

    await controller.credit(requestWith({ id: 'ada', tenantId: 'acme' }), body)

    expect(credit).toHaveBeenCalledWith({ id: 'ada', tenantId: 'acme' }, body)
  })

  /**
   * Missing identity.
   *
   * Credits are identity-scoped (the credited wallet is the caller's):
   * 401 before any service call.
   */
  it('throws 401 without an identity', () => {
    const { controller, credit } = controllerWith()
    const body = creditBodySchema.parse({ amountNanoUsd: '1', type: 'purchase' })

    expect(() => controller.credit(requestWith(undefined), body)).toThrow(UnauthorizedException)
    expect(credit).not.toHaveBeenCalled()
  })
})

describe('LedgerController.refund', () => {
  /**
   * Thin delegation.
   *
   * The refund body reaches the money-path service untouched together
   * with the identity.
   */
  it('delegates to the credit service with the identity and body', async () => {
    const { controller, refund } = controllerWith()
    const body = refundBodySchema.parse({ transactionId: 'txn-1', reason: 'demo' })

    await controller.refund(requestWith({ id: 'ada', tenantId: 'acme' }), body)

    expect(refund).toHaveBeenCalledWith({ id: 'ada', tenantId: 'acme' }, body)
  })

  /**
   * Missing identity.
   *
   * Refunds are identity-scoped (ownership is checked in the service):
   * 401 before any lookup, so ids cannot be probed anonymously.
   */
  it('throws 401 without an identity', () => {
    const { controller, refund } = controllerWith()
    const body = refundBodySchema.parse({ transactionId: 'txn-1' })

    expect(() => controller.refund(requestWith(undefined), body)).toThrow(UnauthorizedException)
    expect(refund).not.toHaveBeenCalled()
  })
})
