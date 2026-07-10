/**
 * @fileoverview The money-path write side of `/ledger`: credits (top-ups)
 * and refunds. This is the BILLING-WEBHOOK SIMULATION the library
 * intentionally excludes: the library records and enforces, the app
 * charges. A credit is a `WalletService.grant` whose reason mirrors the
 * seeded grant types; a refund is the library's orchestrated
 * `MeteringService.reverse` (a compensating record linked via
 * `reversesRecordId`/`reversedByRecordId`, the original's amounts
 * untouched, the wallet refunded and budgets released for enforced
 * originals). Both endpoints answer the documented 503 when the wallet
 * feature block is disabled.
 *
 * Idempotency semantics: a client-supplied `idempotencyKey` makes a credit
 * replay-safe (a matching replay returns the original grant; a mismatched
 * payload under the same key is the canonical 409); without a key every
 * call grants. The replay is pre-checked HOST-SIDE against the app's own
 * schema: the store detects replays through its unique-violation catch,
 * but the Prisma driver-adapter wraps a raw unique violation in a shape
 * (`P2010` + nested `driverAdapterError.cause.originalCode`) the shipped
 * adapter does not recognize, so relying on the catch would surface a
 * store error instead of the replay. A concurrent duplicate can still
 * race past the pre-check; the store's unique index then rejects it. A
 * refund retry is always safe: the library keys the compensating record
 * `reverse:<id>`, so a second attempt is rejected with the canonical 409
 * instead of double-refunding.
 *
 * @layer ledger
 */
import { randomUUID } from 'node:crypto'

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  AiTokensException,
  LedgerService,
  MeteringService,
  WalletService,
  formatNanoUsd,
  toJsonSafe,
} from '@bymax-one/nest-ai-tokens'
import type { JsonSafe, UsageRecord, WalletRef } from '@bymax-one/nest-ai-tokens'

import type { CreditBody, CreditType } from './dto/credit.body.js'
import type { RefundBody } from './dto/refund.body.js'
import { tenantIdOf, walletRefOf } from '../ai/metering-context.js'
import { ApiException } from '../common/api-exception.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import { PrismaService } from '../prisma/prisma.service.js'

/**
 * How far a credit's `effectiveAt` is backdated, in milliseconds. The store
 * stamps `createdAt` with the DATABASE clock and a grant is spendable only
 * when `effectiveAt <= createdAt`; a same-instant application-clock
 * `effectiveAt` can land microseconds after the row's `createdAt` and would
 * leave a fresh top-up inert until the next debit sweep. One second of
 * backdating makes every credit spendable immediately on any clock pairing.
 */
export const CREDIT_EFFECTIVE_BACKDATE_MS = 1_000

/** The reason recorded when a refund body carries none. */
export const DEFAULT_REFUND_REASON = 'refund requested'

/** The response of a credit (top-up). */
export interface CreditResult {
  /** The appended grant entry id. */
  readonly entryId: string
  /** Echo of the credit kind. */
  readonly type: CreditType
  /** The granted amount in nano-USD (decimal string). */
  readonly amountNanoUsd: string
  /** The wallet balance AFTER the credit. */
  readonly balance: {
    /** Balance in nano-USD (decimal string). */
    readonly nanoUsd: string
    /** Presentation credits (1 credit = 1 USD). */
    readonly credits: number
    /** Human-readable balance, e.g. `$52.500000`. */
    readonly formatted: string
  }
}

/** The response of a refund. */
export interface RefundResult {
  /** The reversed (original) transaction id. */
  readonly originalTransactionId: string
  /** The compensating transaction id (`reversesRecordId` points back). */
  readonly reversalTransactionId: string
  /** True when the original was enforced and its wallet debit was refunded. */
  readonly walletRefunded: boolean
  /** The full compensating record, JSON-safe. */
  readonly reversal: JsonSafe<UsageRecord>
}

/** Serves the `/ledger` money-path writes. */
@Injectable()
export class LedgerCreditService {
  /**
   * @param wallets The library wallet service, or `null` when disabled.
   * @param ledger The library ledger service (ownership lookup).
   * @param metering The library metering facade (orchestrated reversal).
   * @param prisma The app's Prisma client (host-side replay pre-check).
   */
  constructor(
    @Inject(WalletService) private readonly wallets: WalletService | null,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(MeteringService) private readonly metering: MeteringService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * Credit the caller's wallet (the billing-webhook simulation: in a real
   * service the VERIFIED payment webhook calls this, not the end user).
   *
   * @param identity The request identity (the credited wallet owner).
   * @param body The validated credit body.
   * @returns The grant entry id plus the post-credit balance.
   * @throws {ApiException} `quota.disabled` (503) when wallets are off.
   * @throws {AiTokensException} the canonical 409 on an idempotency-key
   *   replay whose payload differs.
   */
  async credit(identity: DemoIdentity, body: CreditBody): Promise<CreditResult> {
    const wallets = this.requireWallets()
    const ref = walletRefOf(identity)
    const replayed = await this.replayedGrant(ref, body)
    const entry =
      replayed ??
      (await wallets.grant(ref, {
        amountNanoUsd: body.amountNanoUsd,
        effectiveAt: new Date(Date.now() - CREDIT_EFFECTIVE_BACKDATE_MS),
        idempotencyKey: body.idempotencyKey ?? randomUUID(),
        reason: creditReason(body),
      }))
    const balance = await wallets.getBalance(ref)
    return {
      entryId: entry.id,
      type: body.type,
      amountNanoUsd: entry.amountNanoUsd.toString(),
      balance: {
        nanoUsd: balance.nanoUsd.toString(),
        credits: balance.credits,
        formatted: formatNanoUsd(balance.nanoUsd),
      },
    }
  }

