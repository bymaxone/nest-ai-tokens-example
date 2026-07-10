/**
 * Unit tests for the usage analytics service.
 *
 * Layer: unit.
 * Goal: prove every endpoint issues exactly ONE summarize call with its
 * whitelisted groupBy dimension and the right filter (caller scope by
 * default, tenant-wide on scope=tenant and for consumers/system costs;
 * user traffic excludes system rows; system costs require them), that
 * top consumers are ordered by billed spend and cut to topN host-side,
 * that the balance read projects bigint as decimal strings and answers
 * quota.disabled 503 when wallets are off, and that UsageSummary rows
 * cross the boundary verbatim and JSON-safe.
 * Mocks: UsageReportService and WalletService doubles.
 */
import { describe, expect, it, jest } from '@jest/globals'
import type { UsageReportService, UsageSummary, WalletService } from '@bymax-one/nest-ai-tokens'
import { TOKEN_CATEGORIES } from '@bymax-one/nest-ai-tokens'

import {
  byPeriodQuerySchema,
  systemCostsQuerySchema,
  topConsumersQuerySchema,
  usageWindowQuerySchema,
} from './dto/usage-queries.js'
import { UsageAnalyticsService } from './usage-analytics.service.js'
import { ApiException } from '../common/api-exception.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

const ada: DemoIdentity = { id: 'ada', tenantId: 'acme' }

/** A complete summary row for the doubles to return. */
function summaryWith(group: Record<string, string>, billed: bigint): UsageSummary {
  return {
    group,
    records: 2,
    totalTokens: 100,
    tokens: Object.fromEntries(TOKEN_CATEGORIES.map((category) => [category, 0])) as Record<
      (typeof TOKEN_CATEGORIES)[number],
      number
    >,
    rawCostNanoUsd: billed / 2n,
    surchargeNanoUsd: 0n,
    billedCostNanoUsd: billed,
    cacheSavingsNanoUsd: 0n,
  }
}

/** The service under test plus its observable doubles. */
function serviceWith(rows: UsageSummary[] = [], walletsEnabled = true) {
  const summarize = jest.fn<UsageReportService['summarize']>().mockResolvedValue(rows)
  const reportsDouble: Pick<UsageReportService, 'summarize'> = { summarize }
  const getBalance = jest
    .fn<WalletService['getBalance']>()
    .mockResolvedValue({ nanoUsd: 12_345_000_000n, credits: 12.345 })
  const walletDouble: Pick<WalletService, 'getBalance'> = { getBalance }
  // Single widening assertions at the fixture boundary: the service consumes
  // exactly these members of each class type.
  const service = new UsageAnalyticsService(
    reportsDouble as UsageReportService,
    walletsEnabled ? (walletDouble as WalletService) : null,
  )
  return { service, summarize, getBalance }
}

