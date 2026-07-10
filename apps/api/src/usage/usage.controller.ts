/**
 * @fileoverview `/usage` routes: the wallet balance and the five
 * chart-ready aggregations. Thin controllers: identity extraction plus
 * delegation; the analytics service owns the library calls. Every route is
 * an identity-scoped READ with no guard and no `@Meter`: skip semantics
 * are metadata absence, so reading a report can never debit anything.
 *
 * @layer usage
 */
import { Controller, Get, Inject, Query, Req } from '@nestjs/common'

import {
  ByPeriodQueryDto,
  SystemCostsQueryDto,
  TopConsumersQueryDto,
  UsageWindowQueryDto,
} from './dto/usage-queries.js'
import { UsageAnalyticsService } from './usage-analytics.service.js'
import type { BalanceResult, UsageReportResult } from './usage-analytics.service.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'
import { requireIdentity } from '../identity/require-identity.js'

/** Serves the usage analytics surface. */
@Controller('usage')
export class UsageController {
  /**
   * @param analytics The usage analytics service.
   */
  constructor(@Inject(UsageAnalyticsService) private readonly analytics: UsageAnalyticsService) {}

  /**
   * `GET /usage/balance`: the caller's wallet balance (unmetered read).
   *
   * @param request The request carrying the simulated identity.
   * @returns The balance view.
   */
  @Get('balance')
  balance(@Req() request: AuthenticatedRequest): Promise<BalanceResult> {
    return this.analytics.balance(requireIdentity(request))
  }

  /**
   * `GET /usage/by-period`: spend per day/week/month bucket.
   *
   * @param request The request carrying the simulated identity.
   * @param query The validated window, scope switch, and granularity.
   * @returns The window plus the verbatim per-bucket rows.
   */
  @Get('by-period')
  byPeriod(
    @Req() request: AuthenticatedRequest,
    @Query() query: ByPeriodQueryDto,
  ): Promise<UsageReportResult> {
    return this.analytics.byPeriod(requireIdentity(request), query)
  }

  /**
   * `GET /usage/by-type`: spend per feature label.
   *
   * @param request The request carrying the simulated identity.
   * @param query The validated window and scope switch.
   * @returns The window plus the verbatim per-feature rows.
   */
  @Get('by-type')
  byType(
    @Req() request: AuthenticatedRequest,
    @Query() query: UsageWindowQueryDto,
  ): Promise<UsageReportResult> {
    return this.analytics.byType(requireIdentity(request), query)
  }

  /**
   * `GET /usage/by-model`: spend per model.
   *
   * @param request The request carrying the simulated identity.
   * @param query The validated window and scope switch.
   * @returns The window plus the verbatim per-model rows.
   */
  @Get('by-model')
  byModel(
    @Req() request: AuthenticatedRequest,
    @Query() query: UsageWindowQueryDto,
  ): Promise<UsageReportResult> {
    return this.analytics.byModel(requireIdentity(request), query)
  }

  /**
   * `GET /usage/top-consumers`: the tenant's heaviest spenders.
   *
   * @param request The request carrying the simulated identity.
   * @param query The validated window and topN.
   * @returns The window plus the ordered consumer rows.
   */
  @Get('top-consumers')
  topConsumers(
    @Req() request: AuthenticatedRequest,
    @Query() query: TopConsumersQueryDto,
  ): Promise<UsageReportResult> {
    return this.analytics.topConsumers(requireIdentity(request), query)
  }

  /**
   * `GET /usage/system-costs`: platform-absorbed spend by category.
   *
   * @param request The request carrying the simulated identity.
   * @param query The validated window and category filter.
   * @returns The window plus the verbatim per-category rows.
   */
  @Get('system-costs')
  systemCosts(
    @Req() request: AuthenticatedRequest,
    @Query() query: SystemCostsQueryDto,
  ): Promise<UsageReportResult> {
    return this.analytics.systemCosts(requireIdentity(request), query)
  }
}
