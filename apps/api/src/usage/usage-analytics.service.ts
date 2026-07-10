/**
 * @fileoverview The analytics read surface over the library's
 * `UsageReportService` (spec §13). Every endpoint is one `summarize` call
 * with a whitelisted `groupBy` dimension, returning the library's
 * `UsageSummary` rows VERBATIM (JSON-safe: bigint money as decimal
 * strings): the chart-ready shape a dashboard consumes without reshaping.
 * The drafted "by type" reconciles to the `feature` dimension (this app's
 * transaction types ARE its feature labels); "top consumers" is the
 * tenant-wide `scope` grouping ordered by billed spend host-side (the
 * store's summarize contract does not order groups).
 *
 * Balance reads the wallet's materialized nano-USD balance (kept
 * transactionally consistent with the append-only entry ledger), answering
 * the documented 503 when the wallet block is disabled.
 *
 * @layer usage
 */
import { Inject, Injectable } from '@nestjs/common'
import {
  UsageReportService,
  WalletService,
  formatNanoUsd,
  toJsonSafe,
} from '@bymax-one/nest-ai-tokens'
import type { JsonSafe, ReportFilter, UsageSummary } from '@bymax-one/nest-ai-tokens'

import type {
  ByPeriodQuery,
  SystemCostsQuery,
  TopConsumersQuery,
  UsageWindowQuery,
} from './dto/usage-queries.js'
import { resolveWindow } from './dto/usage-queries.js'
import { tenantIdOf, walletRefOf } from '../ai/metering-context.js'
import { ApiException } from '../common/api-exception.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

/** The caller's wallet balance view. */
export interface BalanceResult {
  /** Balance in nano-USD (decimal string; bigint-safe). */
  readonly nanoUsd: string
  /** Presentation credits (1 credit = 1 USD). */
  readonly credits: number
  /** Human-readable balance, e.g. `$52.500000`. */
  readonly formatted: string
}

/** One aggregation response: the effective window plus the verbatim rows. */
export interface UsageReportResult {
  /** The inclusive window the aggregation covered (ISO instants). */
  readonly window: { readonly from: string; readonly to: string }
  /** The library's `UsageSummary` rows, JSON-safe and untouched. */
  readonly items: JsonSafe<UsageSummary>[]
}

/** Serves the `/usage` analytics endpoints. */
@Injectable()
export class UsageAnalyticsService {
  /**
   * @param reports The library's report service (SQL/in-memory summarize).
   * @param wallets The library wallet service, or `null` when disabled.
   */
  constructor(
    @Inject(UsageReportService) private readonly reports: UsageReportService,
    @Inject(WalletService) private readonly wallets: WalletService | null,
  ) {}

  /**
   * The caller's wallet balance (`GET /usage/balance`). An unmetered,
   * unguarded read: skip semantics are metadata absence.
   *
   * @param identity The request identity (the wallet owner).
   * @returns The balance view with bigint money as decimal strings.
   * @throws {ApiException} `quota.disabled` (503) when wallets are off.
   */
  async balance(identity: DemoIdentity): Promise<BalanceResult> {
    if (this.wallets === null) {
      throw new ApiException(
        'quota.disabled',
        503,
        'Balance reads require the wallets feature block (set QUOTA_ENABLED=true).',
      )
    }
    const balance = await this.wallets.getBalance(walletRefOf(identity))
    return {
      nanoUsd: balance.nanoUsd.toString(),
      credits: balance.credits,
      formatted: formatNanoUsd(balance.nanoUsd),
    }
  }

  /**
   * Spend over time (`GET /usage/by-period`): one summary row per
   * day/week/month bucket in the window.
   *
   * @param identity The request identity.
   * @param query The validated window, scope switch, and granularity.
   * @returns The window plus the verbatim per-bucket rows.
   */
  byPeriod(identity: DemoIdentity, query: ByPeriodQuery): Promise<UsageReportResult> {
    return this.summarizeUserTraffic(identity, query, [query.granularity])
  }

  /**
   * Spend by feature (`GET /usage/by-type`): this app's transaction types
   * are its feature labels, so the drafted "by type" IS the `feature`
   * dimension.
   *
   * @param identity The request identity.
   * @param query The validated window and scope switch.
   * @returns The window plus the verbatim per-feature rows.
   */
  byType(identity: DemoIdentity, query: UsageWindowQuery): Promise<UsageReportResult> {
    return this.summarizeUserTraffic(identity, query, ['feature'])
  }

  /**
   * Spend by model (`GET /usage/by-model`).
   *
   * @param identity The request identity.
   * @param query The validated window and scope switch.
   * @returns The window plus the verbatim per-model rows.
   */
  byModel(identity: DemoIdentity, query: UsageWindowQuery): Promise<UsageReportResult> {
    return this.summarizeUserTraffic(identity, query, ['model'])
  }

  /**
   * The tenant's heaviest spenders (`GET /usage/top-consumers`): the
   * tenant-wide `scope` grouping, ordered by billed spend descending and
   * cut to `topN` host-side.
   *
   * @param identity The request identity (names the reported tenant).
   * @param query The validated window and topN.
   * @returns The window plus the ordered consumer rows.
   */
  async topConsumers(identity: DemoIdentity, query: TopConsumersQuery): Promise<UsageReportResult> {
    const window = resolveWindow(query)
    const items = await this.reports.summarize({
      ...this.baseFilter(identity, window),
      isSystemCost: false,
      groupBy: ['scope'],
    })
    const ordered = [...items].sort((a, b) =>
      a.billedCostNanoUsd === b.billedCostNanoUsd
        ? 0
        : a.billedCostNanoUsd < b.billedCostNanoUsd
          ? 1
          : -1,
    )
    return this.report(window, ordered.slice(0, query.topN))
  }

  /**
   * Platform-absorbed spend (`GET /usage/system-costs`): tenant-wide
   * system rows grouped by category, optionally filtered to one category.
   *
   * @param identity The request identity (names the reported tenant).
   * @param query The validated window and category filter.
   * @returns The window plus the verbatim per-category rows.
   */
  async systemCosts(identity: DemoIdentity, query: SystemCostsQuery): Promise<UsageReportResult> {
    const window = resolveWindow(query)
    const items = await this.reports.summarize({
      ...this.baseFilter(identity, window),
      isSystemCost: true,
      ...(query.category === undefined ? {} : { systemCostCategory: query.category }),
      groupBy: ['systemCostCategory'],
    })
    return this.report(window, items)
  }

  /** One user-traffic summarize: caller-scoped unless `scope=tenant`. */
  private async summarizeUserTraffic(
    identity: DemoIdentity,
    query: UsageWindowQuery,
    groupBy: ['day' | 'week' | 'month' | 'feature' | 'model'],
  ): Promise<UsageReportResult> {
    const window = resolveWindow(query)
    const items = await this.reports.summarize({
      ...this.baseFilter(identity, window),
      ...(query.scope === 'tenant' ? {} : { scope: { type: 'user', id: identity.id } }),
      isSystemCost: false,
      groupBy,
    })
    return this.report(window, items)
  }

  /** The tenant + window base every report filter shares. */
  private baseFilter(
    identity: DemoIdentity,
    window: { from: Date; to: Date },
  ): Pick<ReportFilter, 'tenantId' | 'from' | 'to'> {
    return { tenantId: tenantIdOf(identity), from: window.from, to: window.to }
  }

  /** Project a window and its verbatim rows into the response shape. */
  private report(window: { from: Date; to: Date }, items: UsageSummary[]): UsageReportResult {
    return {
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      items: toJsonSafe(items),
    }
  }
}
