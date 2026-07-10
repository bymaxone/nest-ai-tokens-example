/**
 * @fileoverview Pricing catalog service: the current-price listing, the
 * per-model history, and the admin price update.
 *
 * The current listing is a HOST-OWNED read: the shipped pricing port has no
 * all-current method (`resolveRate`/`getPriceHistory`/`listModels` are
 * keyed per tuple), and the host owns the schema, so the catalog queries
 * the open windows (`effectiveTo IS NULL`) directly through Prisma with
 * filtering and ordering in the database. History and updates go through
 * the library's `PricingService` (the update atomically closes the current
 * window, inserts the successor, and invalidates the resolution cache).
 * All bigint money maps to decimal strings at this HTTP boundary via the
 * library's `toJsonSafe`.
 *
 * @layer pricing
 */
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { PricingService, toJsonSafe } from '@bymax-one/nest-ai-tokens'
import type { JsonSafe, NewPriceVersion, PriceVersion } from '@bymax-one/nest-ai-tokens'
import type { AiModelPrice } from '@prisma/client'

import type { PriceHistoryQuery } from './dto/price-history.query.js'
import type { UpdatePriceBody } from './dto/update-price.body.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import { PrismaService } from '../prisma/prisma.service.js'

/**
 * The demo identity allowed to mutate prices. Price updates are ADMIN
 * PLANE per the library's docs (the host MUST restrict them); this demo
 * stands in for real role-based access with its fixed global admin.
 */
export const PRICING_ADMIN_USER_ID = 'root'

/** A JSON-safe open price row served by `GET /pricing`. */
export type CurrentPriceView = JsonSafe<AiModelPrice>

/** A JSON-safe price version served by history and update responses. */
export type PriceVersionView = JsonSafe<PriceVersion>

/**
 * Provenance recorded on admin-updated rows, distinguishing them from
 * `'snapshot'`/seed rows in history timelines.
 */
const MANUAL_SOURCE = 'manual'

/** Serves the pricing catalog and the admin update. */
@Injectable()
export class PricingCatalogService {
  /**
   * @param prisma The application Prisma client (open-window catalog read).
   * @param pricing The library's pricing service (history, update, cache).
   */
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PricingService) private readonly pricing: PricingService,
  ) {}

  /**
   * Every currently-open price window, ordered for stable rendering. The
   * WHERE and ORDER BY run in the database; only open rows travel.
   *
   * @returns The JSON-safe open rows.
   */
  async current(): Promise<{ items: CurrentPriceView[] }> {
    const rows = await this.prisma.aiModelPrice.findMany({
      where: { effectiveTo: null },
      orderBy: [
        { provider: 'asc' },
        { model: 'asc' },
        { operation: 'asc' },
        { serviceTier: 'asc' },
      ],
    })
    return { items: toJsonSafe(rows) }
  }

  /**
   * The full effective-dated history for one tuple, newest first.
   *
   * @param model The model half of the tuple (path parameter).
   * @param query Provider, operation, and optional tier filter.
   * @returns The JSON-safe versions.
   * @throws {NotFoundException} when the tuple has no history at all.
   */
  async history(model: string, query: PriceHistoryQuery): Promise<{ items: PriceVersionView[] }> {
    const versions = await this.pricing.getPriceHistory(
      query.provider,
      model,
      query.operation,
      query.serviceTier,
    )
    if (versions.length === 0) throw new NotFoundException('No pricing history for this model')
    return { items: toJsonSafe(versions) }
  }

  /**
   * Close the tuple's current window and insert the successor (atomic in
   * the store, resolution cache invalidated by the library). ADMIN PLANE:
   * restricted to the demo admin; a real service replaces this check with
   * its role system.
   *
   * @param identity The caller (must be the demo admin).
   * @param model The model half of the tuple (path parameter).
   * @param body The validated new rates.
   * @returns The JSON-safe successor (open) row.
   * @throws {ForbiddenException} when the caller is not the demo admin.
   */
  async update(
    identity: DemoIdentity,
    model: string,
    body: UpdatePriceBody,
  ): Promise<PriceVersionView> {
    if (identity.id !== PRICING_ADMIN_USER_ID) {
      throw new ForbiddenException('Price updates are restricted to the demo admin (root)')
    }
    const inserted = await this.pricing.upsertPrice(buildNewPriceVersion(model, body))
    return toJsonSafe(inserted)
  }
}

/**
 * Map the validated body to the library's `NewPriceVersion`: only provided
 * fields travel (the store defaults absent rates to `0n` and the tier to
 * `'standard'`), and provenance is server-forced to `'manual'`.
 *
 * @param model The model half of the tuple.
 * @param body The validated update body.
 * @returns The library upsert input.
 */
export function buildNewPriceVersion(model: string, body: UpdatePriceBody): NewPriceVersion {
  const { provider, operation, serviceTier, tierThresholdTokens, unitRates, ...rates } = body
  const providedRates = Object.fromEntries(
    Object.entries(rates).filter(([, value]) => value !== undefined),
  )
  return {
    provider,
    model,
    operation,
    ...(serviceTier === undefined ? {} : { serviceTier }),
    ...(tierThresholdTokens === undefined ? {} : { tierThresholdTokens }),
    ...(unitRates === undefined ? {} : { unitRates }),
    ...providedRates,
    source: MANUAL_SOURCE,
  }
}
