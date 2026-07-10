/**
 * Unit tests for the ledger money-path service (credits and refunds).
 *
 * Layer: unit.
 * Goal: prove a credit grants the caller's wallet with the backdated
 * effectiveAt (the DB-clock spendability guard), the type-as-reason
 * mapping (with and without a description), the replay key passthrough
 * and the random default, the host-side replay pre-check (match returns
 * the original grant, mismatch is the canonical 409, absence grants),
 * and the post-credit balance projection; prove a refund enforces
 * ownership (404 unknown, 403 foreign tenant AND foreign user), delegates
 * to the orchestrated reversal, and reports the wallet-refund flag per
 * the enforced/system matrix; prove both paths answer quota.disabled 503
 * when the wallet block is off.
 * Mocks: WalletService, LedgerService, MeteringService, and Prisma
 * lookup doubles.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type {
  LedgerService,
  MeteringService,
  WalletEntry,
  WalletService,
} from '@bymax-one/nest-ai-tokens'

import { creditBodySchema } from './dto/credit.body.js'
import { refundBodySchema } from './dto/refund.body.js'
import {
  CREDIT_EFFECTIVE_BACKDATE_MS,
  DEFAULT_REFUND_REASON,
  LedgerCreditService,
} from './ledger-credit.service.js'
import { ApiException } from '../common/api-exception.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { recordWith } from '../../test/fixtures/usage-record.fixture.js'

const ada: DemoIdentity = { id: 'ada', tenantId: 'acme' }

/** A complete wallet grant entry for the doubles to return. */
function grantEntryWith(): WalletEntry {
  return {
    id: 'entry-1',
    walletId: 'wallet-1',
    type: 'grant',
    amountNanoUsd: 2_500_000_000n,
    priority: 0,
    effectiveAt: new Date('2026-07-10T00:00:00.000Z'),
    idempotencyKey: 'key-1',
    reason: 'purchase',
    createdAt: new Date('2026-07-10T00:00:01.000Z'),
  }
}

/** A stored wallet row for the replay lookup double. */
const storedWallet = { id: 'wallet-1' }

/** A stored grant row for the replay lookup double. */
function storedGrantWith(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'entry-replayed',
    type: 'grant',
    amountNanoUsd: 2_500_000_000n,
    reason: 'purchase',
    ...overrides,
  }
}

/** The service under test plus its observable doubles. */
function serviceWith(walletsEnabled = true) {
  const grant = jest.fn<WalletService['grant']>().mockResolvedValue(grantEntryWith())
  const getBalance = jest
    .fn<WalletService['getBalance']>()
    .mockResolvedValue({ nanoUsd: 52_500_000_000n, credits: 52.5 })
  const walletDouble: Pick<WalletService, 'grant' | 'getBalance'> = { grant, getBalance }
  const findById = jest.fn<LedgerService['findById']>()
  const ledgerDouble: Pick<LedgerService, 'findById'> = { findById }
  const reverse = jest
    .fn<MeteringService['reverse']>()
    .mockResolvedValue(recordWith({ id: 'txn-rev', billedCostNanoUsd: -225_000n }))
  const meteringDouble: Pick<MeteringService, 'reverse'> = { reverse }
  const findWallet = jest.fn().mockReturnValue(Promise.resolve(null))
  const findEntry = jest.fn().mockReturnValue(Promise.resolve(null))
  const prismaDouble = {
    aiWallet: { findUnique: findWallet },
    aiWalletEntry: { findUnique: findEntry },
  }
  // Single widening assertions at the fixture boundary: the service consumes
  // exactly these members of each class type.
  const service = new LedgerCreditService(
    walletsEnabled ? (walletDouble as WalletService) : null,
    ledgerDouble as LedgerService,
    meteringDouble as MeteringService,
    prismaDouble as unknown as PrismaService,
  )
  return { service, grant, getBalance, findById, reverse, findWallet, findEntry }
}

