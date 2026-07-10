/**
 * Unit tests for the placeholder persistence adapter.
 *
 * Layer: unit.
 * Goal: prove every data method rejects with a 501 naming the method and its
 * Prisma successor, and that the reaper-facing scan is the one benign no-op.
 * Mocks: none; the placeholder is self-contained.
 */
import { NotImplementedException } from '@nestjs/common'
import { describe, expect, it } from '@jest/globals'

import { PlaceholderAiTokensStore } from './placeholder-ai-tokens.store.js'

const store = new PlaceholderAiTokensStore()

/** Every method that must reject until the Prisma store lands. */
const THROWING_METHODS = [
  'append',
  'transition',
  'findByIdempotencyKey',
  'findById',
  'query',
  'sumCost',
  'lastHash',
  'resolveRate',
  'upsertPrice',
  'getPriceHistory',
  'listModels',
  'getWallet',
  'appendEntry',
  'conditionalDebit',
  'openGrants',
  'listEntries',
  'reconcile',
  'upsert',
  'remove',
  'findBudgetById',
  'findMatching',
  'conditionalConsume',
  'adjustWindow',
  'getWindow',
  'setWindowStart',
] as const

describe('PlaceholderAiTokensStore', () => {
  /**
   * Not-yet-persistent contract.
   *
   * Each data method rejects with a 501 whose message names both the called
   * method (debuggability) and the successor adapter (discoverability), so
   * an accidental data-path call is loud and self-explanatory.
   */
  it.each(THROWING_METHODS.map((method) => [method]))(
    '%s rejects with a 501 naming the method and the Prisma successor',
    async (method) => {
      const call = store[method].bind(store) as () => Promise<unknown>
      expect.assertions(3)
      try {
        await call()
      } catch (error) {
        expect(error).toBeInstanceOf(NotImplementedException)
        const message = (error as NotImplementedException).message
        expect(message).toContain(`PlaceholderAiTokensStore.${method}`)
        expect(message).toContain('PrismaAiTokensStore')
      }
    },
  )

  /**
   * Reaper safety exception.
   *
   * The library's hold reaper periodically scans for expired holds; against
   * the placeholder that scan must return an empty batch instead of
   * rejecting, or the background sweep would surface unhandled rejections.
   */
  it('findExpiredHolds returns an empty batch', async () => {
    await expect(store.findExpiredHolds()).resolves.toEqual([])
  })
})
