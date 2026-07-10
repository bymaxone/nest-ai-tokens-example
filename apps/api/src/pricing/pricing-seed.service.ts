/**
 * @fileoverview Idempotent boot seed for the price registry: the library's
 * pinned snapshot (`MODEL_PRICES_SEED`) plus the mock provider's models.
 *
 * The app owns this seed instead of enabling the library's
 * `pricing.seedFromSnapshot`: the library seed serializes CONCURRENT boots
 * with a session advisory lock but re-runs on a later fresh boot, closing
 * and reinserting every open snapshot row, so the price table would grow on
 * every restart. This seed is restart-stable AND race-safe: one transaction
 * takes a transaction-scoped advisory lock (concurrent boots serialize),
 * checks whether any seed-sourced row exists (later boots skip), and
 * inserts every row with `skipDuplicates` (the schema's single-open-row
 * partial unique index makes even an out-of-band race a no-op instead of a
 * violation).
 *
 * @layer pricing
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { OnApplicationBootstrap } from '@nestjs/common'
import { MODEL_PRICES_SEED } from '@bymax-one/nest-ai-tokens/prices'
import type { SeedPriceRow } from '@bymax-one/nest-ai-tokens/prices'
import type { Prisma } from '@prisma/client'

import { MOCK_MODEL_PRICES, MOCK_PRICE_SOURCE } from './mock-model-prices.js'
import { PrismaService } from '../prisma/prisma.service.js'

/** Advisory-lock key serializing concurrent boot seeds. */
export const PRICING_SEED_LOCK_KEY = 'nest-ai-tokens-example:pricing-seed'

/**
 * Effective-from anchor for every seeded row: the epoch, mirroring the
 * library's own snapshot seed so backdated cost calculations always find a
 * window.
 */
export const SEED_EFFECTIVE_FROM = new Date(0)

/** Provenance values whose presence marks the seed as already applied. */
export const SEED_SOURCES: readonly string[] = ['snapshot', MOCK_PRICE_SOURCE]

/**
 * Map one seed row to a `createMany` input. Money stays bigint end to end;
 * the JSON `unitRates` column persists nano-USD as decimal strings, the
 * exact wire format the library's store adapter reads back into bigint.
 *
 * @param row The seed row (library snapshot or mock model).
 * @returns The Prisma insert input for the open, epoch-anchored window.
 */
export function toPriceCreateInput(row: SeedPriceRow): Prisma.AiModelPriceCreateManyInput {
  return {
    provider: row.provider,
    model: row.model,
    operation: row.operation,
    serviceTier: row.serviceTier,
    inputNanoUsdPerMillion: row.inputNanoUsdPerMillion,
    outputNanoUsdPerMillion: row.outputNanoUsdPerMillion,
    cacheReadNanoUsdPerMillion: row.cacheReadNanoUsdPerMillion,
    cacheWrite5mNanoUsdPerMillion: row.cacheWrite5mNanoUsdPerMillion,
    cacheWrite1hNanoUsdPerMillion: row.cacheWrite1hNanoUsdPerMillion,
    reasoningNanoUsdPerMillion: row.reasoningNanoUsdPerMillion,
    audioInNanoUsdPerMillion: row.audioInNanoUsdPerMillion,
    audioOutNanoUsdPerMillion: row.audioOutNanoUsdPerMillion,
    imageInNanoUsdPerMillion: row.imageInNanoUsdPerMillion,
    imageOutNanoUsdPerMillion: row.imageOutNanoUsdPerMillion,
    ...(row.tierThresholdTokens === undefined
      ? {}
      : { tierThresholdTokens: row.tierThresholdTokens }),
    ...(row.tierInputNanoUsdPerMillion === undefined
      ? {}
      : { tierInputNanoUsdPerMillion: row.tierInputNanoUsdPerMillion }),
    ...(row.tierOutputNanoUsdPerMillion === undefined
      ? {}
      : { tierOutputNanoUsdPerMillion: row.tierOutputNanoUsdPerMillion }),
    ...(row.unitRates === undefined ? {} : { unitRates: stringifyUnitRates(row.unitRates) }),
    currency: row.currency,
    effectiveFrom: SEED_EFFECTIVE_FROM,
    effectiveTo: null,
    source: row.source,
  }
}

/**
 * Encode a bigint unit-rate map as the decimal-string JSON the store reads.
 *
 * @param unitRates Non-token line-item rates in nano-USD per unit.
 * @returns The JSON-safe map of decimal strings.
 */
function stringifyUnitRates(unitRates: Record<string, bigint>): Record<string, string> {
  return Object.fromEntries(Object.entries(unitRates).map(([key, value]) => [key, `${value}`]))
}

/**
 * Every row the boot seed writes: the library snapshot plus the mock models.
 *
 * @returns The insert inputs in stable order.
 */
export function buildPricingSeedRows(): Prisma.AiModelPriceCreateManyInput[] {
  return [...MODEL_PRICES_SEED, ...MOCK_MODEL_PRICES].map(toPriceCreateInput)
}

/**
 * Render an unknown boot-seed failure for the log line without assuming an
 * Error instance (driver layers can reject with plain values).
 *
 * @param error The rejection value.
 * @returns The message to log.
 */
export function describeSeedError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

/** Seeds the price registry exactly once per database. */
@Injectable()
export class PricingSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PricingSeedService.name)

  /**
   * @param prisma The application Prisma client.
   */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Run the seed when the application finishes bootstrapping. Best-effort
   * by design: this app boots without a reachable database (the readiness
   * probe surfaces the outage), so a seed failure is logged and boot
   * continues; the seed re-runs on the next boot and strict pricing keeps
   * any resulting rate misses loud.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const inserted = await this.seed()
      if (inserted > 0) this.logger.log(`Seeded ${inserted} price rows`)
    } catch (error) {
      this.logger.error(`Pricing seed failed: ${describeSeedError(error)}`)
    }
  }

  /**
   * Seed the registry idempotently. See the file overview for the
   * lock-check-insert protocol that makes this restart-stable and race-safe.
   *
   * @returns The number of rows inserted (0 when the seed already ran).
   */
  async seed(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      // Serialize concurrent boots: the lock is transaction-scoped, so the
      // loser of the race waits, re-checks, and skips.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${PRICING_SEED_LOCK_KEY})::bigint)`
      const existing = await tx.aiModelPrice.count({
        where: { source: { in: [...SEED_SOURCES] } },
      })
      if (existing > 0) return 0
      const created = await tx.aiModelPrice.createMany({
        data: buildPricingSeedRows(),
        skipDuplicates: true,
      })
      return created.count
    })
  }
}
