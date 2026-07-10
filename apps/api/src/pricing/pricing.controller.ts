/**
 * @fileoverview `/pricing` routes: the public price catalog (current rows
 * and per-model history) and the admin price update. Thin controllers:
 * identity extraction plus delegation; the catalog service owns the reads,
 * the admin gate, and the library calls.
 *
 * The drafted `POST /pricing/cache/flush` route is intentionally absent:
 * v0.1.0 exposes no public cache-invalidation API (the resolution cache is
 * internal to `PricingService` and every `upsertPrice` clears it), so
 * there is nothing for such an endpoint to call.
 *
 * @layer pricing
 */
import { Body, Controller, Get, Inject, Param, Put, Query, Req } from '@nestjs/common'

import { PriceHistoryQueryDto } from './dto/price-history.query.js'
import { UpdatePriceBodyDto } from './dto/update-price.body.js'
import { PricingCatalogService } from './pricing-catalog.service.js'
import type { CurrentPriceView, PriceVersionView } from './pricing-catalog.service.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'
import { requireIdentity } from '../identity/require-identity.js'

/** Serves the pricing catalog and admin surface. */
@Controller('pricing')
export class PricingController {
  /**
   * @param catalog The pricing catalog service.
   */
  constructor(@Inject(PricingCatalogService) private readonly catalog: PricingCatalogService) {}

  /**
   * `GET /pricing`: every currently-open price window. Public: the catalog
   * carries no tenant or user data.
   *
   * @returns The JSON-safe open rows.
   */
  @Get()
  current(): Promise<{ items: CurrentPriceView[] }> {
    return this.catalog.current()
  }

  /**
   * `GET /pricing/:model/history`: the effective-dated window timeline for
   * one (provider, model, operation[, tier]) tuple, newest first.
   *
   * @param model The model half of the tuple.
   * @param query Provider, operation, and optional tier filter.
   * @returns The JSON-safe versions.
   */
  @Get(':model/history')
  history(
    @Param('model') model: string,
    @Query() query: PriceHistoryQueryDto,
  ): Promise<{ items: PriceVersionView[] }> {
    return this.catalog.history(model, query)
  }

  /**
   * `PUT /pricing/:model`: close the current window and insert the
   * successor (401 without an identity, 403 for non-admins; see the
   * catalog service's admin-plane note).
   *
   * @param request The request carrying the simulated identity.
   * @param model The model half of the tuple.
   * @param body The validated new rates.
   * @returns The JSON-safe successor (open) row.
   */
  @Put(':model')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('model') model: string,
    @Body() body: UpdatePriceBodyDto,
  ): Promise<PriceVersionView> {
    return this.catalog.update(requireIdentity(request), model, body)
  }
}
