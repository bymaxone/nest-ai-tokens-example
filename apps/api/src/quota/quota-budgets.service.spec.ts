/**
 * Unit tests for the budget admin/read service.
 *
 * Layer: unit.
 * Goal: prove the admin gate (only root mutates), the disabled-feature
 * verdict (503 with the canonical envelope when the library bound
 * BudgetService to null), the exact UpsertBudgetInput mapping (optional
 * fields spread only when present; the money limit stays bigint), and the
 * caller-scoped listing with live status, all JSON-safe.
 * Mocks: a BudgetService double (upsertBudget/list/status).
 */
import { describe, expect, it, jest } from '@jest/globals'
import { ForbiddenException } from '@nestjs/common'
import type { Budget, BudgetService, BudgetStatus } from '@bymax-one/nest-ai-tokens'

import { upsertBudgetBodySchema } from './dto/upsert-budget.body.js'
import { QuotaBudgetsService } from './quota-budgets.service.js'
import { ApiException } from '../common/api-exception.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

const root: DemoIdentity = { id: 'root', tenantId: 'acme' }
const ada: DemoIdentity = { id: 'ada', tenantId: 'acme' }

/** A complete budget row for the doubles to return. */
function budgetWith(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-1',
    tenantId: 'acme',
    scope: { type: 'user', id: 'ada' },
    limitNanoUsd: 5_000_000_000n,
    window: 'month',
    softThresholds: [0.8, 1],
    policy: 'block',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  }
}

/** A live status row for the listing double. */
function statusWith(): BudgetStatus {
  return {
    budgetId: 'budget-1',
    window: 'month',
    windowStart: new Date('2026-07-01T00:00:00.000Z'),
    resetsAt: new Date('2026-08-01T00:00:00.000Z'),
    policy: 'block',
    limit: { nanoUsd: 5_000_000_000n },
    spent: { nanoUsd: 1_000n, tokens: 10, count: 1 },
    remaining: { nanoUsd: 4_999_999_000n },
    usedFraction: 0.0000002,
  }
}

/** The service under test plus its observable BudgetService double. */
function serviceWith() {
  const upsertBudget = jest.fn<BudgetService['upsertBudget']>().mockResolvedValue(budgetWith())
  const list = jest.fn<BudgetService['list']>().mockResolvedValue([budgetWith()])
  const status = jest.fn<BudgetService['status']>().mockResolvedValue([statusWith()])
  const double: Pick<BudgetService, 'upsertBudget' | 'list' | 'status'> = {
    upsertBudget,
    list,
    status,
  }
  // Single widening assertion at the fixture boundary: the service consumes
  // exactly these members of the class type.
  const service = new QuotaBudgetsService(double as BudgetService)
  return { service, upsertBudget, list, status }
}

describe('upsert', () => {
  /**
   * Admin gate.
   *
   * Budget mutation is admin plane: any non-root identity is rejected 403
   * before the library is touched.
   */
  it('rejects non-admin callers with 403', async () => {
    const { service, upsertBudget } = serviceWith()
    const body = upsertBudgetBodySchema.parse({
      scopeType: 'user',
      scopeId: 'ada',
      limitCount: 1,
    })

    await expect(service.upsert(ada, body)).rejects.toBeInstanceOf(ForbiddenException)
    expect(upsertBudget).not.toHaveBeenCalled()
  })

  /**
   * Full input mapping.
   *
   * Every present field lands on the UpsertBudgetInput (the money limit
   * still bigint), the tenant comes from the admin's effective tenant,
   * and the stored budget returns JSON-safe.
   */
  it('maps the full body onto UpsertBudgetInput and returns JSON-safe', async () => {
    const { service, upsertBudget } = serviceWith()
    const body = upsertBudgetBodySchema.parse({
      scopeType: 'user',
      scopeId: 'ada',
      limitNanoUsd: '5000000000',
      limitTokens: 100,
      limitCount: 2,
      window: 'day',
      policy: 'throttle',
      features: ['quota.lab.constant'],
    })

    const stored = await service.upsert(root, body)

    expect(upsertBudget).toHaveBeenCalledWith({
      tenantId: 'acme',
      scope: { type: 'user', id: 'ada' },
      window: 'day',
      limitNanoUsd: 5_000_000_000n,
      limitTokens: 100,
      limitCount: 2,
      policy: 'throttle',
      features: ['quota.lab.constant'],
    })
    expect(stored.limitNanoUsd).toBe('5000000000')
    expect(stored.id).toBe('budget-1')
  })

  /**
   * Minimal input mapping.
   *
   * Absent optionals are NOT spread onto the input (the library
   * distinguishes absent = unlimited / default from present values).
   */
  it('omits absent optional fields from the input', async () => {
    const { service, upsertBudget } = serviceWith()
    const body = upsertBudgetBodySchema.parse({
      scopeType: 'tenant',
      scopeId: 'acme',
      limitTokens: 0,
    })

    await service.upsert(root, body)

    expect(upsertBudget).toHaveBeenCalledWith({
      tenantId: 'acme',
      scope: { type: 'tenant', id: 'acme' },
      window: 'month',
      limitTokens: 0,
    })
  })
})

describe('list', () => {
  /**
   * Caller-scoped listing with live status.
   *
   * The listing pins the caller's user scope and returns budgets + status
   * JSON-safe (bigint limits as decimal strings).
   */
  it('lists the caller budgets with status, JSON-safe', async () => {
    const { service, list, status } = serviceWith()

    const result = await service.list(ada)

    expect(list).toHaveBeenCalledWith('acme', { type: 'user', id: 'ada' })
    expect(status).toHaveBeenCalledWith('acme', { type: 'user', id: 'ada' })
    expect(result.budgets[0]?.limitNanoUsd).toBe('5000000000')
    expect(result.status[0]?.spent.nanoUsd).toBe('1000')
  })
})

describe('disabled feature', () => {
  /**
   * Null-bound BudgetService verdict.
   *
   * With QUOTA_ENABLED=false the library binds BudgetService to null;
   * both endpoints answer the canonical quota.disabled envelope with 503
   * instead of crashing on a null dereference.
   */
  it('rejects with quota.disabled 503 when budgets are off', async () => {
    const service = new QuotaBudgetsService(null)
    const body = upsertBudgetBodySchema.parse({
      scopeType: 'user',
      scopeId: 'ada',
      limitCount: 1,
    })

    await expect(service.upsert(root, body)).rejects.toMatchObject({ code: 'quota.disabled' })
    await expect(service.list(ada)).rejects.toBeInstanceOf(ApiException)
  })
})