describe('credit', () => {
  /**
   * Happy path: grant + balance projection.
   *
   * The grant carries the bigint amount, the type as the reason, the
   * caller-supplied replay key, and a BACKDATED effectiveAt (the store
   * stamps createdAt with the DB clock; a same-instant effectiveAt could
   * land after it and leave the top-up inert). The response projects the
   * post-credit balance with bigint as decimal strings.
   */
  it('grants the wallet with a backdated effectiveAt and returns the balance', async () => {
    const { service, grant } = serviceWith()
    const before = Date.now()
    const body = creditBodySchema.parse({
      amountNanoUsd: '2500000000',
      type: 'purchase',
      idempotencyKey: 'webhook-evt-001',
    })

    const result = await service.credit(ada, body)
    const after = Date.now()

    expect(grant).toHaveBeenCalledWith(
      { tenantId: 'acme', ownerType: 'user', ownerId: 'ada' },
      expect.objectContaining({
        amountNanoUsd: 2_500_000_000n,
        idempotencyKey: 'webhook-evt-001',
        reason: 'purchase',
      }),
    )
    const effectiveAt = grant.mock.calls[0]?.[1].effectiveAt
    expect(effectiveAt).toBeInstanceOf(Date)
    const backdatedBy = (effectiveAt as Date).getTime()
    expect(backdatedBy).toBeGreaterThanOrEqual(before - CREDIT_EFFECTIVE_BACKDATE_MS)
    expect(backdatedBy).toBeLessThanOrEqual(after - CREDIT_EFFECTIVE_BACKDATE_MS)
    expect(result).toEqual({
      entryId: 'entry-1',
      type: 'purchase',
      amountNanoUsd: '2500000000',
      balance: { nanoUsd: '52500000000', credits: 52.5, formatted: '$52.500000' },
    })
  })

  /**
   * Reason composition and the random replay key default.
   *
   * A description appends to the type; without a client key the service
   * generates a random one so every webhook call grants exactly once.
   */
  it('composes the reason with the description and defaults a random key', async () => {
    const { service, grant } = serviceWith()
    const body = creditBodySchema.parse({
      amountNanoUsd: '1000000000',
      type: 'trial_allocation',
      description: 'welcome bonus',
    })

    await service.credit(ada, body)

    const input = grant.mock.calls[0]?.[1]
    expect(input?.reason).toBe('trial_allocation: welcome bonus')
    expect(input?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
  })

  /**
   * Disabled wallet block.
   *
   * With QUOTA_ENABLED=false the library binds WalletService to null; the
   * credit answers the canonical quota.disabled 503 instead of crashing.
   */
  it('rejects with quota.disabled 503 when wallets are off', async () => {
    const { service } = serviceWith(false)
    const body = creditBodySchema.parse({ amountNanoUsd: '1', type: 'purchase' })

    await expect(service.credit(ada, body)).rejects.toBeInstanceOf(ApiException)
    await expect(service.credit(ada, body)).rejects.toMatchObject({ code: 'quota.disabled' })
  })

  /**
   * Disabled wallet block on the refund side.
   *
   * The refund shares the wallet guard: with the block off it answers the
   * same quota.disabled 503 before touching the ledger or the reversal.
   */
  it('rejects refunds with quota.disabled 503 when wallets are off', async () => {
    const { service } = serviceWith(false)
    const body = refundBodySchema.parse({ transactionId: 'txn-anything' })

    await expect(service.refund(ada, body)).rejects.toBeInstanceOf(ApiException)
    await expect(service.refund(ada, body)).rejects.toMatchObject({ code: 'quota.disabled' })
  })
})

describe('credit replay pre-check', () => {
  /**
   * Matching replay returns the original grant.
   *
   * With a client key whose stored payload matches (type/amount/reason),
   * the service answers from the existing entry WITHOUT granting again:
   * webhook retries can never double-credit.
   */
  it('returns the stored grant on a matching replay without granting', async () => {
    const { service, grant, findWallet, findEntry } = serviceWith()
    findWallet.mockReturnValue(Promise.resolve(storedWallet))
    findEntry.mockReturnValue(Promise.resolve(storedGrantWith()))
    const body = creditBodySchema.parse({
      amountNanoUsd: '2500000000',
      type: 'purchase',
      idempotencyKey: 'webhook-evt-001',
    })

    const result = await service.credit(ada, body)

    expect(result.entryId).toBe('entry-replayed')
    expect(grant).not.toHaveBeenCalled()
  })

  /**
   * Key reuse with a different payload is the canonical 409.
   *
   * The same key with a different amount (or reason) must never silently
   * return the old grant NOR grant again: it is an idempotency conflict.
   */
  it('rejects a mismatched replay with the canonical conflict', async () => {
    const { service, grant, findWallet, findEntry } = serviceWith()
    findWallet.mockReturnValue(Promise.resolve(storedWallet))
    findEntry.mockReturnValue(Promise.resolve(storedGrantWith({ amountNanoUsd: 1n })))
    const body = creditBodySchema.parse({
      amountNanoUsd: '2500000000',
      type: 'purchase',
      idempotencyKey: 'webhook-evt-001',
    })

    await expect(service.credit(ada, body)).rejects.toMatchObject({
      response: { error: { code: 'AI_TOKENS_IDEMPOTENCY_CONFLICT' } },
    })
    expect(grant).not.toHaveBeenCalled()
  })

  /**
   * Fresh keys and missing wallets fall through to a real grant.
   *
   * A key with no stored entry (or no wallet at all) is not a replay: the
   * pre-check returns null and the grant proceeds. Without a client key
   * the lookup is skipped entirely.
   */
  it('falls through to the grant when nothing was stored', async () => {
    const { service, grant, findWallet, findEntry } = serviceWith()
    findWallet.mockReturnValue(Promise.resolve(storedWallet))
    const keyed = creditBodySchema.parse({
      amountNanoUsd: '1',
      type: 'purchase',
      idempotencyKey: 'webhook-evt-002',
    })

    await service.credit(ada, keyed)
    expect(grant).toHaveBeenCalledTimes(1)

    findWallet.mockReturnValue(Promise.resolve(null))
    await service.credit(ada, keyed)
    expect(grant).toHaveBeenCalledTimes(2)

    findWallet.mockClear()
    findEntry.mockClear()
    await service.credit(ada, creditBodySchema.parse({ amountNanoUsd: '1', type: 'purchase' }))
    expect(findWallet).not.toHaveBeenCalled()
    expect(findEntry).not.toHaveBeenCalled()
  })
})

describe('refund', () => {
  /**
   * Happy path: ownership passes, reversal delegates.
   *
   * The caller's own posted, enforced record reverses through the
   * library's orchestrated compensation with the caller's reason; the
   * result names both records and reports the wallet refund.
   */
  it('reverses an owned enforced record and reports the wallet refund', async () => {
    const { service, findById, reverse } = serviceWith()
    findById.mockResolvedValue(recordWith({ id: 'txn-1', enforced: true }))
    const body = refundBodySchema.parse({ transactionId: 'txn-1', reason: 'duplicate charge' })

    const result = await service.refund(ada, body)

    expect(reverse).toHaveBeenCalledWith('txn-1', 'duplicate charge')
    expect(result.originalTransactionId).toBe('txn-1')
    expect(result.reversalTransactionId).toBe('txn-rev')
    expect(result.walletRefunded).toBe(true)
    expect(result.reversal.billedCostNanoUsd).toBe('-225000')
  })

  /**
   * Default reason and the no-wallet-refund matrix.
   *
   * Without a reason the documented default applies; an observe-only
   * (non-enforced) original reverses in the ledger but never touched the
   * wallet, so walletRefunded is false. A system-cost record equally
   * reports false even when enforced-flagged.
   */
  it('applies the default reason and the enforced/system wallet matrix', async () => {
    const { service, findById, reverse } = serviceWith()
    findById.mockResolvedValue(recordWith({ id: 'txn-1', enforced: false }))

    const observeOnly = await service.refund(
      ada,
      refundBodySchema.parse({ transactionId: 'txn-1' }),
    )
    expect(reverse).toHaveBeenCalledWith('txn-1', DEFAULT_REFUND_REASON)
    expect(observeOnly.walletRefunded).toBe(false)

    findById.mockResolvedValue(recordWith({ id: 'txn-1', enforced: true, isSystemCost: true }))
    const system = await service.refund(ada, refundBodySchema.parse({ transactionId: 'txn-1' }))
    expect(system.walletRefunded).toBe(false)
  })

  /**
   * Unknown id.
   *
   * A missing record is a clean 404 before any reversal.
   */
  it('rejects an unknown transaction with 404', async () => {
    const { service, findById, reverse } = serviceWith()
    findById.mockResolvedValue(null)

    await expect(
      service.refund(ada, refundBodySchema.parse({ transactionId: 'ghost' })),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(reverse).not.toHaveBeenCalled()
  })

  /**
   * Foreign rows: tenant AND user mismatches are both 403.
   *
   * Ownership is app-level policy mirroring the detail endpoint: a row in
   * another tenant, or another user's row in the same tenant, cannot be
   * refunded (or probed) by this caller.
   */
  it('rejects foreign-tenant and foreign-user records with 403', async () => {
    const { service, findById, reverse } = serviceWith()
    const body = refundBodySchema.parse({ transactionId: 'txn-1' })

    findById.mockResolvedValue(recordWith({ id: 'txn-1', tenantId: 'globex' }))
    await expect(service.refund(ada, body)).rejects.toBeInstanceOf(ForbiddenException)

    findById.mockResolvedValue(recordWith({ id: 'txn-1', scope: { type: 'user', id: 'grace' } }))
    await expect(service.refund(ada, body)).rejects.toBeInstanceOf(ForbiddenException)
    expect(reverse).not.toHaveBeenCalled()
  })
})
