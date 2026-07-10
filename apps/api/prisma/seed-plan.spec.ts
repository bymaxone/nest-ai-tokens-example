/**
 * Unit tests for the deterministic seed plan.
 *
 * Layer: unit.
 * Goal: prove the plan is deterministic, internally consistent (balances,
 * tenant separation, unique keys, date bounds) and shaped as documented, so
 * charts and later e2e suites can assert exact values.
 * Mocks: none; the plan builder is pure.
 */
import { describe, expect, it } from '@jest/globals'

import {
  DEMO_TENANTS,
  DEMO_USERS,
  MONTHLY_ALLOCATION_NANO_USD,
  SEED_EPOCH,
  TRIAL_ALLOCATION_NANO_USD,
  buildSeedPlan,
} from './seed-plan.js'

const MS_PER_DAY = 86_400_000

describe('buildSeedPlan', () => {
  const plan = buildSeedPlan()

  /**
   * Determinism is the seed's core contract: two independent builds must be
   * byte-identical so re-running the seed (and asserting exact values in
   * tests and charts) is safe at any time on any machine.
   */
  it('returns an identical plan on every call', () => {
    expect(buildSeedPlan()).toEqual(plan)
  })

  /**
   * Documented row counts: one wallet per demo user, one monthly grant each
   * plus ada's trial grant, and 72 user debits + 4 system rows of history.
   */
  it('plans 3 wallets, 4 grant entries and 76 usage records', () => {
    expect(plan.wallets).toHaveLength(3)
    expect(plan.walletEntries).toHaveLength(4)
    expect(plan.usageRecords).toHaveLength(76)
  })

  /**
   * Known balance per user: ada holds monthly + trial credit, everyone else
   * the monthly grant only, and every materialized wallet balance equals the
   * sum of its entries (the library's wallet invariant).
   */
  it('materializes each wallet balance as the exact sum of its grants', () => {
    const ada = plan.wallets.find((wallet) => wallet.ownerId === 'ada')
    expect(ada?.balanceNanoUsd).toBe(MONTHLY_ALLOCATION_NANO_USD + TRIAL_ALLOCATION_NANO_USD)
    for (const wallet of plan.wallets) {
      const entrySum = plan.walletEntries
        .filter((entry) => entry.walletId === wallet.id)
        .reduce((sum, entry) => sum + BigInt(entry.amountNanoUsd), 0n)
      expect(wallet.balanceNanoUsd).toBe(entrySum)
    }
  })

  /**
   * Tenant separation: every user-scoped row carries exactly its user's
   * tenant, both tenants have data, and the two datasets never overlap.
   */
  it('keeps acme and globex data disjoint and non-empty', () => {
    const tenantOf = new Map(DEMO_USERS.map((user) => [user.name, user.tenantId]))
    for (const record of plan.usageRecords) {
      if (record.scopeType === 'user') {
        expect(record.tenantId).toBe(tenantOf.get(record.scopeId))
      }
    }
    const byTenant = (tenantId: string): number =>
      plan.usageRecords.filter((record) => record.tenantId === tenantId).length
    expect(byTenant('acme')).toBe(52)
    expect(byTenant('globex')).toBe(24)
    expect(byTenant('acme') + byTenant('globex')).toBe(plan.usageRecords.length)
  })

  /**
   * Date bounds: history spreads across the 90 days before SEED_EPOCH and
   * never into the future, so "last 90 days" charts have stable shapes.
   */
  it('places every usage record within the 91 days before the epoch', () => {
    const floor = SEED_EPOCH.getTime() - 91 * MS_PER_DAY
    for (const record of plan.usageRecords) {
      const occurredAt = new Date(record.occurredAt).getTime()
      expect(occurredAt).toBeGreaterThanOrEqual(floor)
      expect(occurredAt).toBeLessThanOrEqual(SEED_EPOCH.getTime())
    }
  })

  /**
   * The schema enforces @@unique([tenantId, idempotencyKey]); the plan must
   * satisfy it up front or the createMany insert would fail.
   */
  it('never repeats an idempotency key within a tenant', () => {
    for (const tenantId of DEMO_TENANTS) {
      const keys = plan.usageRecords
        .filter((record) => record.tenantId === tenantId)
        .map((record) => record.idempotencyKey)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  /**
   * Billing shape: user traffic carries the demo 1.25 markup (billed =
   * raw * 1.25) while system costs bill at raw cost with multiplier 1.
   */
  it('applies the demo markup to user rows and none to system rows', () => {
    for (const record of plan.usageRecords) {
      const raw = BigInt(record.rawCostNanoUsd)
      const billed = BigInt(record.billedCostNanoUsd)
      if (record.isSystemCost === true) {
        expect(record.markupMultiplier).toBe('1')
        expect(billed).toBe(raw)
      } else {
        expect(record.markupMultiplier).toBe('1.25')
        expect(billed).toBe((raw * 125n) / 100n)
      }
    }
  })

  /**
   * System-cost rows: exactly two 'reindex' maintenance rows per tenant,
   * scoped to the tenant itself, so the system-cost boards render from boot.
   */
  it('plans two reindex system-cost rows per tenant', () => {
    const systemRows = plan.usageRecords.filter((record) => record.isSystemCost === true)
    expect(systemRows).toHaveLength(4)
    for (const record of systemRows) {
      expect(record.systemCostCategory).toBe('reindex')
      expect(record.scopeType).toBe('tenant')
      expect(record.scopeId).toBe(record.tenantId)
    }
  })

  /**
   * Provider realism guard: every seeded row comes from the deterministic
   * mock provider and totals its token fields, keeping the no-real-AI claim
   * true down to the fixtures.
   */
  it('marks every row as mock-provider traffic with consistent totals', () => {
    for (const record of plan.usageRecords) {
      expect(record.provider).toBe('mock')
      expect(record.totalTokens).toBe((record.inputTokens ?? 0) + (record.outputTokens ?? 0))
    }
  })
})