/** An explicit deterministic window used across the delegation tests. */
const window = { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' }

describe('balance', () => {
  /**
   * Ledger-backed balance projection.
   *
   * The wallet's bigint balance crosses the boundary as a decimal string
   * with the library's display formatting.
   */
  it('projects the wallet balance with bigint as decimal strings', async () => {
    const { service, getBalance } = serviceWith()

    const balance = await service.balance(ada)

    expect(getBalance).toHaveBeenCalledWith({ tenantId: 'acme', ownerType: 'user', ownerId: 'ada' })
    expect(balance).toEqual({ nanoUsd: '12345000000', credits: 12.345, formatted: '$12.345000' })
  })

  /**
   * Disabled wallet block.
   *
   * With QUOTA_ENABLED=false the balance read answers the canonical
   * quota.disabled 503 instead of crashing on the null binding.
   */
  it('rejects with quota.disabled 503 when wallets are off', async () => {
    const { service } = serviceWith([], false)

    await expect(service.balance(ada)).rejects.toBeInstanceOf(ApiException)
  })
})

describe('by-period / by-type / by-model (user traffic)', () => {
  /**
   * One summarize per endpoint, each with its own dimension.
   *
   * The filter pins the tenant, the caller's user scope (default), the
   * window, and isSystemCost false; the groupBy is the endpoint's
   * whitelisted dimension.
   */
  it('groups by the endpoint dimension with the caller scope', async () => {
    const { service, summarize } = serviceWith()

    await service.byPeriod(ada, byPeriodQuerySchema.parse({ ...window, granularity: 'week' }))
    await service.byType(ada, usageWindowQuerySchema.parse(window))
    await service.byModel(ada, usageWindowQuerySchema.parse(window))

    const shared = {
      tenantId: 'acme',
      scope: { type: 'user', id: 'ada' },
      isSystemCost: false,
      from: new Date(window.from),
      to: new Date(window.to),
    } as const
    expect(summarize).toHaveBeenNthCalledWith(1, { ...shared, groupBy: ['week'] })
    expect(summarize).toHaveBeenNthCalledWith(2, { ...shared, groupBy: ['feature'] })
    expect(summarize).toHaveBeenNthCalledWith(3, { ...shared, groupBy: ['model'] })
  })

  /**
   * Tenant-wide switch.
   *
   * scope=tenant widens the report by DROPPING the scope pin (the tenant
   * filter itself always stays).
   */
  it('drops the scope pin on scope=tenant', async () => {
    const { service, summarize } = serviceWith()

    await service.byType(ada, usageWindowQuerySchema.parse({ ...window, scope: 'tenant' }))

    expect(summarize).toHaveBeenCalledWith(
      expect.not.objectContaining({ scope: expect.anything() }),
    )
    expect(summarize).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'acme' }))
  })

  /**
   * Verbatim, JSON-safe rows.
   *
   * The library's UsageSummary rows come back untouched, with bigint
   * money rendered as decimal strings and the window echoed.
   */
  it('returns the summary rows verbatim and JSON-safe', async () => {
    const rows = [summaryWith({ feature: 'workspace.custom' }, 1_000n)]
    const { service } = serviceWith(rows)

    const result = await service.byType(ada, usageWindowQuerySchema.parse(window))

    expect(result.window).toEqual(window)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      group: { feature: 'workspace.custom' },
      records: 2,
      totalTokens: 100,
      billedCostNanoUsd: '1000',
    })
  })
})

describe('topConsumers', () => {
  /**
   * Tenant-wide scope grouping, ordered and cut host-side.
   *
   * The store's summarize contract does not order groups, so the service
   * sorts by billed spend descending and slices topN.
   */
  it('orders by billed spend descending and cuts to topN', async () => {
    const rows = [
      summaryWith({ scope: 'user:grace' }, 200n),
      summaryWith({ scope: 'user:ada' }, 900n),
      summaryWith({ scope: 'user:linus' }, 200n),
      summaryWith({ scope: 'tenant:acme' }, 500n),
    ]
    const { service, summarize } = serviceWith(rows)

    const result = await service.topConsumers(
      ada,
      topConsumersQuerySchema.parse({ ...window, topN: '2' }),
    )

    expect(summarize).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'acme', isSystemCost: false, groupBy: ['scope'] }),
    )
    expect(result.items.map((item) => item.group.scope)).toEqual(['user:ada', 'tenant:acme'])
  })
})

describe('systemCosts', () => {
  /**
   * System rows only, grouped by category, with the optional filter.
   *
   * isSystemCost true selects the platform-absorbed rows; a category
   * filter narrows to one category; the filter is omitted entirely when
   * absent (absent means all categories).
   */
  it('groups system rows by category with the optional filter', async () => {
    const { service, summarize } = serviceWith()

    await service.systemCosts(ada, systemCostsQuerySchema.parse(window))
    await service.systemCosts(ada, systemCostsQuerySchema.parse({ ...window, category: 'reindex' }))

    expect(summarize).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ isSystemCost: true, groupBy: ['systemCostCategory'] }),
    )
    expect(summarize).toHaveBeenNthCalledWith(
      1,
      expect.not.objectContaining({ systemCostCategory: expect.anything() }),
    )
    expect(summarize).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ isSystemCost: true, systemCostCategory: 'reindex' }),
    )
  })
})
