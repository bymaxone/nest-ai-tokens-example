/**
 * Unit tests for the ledger read service.
 *
 * Layer: unit.
 * Goal: prove the filter construction (identity scoping, tenant fallback,
 * optional-field passthrough), that the list total comes from the SQL
 * aggregate (`sumCost.records`) and never from the fetched page length, the
 * detail endpoint's 404/403 policy branches, and the JSON-safe mapping of
 * bigint money.
 * Mocks: the library LedgerService (query/sumCost/findById doubles).
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, jest } from '@jest/globals'
import type { LedgerCostSummary, LedgerService, UsageRecord } from '@bymax-one/nest-ai-tokens'

import { buildLedgerFilter, LedgerReadService } from './ledger-read.service.js'
import { DEFAULT_PAGE_SIZE, listTransactionsQuerySchema } from './dto/list-transactions.query.js'
import type { ListTransactionsQuery } from './dto/list-transactions.query.js'
import { GLOBAL_TENANT_ID } from '../ai/ai-tokens.config.js'
import { recordWith } from '../../test/fixtures/usage-record.fixture.js'

/** A parsed query with schema defaults applied plus overrides. */
function queryWith(overrides: Partial<ListTransactionsQuery> = {}): ListTransactionsQuery {
  return { ...listTransactionsQuerySchema.parse({}), ...overrides }
}

/** A zeroed cost summary with an overridable record count. */
function summaryWith(records: number): LedgerCostSummary {
  return {
    rawCostNanoUsd: 0n,
    billedCostNanoUsd: 0n,
    surchargeNanoUsd: 0n,
    totalTokens: 0,
    records,
  }
}

/** The service under test plus its library-service doubles. */
function serviceWith(rows: UsageRecord[], summary: LedgerCostSummary) {
  const query = jest.fn<LedgerService['query']>().mockResolvedValue(rows)
  const sumCost = jest.fn<LedgerService['sumCost']>().mockResolvedValue(summary)
  const findById = jest.fn<LedgerService['findById']>().mockResolvedValue(rows[0] ?? null)
  const ledger = { query, sumCost, findById } as unknown as LedgerService
  return { service: new LedgerReadService(ledger), query, sumCost, findById }
}

describe('buildLedgerFilter', () => {
  /**
   * Identity scoping.
   *
   * The filter always pins the caller's tenant and user scope, so the
   * endpoint can never list foreign rows regardless of query input.
   */
  it('pins the tenant and user scope from the identity', () => {
    const filter = buildLedgerFilter({ id: 'ada', tenantId: 'acme' }, queryWith())

    expect(filter.tenantId).toBe('acme')
    expect(filter.scope).toEqual({ type: 'user', id: 'ada' })
    expect(filter.limit).toBe(DEFAULT_PAGE_SIZE)
    expect(filter.offset).toBe(0)
  })

  /**
   * Global-tenant fallback.
   *
   * A null-tenant identity (the root admin) maps to the same global tenant
   * the module's scopeResolver uses, keeping reads and writes consistent.
   */
  it('falls back to the global tenant for a null-tenant identity', () => {
    const filter = buildLedgerFilter({ id: 'root', tenantId: null }, queryWith())

    expect(filter.tenantId).toBe(GLOBAL_TENANT_ID)
  })

  /**
   * Optional-field passthrough.
   *
   * Every provided filter reaches the library filter unchanged; absent
   * fields stay absent (never undefined-stuffed) so the store builds the
   * minimal WHERE clause.
   */
  it('passes provided filters through and omits absent ones', () => {
    const from = new Date('2026-05-01T00:00:00.000Z')
    const to = new Date('2026-06-01T00:00:00.000Z')

    const filter = buildLedgerFilter(
      { id: 'ada', tenantId: 'acme' },
      queryWith({
        feature: 'demo.chat',
        features: ['demo.chat', 'demo.embeddings'],
        provider: 'mock',
        model: 'mock-chat-pro',
        operation: 'chat',
        serviceTier: 'standard',
        status: ['posted'],
        isSystemCost: false,
        systemCostCategory: 'reindex',
        from,
        to,
        limit: 5,
        offset: 10,
      }),
    )

    expect(filter).toEqual({
      tenantId: 'acme',
      scope: { type: 'user', id: 'ada' },
      feature: 'demo.chat',
      features: ['demo.chat', 'demo.embeddings'],
      provider: 'mock',
      model: 'mock-chat-pro',
      operation: 'chat',
      serviceTier: 'standard',
      status: ['posted'],
      isSystemCost: false,
      systemCostCategory: 'reindex',
      from,
      to,
      limit: 5,
      offset: 10,
    })
    expect(Object.keys(buildLedgerFilter({ id: 'ada', tenantId: 'acme' }, queryWith()))).toEqual([
      'tenantId',
      'scope',
      'limit',
      'offset',
    ])
  })
})

