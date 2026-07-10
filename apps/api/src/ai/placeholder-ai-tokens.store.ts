/**
 * @fileoverview Boot-time stand-in for the persistence adapter. It satisfies
 * the full `IAiTokensStore` surface (ledger + pricing ports, plus the wallet
 * and budget ports the enabled feature blocks validate at init) so the
 * module registers and the container wiring is provable before persistence
 * exists. Every data method throws 501 Not Implemented naming the successor:
 * the Prisma-backed store (`PrismaAiTokensStore` from
 * `@bymax-one/nest-ai-tokens/prisma`) replaces this class when the
 * repository layer lands. The single exception is `findExpiredHolds`, which
 * returns an empty batch so the library's background hold reaper idles
 * safely instead of surfacing an unhandled rejection.
 *
 * @layer ai
 */
import { Injectable, NotImplementedException } from '@nestjs/common'
import type {
  Budget,
  BudgetWindowSpend,
  IAiTokensStore,
  LedgerCostSummary,
  OpenGrant,
  PricedModel,
  PriceVersion,
  UsageRecord,
  Wallet,
  WalletEntry,
  WalletEntryPage,
} from '@bymax-one/nest-ai-tokens'

/**
 * Build the 501 raised by every not-yet-persistent method.
 *
 * @param method The store method that was called.
 * @returns The exception naming the placeholder and its successor.
 */
function notYetPersistent(method: string): NotImplementedException {
  return new NotImplementedException(
    `PlaceholderAiTokensStore.${method}: persistence is not wired yet; ` +
      'the Prisma-backed store (PrismaAiTokensStore from @bymax-one/nest-ai-tokens/prisma) ' +
      'replaces this placeholder when the repository layer lands.',
  )
}

/**
 * Full-surface placeholder for `BymaxAiTokensModuleOptions.store`. See the
 * file overview for the contract; parameters are intentionally omitted
 * because no method consumes its inputs.
 */
@Injectable()
export class PlaceholderAiTokensStore implements IAiTokensStore {
  /** Ledger port: idempotent append. @throws {NotImplementedException} always. */
  async append(): Promise<UsageRecord> {
    return Promise.reject(notYetPersistent('append'))
  }

  /** Ledger port: atomic state transition. @throws {NotImplementedException} always. */
  async transition(): Promise<UsageRecord | null> {
    return Promise.reject(notYetPersistent('transition'))
  }

  /** Ledger port: idempotency lookup. @throws {NotImplementedException} always. */
  async findByIdempotencyKey(): Promise<UsageRecord | null> {
    return Promise.reject(notYetPersistent('findByIdempotencyKey'))
  }

  /** Ledger port: load by id. @throws {NotImplementedException} always. */
  async findById(): Promise<UsageRecord | null> {
    return Promise.reject(notYetPersistent('findById'))
  }

  /**
   * Ledger port: expired-hold scan. Returns an empty batch (never throws) so
   * the library's periodic hold reaper idles safely against this placeholder.
   *
   * @returns An empty list of expired holds.
   */
  async findExpiredHolds(): Promise<UsageRecord[]> {
    return Promise.resolve([])
  }

  /** Ledger port: filtered query. @throws {NotImplementedException} always. */
  async query(): Promise<UsageRecord[]> {
    return Promise.reject(notYetPersistent('query'))
  }

  /** Ledger port: aggregate totals. @throws {NotImplementedException} always. */
  async sumCost(): Promise<LedgerCostSummary> {
    return Promise.reject(notYetPersistent('sumCost'))
  }

  /** Ledger port: hash-chain continuation. @throws {NotImplementedException} always. */
  async lastHash(): Promise<string | null> {
    return Promise.reject(notYetPersistent('lastHash'))
  }

  /** Pricing port: effective-dated rate lookup. @throws {NotImplementedException} always. */
  async resolveRate(): Promise<PriceVersion | null> {
    return Promise.reject(notYetPersistent('resolveRate'))
  }

  /** Pricing port: close-and-insert price upsert. @throws {NotImplementedException} always. */
  async upsertPrice(): Promise<PriceVersion> {
    return Promise.reject(notYetPersistent('upsertPrice'))
  }

  /** Pricing port: price history. @throws {NotImplementedException} always. */
  async getPriceHistory(): Promise<PriceVersion[]> {
    return Promise.reject(notYetPersistent('getPriceHistory'))
  }

  /** Pricing port: priced model list. @throws {NotImplementedException} always. */
  async listModels(): Promise<PricedModel[]> {
    return Promise.reject(notYetPersistent('listModels'))
  }

  /** Wallet port: wallet lookup. @throws {NotImplementedException} always. */
  async getWallet(): Promise<Wallet | null> {
    return Promise.reject(notYetPersistent('getWallet'))
  }

  /** Wallet port: entry append with allocations. @throws {NotImplementedException} always. */
  async appendEntry(): Promise<WalletEntry> {
    return Promise.reject(notYetPersistent('appendEntry'))
  }

  /** Wallet port: atomic conditional debit. @throws {NotImplementedException} always. */
  async conditionalDebit(): Promise<WalletEntry | null> {
    return Promise.reject(notYetPersistent('conditionalDebit'))
  }

  /** Wallet port: open grants for allocation. @throws {NotImplementedException} always. */
  async openGrants(): Promise<OpenGrant[]> {
    return Promise.reject(notYetPersistent('openGrants'))
  }

  /** Wallet port: entry pagination. @throws {NotImplementedException} always. */
  async listEntries(): Promise<WalletEntryPage> {
    return Promise.reject(notYetPersistent('listEntries'))
  }

  /** Wallet port: balance reconciliation. @throws {NotImplementedException} always. */
  async reconcile(): Promise<Wallet> {
    return Promise.reject(notYetPersistent('reconcile'))
  }

  /** Budget port: budget upsert. @throws {NotImplementedException} always. */
  async upsert(): Promise<Budget> {
    return Promise.reject(notYetPersistent('upsert'))
  }

  /** Budget port: budget removal. @throws {NotImplementedException} always. */
  async remove(): Promise<void> {
    return Promise.reject(notYetPersistent('remove'))
  }

  /** Budget port: load by id. @throws {NotImplementedException} always. */
  async findBudgetById(): Promise<Budget | null> {
    return Promise.reject(notYetPersistent('findBudgetById'))
  }

  /** Budget port: scope matching. @throws {NotImplementedException} always. */
  async findMatching(): Promise<Budget[]> {
    return Promise.reject(notYetPersistent('findMatching'))
  }

  /** Budget port: atomic conditional consume. @throws {NotImplementedException} always. */
  async conditionalConsume(): Promise<boolean> {
    return Promise.reject(notYetPersistent('conditionalConsume'))
  }

  /** Budget port: signed window adjustment. @throws {NotImplementedException} always. */
  async adjustWindow(): Promise<void> {
    return Promise.reject(notYetPersistent('adjustWindow'))
  }

  /** Budget port: window spend lookup. @throws {NotImplementedException} always. */
  async getWindow(): Promise<BudgetWindowSpend | null> {
    return Promise.reject(notYetPersistent('getWindow'))
  }

  /** Budget port: window rotation support. @throws {NotImplementedException} always. */
  async setWindowStart(): Promise<void> {
    return Promise.reject(notYetPersistent('setWindowStart'))
  }
}