  /**
   * The host-side replay pre-check (see the file overview): with a client
   * key, an existing grant under the same key is returned when its payload
   * matches and rejected with the canonical 409 when it differs.
   *
   * @param ref The wallet owner.
   * @param body The validated credit body.
   * @returns The replayed grant, or `null` when the credit is new.
   * @throws {AiTokensException} `AI_TOKENS_IDEMPOTENCY_CONFLICT` on a key
   *   reuse whose amount or reason differs.
   */
  private async replayedGrant(
    ref: WalletRef,
    body: CreditBody,
  ): Promise<{ id: string; amountNanoUsd: bigint } | null> {
    if (body.idempotencyKey === undefined) return null
    const wallet = await this.prisma.aiWallet.findUnique({
      where: {
        tenantId_ownerType_ownerId: {
          tenantId: ref.tenantId,
          ownerType: ref.ownerType,
          ownerId: ref.ownerId,
        },
      },
    })
    if (wallet === null) return null
    const entry = await this.prisma.aiWalletEntry.findUnique({
      where: {
        walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: body.idempotencyKey },
      },
    })
    if (entry === null) return null
    const isReplayMatch =
      entry.type === 'grant' &&
      entry.amountNanoUsd === body.amountNanoUsd &&
      entry.reason === creditReason(body)
    if (!isReplayMatch) {
      throw new AiTokensException('AI_TOKENS_IDEMPOTENCY_CONFLICT', undefined, {
        idempotencyKey: body.idempotencyKey,
      })
    }
    return { id: entry.id, amountNanoUsd: entry.amountNanoUsd }
  }

  /**
   * Refund one of the caller's posted transactions: the library reverses
   * the ledger record with a compensating record (amounts negated, the
   * original untouched except the `reversed` annotation) and, for an
   * enforced original, refunds the wallet and releases the budgets.
   *
   * Ownership is an APP-LEVEL policy: unknown ids are 404 and foreign rows
   * (another tenant or user) are 403, mirroring the transaction detail
   * endpoint, so the refund surface cannot probe foreign ledger data.
   *
   * @param identity The request identity.
   * @param body The validated refund body.
   * @returns The reversal summary plus the compensating record.
   * @throws {NotFoundException} when no record has this id.
   * @throws {ForbiddenException} when the record belongs to someone else.
   * @throws {AiTokensException} the canonical 409 when the record is not
   *   `posted` (already reversed, pending, or released).
   */
  async refund(identity: DemoIdentity, body: RefundBody): Promise<RefundResult> {
    const original = await this.ledger.findById(body.transactionId)
    if (original === null) throw new NotFoundException('Transaction not found')
    const ownTenant = original.tenantId === tenantIdOf(identity)
    const ownScope = original.scope.type === 'user' && original.scope.id === identity.id
    if (!ownTenant || !ownScope) {
      throw new ForbiddenException('Transaction belongs to another owner')
    }
    const reversal = await this.metering.reverse(
      body.transactionId,
      body.reason ?? DEFAULT_REFUND_REASON,
    )
    return {
      originalTransactionId: original.id,
      reversalTransactionId: reversal.id,
      walletRefunded: original.enforced && !original.isSystemCost,
      reversal: toJsonSafe(reversal),
    }
  }

  /** The wallet service, or the documented 503 when the block is off. */
  private requireWallets(): WalletService {
    if (this.wallets === null) {
      throw new ApiException(
        'quota.disabled',
        503,
        'Credit endpoints require the wallets feature block (set QUOTA_ENABLED=true).',
      )
    }
    return this.wallets
  }
}

/**
 * The persisted grant reason of a credit: the type, with the optional
 * description appended (part of the replay-match payload).
 *
 * @param body The validated credit body.
 * @returns The wallet entry reason.
 */
export function creditReason(body: CreditBody): string {
  return body.description === undefined ? body.type : `${body.type}: ${body.description}`
}