describe('LedgerReadService.list', () => {
  /**
   * Total from the SQL aggregate, not the page.
   *
   * With a one-item page but a 42-row filter match, the response total must
   * be 42: the total comes from sumCost (COUNT in the database), never from
   * the fetched page length. This is the no-full-table-fetch rule.
   */
  it('reports the filter-wide total from sumCost, not the page length', async () => {
    const { service, query, sumCost } = serviceWith([recordWith()], summaryWith(42))

    const page = await service.list({ id: 'ada', tenantId: 'acme' }, queryWith({ limit: 1 }))

    expect(page.total).toBe(42)
    expect(page.items).toHaveLength(1)
    expect(page.limit).toBe(1)
    expect(page.offset).toBe(0)
    expect(query).toHaveBeenCalledTimes(1)
    const [firstQueryCall] = query.mock.calls
    if (firstQueryCall === undefined) throw new Error('query must have been called')
    expect(sumCost).toHaveBeenCalledWith(firstQueryCall[0])
  })

  /**
   * JSON-safe money.
   *
   * Bigint nano-USD cannot survive JSON.stringify; the page items must
   * carry decimal strings produced by the library's toJsonSafe.
   */
  it('maps bigint money to decimal strings', async () => {
    const { service } = serviceWith([recordWith()], summaryWith(1))

    const page = await service.list({ id: 'ada', tenantId: 'acme' }, queryWith())

    expect(page.items[0]?.billedCostNanoUsd).toBe('225000')
    expect(page.items[0]?.rawCostNanoUsd).toBe('180000')
  })
})

describe('LedgerReadService.detail', () => {
  /**
   * Unknown id.
   *
   * A missing row is a clean 404 (the id is not echoed into the body).
   */
  it('throws 404 for an unknown id', async () => {
    const { service, findById } = serviceWith([], summaryWith(0))
    findById.mockResolvedValue(null)

    await expect(service.detail({ id: 'ada', tenantId: 'acme' }, 'missing')).rejects.toThrow(
      NotFoundException,
    )
  })

  /**
   * Foreign tenant.
   *
   * A row from another tenant is 403: ownership is app-level policy and
   * tenant isolation must hold even for guessable ids.
   */
  it('throws 403 for a foreign tenant row', async () => {
    const { service } = serviceWith([recordWith({ tenantId: 'globex' })], summaryWith(1))

    await expect(
      service.detail({ id: 'ada', tenantId: 'acme' }, 'seed-usage-0001'),
    ).rejects.toThrow(ForbiddenException)
  })

  /**
   * Foreign subject.
   *
   * Same tenant but a different owner (another user, or a tenant-scoped
   * system record) is equally 403.
   */
  it.each([
    ['a foreign user row', recordWith({ scope: { type: 'user', id: 'grace' } })],
    ['a tenant-scoped system row', recordWith({ scope: { type: 'tenant', id: 'acme' } })],
  ])('throws 403 for %s', async (_label, record) => {
    const { service } = serviceWith([record], summaryWith(1))

    await expect(
      service.detail({ id: 'ada', tenantId: 'acme' }, 'seed-usage-0001'),
    ).rejects.toThrow(ForbiddenException)
  })

  /**
   * Owned row.
   *
   * The owner receives the full JSON-safe payload, including string money
   * and the metadata fields the inspector renders.
   */
  it('returns the JSON-safe record to its owner', async () => {
    const { service } = serviceWith([recordWith()], summaryWith(1))

    const record = await service.detail({ id: 'ada', tenantId: 'acme' }, 'seed-usage-0001')

    expect(record.id).toBe('seed-usage-0001')
    expect(record.billedCostNanoUsd).toBe('225000')
    expect(record.scope).toEqual({ type: 'user', id: 'ada' })
  })
})
