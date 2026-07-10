/**
 * Unit tests for the idempotent seed writer.
 *
 * Layer: unit.
 * Goal: prove `runSeed` deletes only what the seed owns, respects the
 * foreign-key ordering, reports exact counts, and converges to the same state
 * when run repeatedly (idempotency).
 * Mocks: an in-memory `SeedDatabase` fake; no real database is touched.
 */
import { describe, expect, it } from '@jest/globals'
import type { Prisma } from '@prisma/client'

import { buildSeedPlan } from './seed-plan.js'
import { runSeed } from './seed-runner.js'
import type { SeedDatabase } from './seed-runner.js'

/** Allocation row as the fake stores it: resolved to its entries' wallets. */
interface FakeAllocation {
  debitWalletId: string
  grantWalletId: string
}

/** In-memory row stores backing the fake client, keyed by row id. */
interface FakeState {
  usage: Map<string, Prisma.AiUsageRecordCreateManyInput>
  allocations: Map<string, FakeAllocation>
  entries: Map<string, Prisma.AiWalletEntryCreateManyInput>
  wallets: Map<string, Prisma.AiWalletCreateManyInput>
}

/** Removes every row matching the predicate and returns how many were removed. */
function deleteBy<Row>(rows: Map<string, Row>, matches: (row: Row) => boolean): number {
  let count = 0
  for (const [id, row] of rows) {
    if (matches(row)) {
      rows.delete(id)
      count += 1
    }
  }
  return count
}

/** Inserts rows enforcing the primary key, exactly like the real database. */
function insertAll<Row extends { id?: string }>(rows: Map<string, Row>, data: Row[]): number {
  for (const row of data) {
    if (row.id === undefined || rows.has(row.id)) {
      throw new Error('duplicate or missing id')
    }
    rows.set(row.id, row)
  }
  return data.length
}

/** Builds a stateful, fully typed in-memory SeedDatabase plus its call log. */
function fakeDatabase(): { db: SeedDatabase; state: FakeState; calls: string[] } {
  const calls: string[] = []
  const state: FakeState = {
    usage: new Map(),
    allocations: new Map(),
    entries: new Map(),
    wallets: new Map(),
  }
  const db: SeedDatabase = {
    aiUsageRecord: {
      deleteMany: ({ where }) => {
        calls.push('delete:usage')
        return Promise.resolve({
          count: deleteBy(state.usage, (row) => where.tenantId.in.includes(row.tenantId)),
        })
      },
      createMany: ({ data }) => {
        calls.push('create:usage')
        return Promise.resolve({ count: insertAll(state.usage, data) })
      },
    },
    aiWalletDebitAllocation: {
      deleteMany: ({ where }) => {
        calls.push('delete:allocation')
        const [debitFilter, grantFilter] = where.OR
        const debitWallets = debitFilter.debitEntry.walletId.in
        const grantWallets = grantFilter.grantEntry.walletId.in
        return Promise.resolve({
          count: deleteBy(
            state.allocations,
            (row) =>
              debitWallets.includes(row.debitWalletId) || grantWallets.includes(row.grantWalletId),
          ),
        })
      },
    },
    aiWalletEntry: {
      deleteMany: ({ where }) => {
        calls.push('delete:entry')
        return Promise.resolve({
          count: deleteBy(state.entries, (row) => where.walletId.in.includes(row.walletId)),
        })
      },
      createMany: ({ data }) => {
        calls.push('create:entry')
        return Promise.resolve({ count: insertAll(state.entries, data) })
      },
    },
    aiWallet: {
      deleteMany: ({ where }) => {
        calls.push('delete:wallet')
        return Promise.resolve({
          count: deleteBy(state.wallets, (row) => where.tenantId.in.includes(row.tenantId)),
        })
      },
      createMany: ({ data }) => {
        calls.push('create:wallet')
        return Promise.resolve({ count: insertAll(state.wallets, data) })
      },
    },
  }
  return { db, state, calls }
}

describe('runSeed', () => {
  /**
   * Exact counts: the summary must report precisely what the deterministic
   * plan contains, giving the CLI output asserted-upon numbers.
   */
  it('writes the full plan and reports its exact counts', async () => {
    const { db } = fakeDatabase()

    const summary = await runSeed(db)

    const plan = buildSeedPlan()
    expect(summary).toEqual({
      wallets: plan.wallets.length,
      walletEntries: plan.walletEntries.length,
      usageRecords: plan.usageRecords.length,
    })
  })

  /**
   * Foreign-key ordering: children are deleted before parents and parents
   * are created before children, otherwise Postgres rejects the run.
   */
  it('deletes children before parents and creates parents before children', async () => {
    const { db, calls } = fakeDatabase()

    await runSeed(db)

    expect(calls).toEqual([
      'delete:allocation',
      'delete:usage',
      'delete:entry',
      'delete:wallet',
      'create:wallet',
      'create:entry',
      'create:usage',
    ])
  })

  /**
   * Restrictive foreign keys: allocations that runtime activity attached to a
   * seeded wallet's entries must be removed by the seed, or the entry
   * deletion would violate the allocation's RESTRICT foreign keys on re-run.
   */
  it('removes runtime debit allocations attached to seeded wallets', async () => {
    const { db, state } = fakeDatabase()
    await runSeed(db)
    const seededWalletId = [...buildSeedPlan().walletIds][0]
    if (seededWalletId === undefined) {
      throw new Error('seed plan has no wallets')
    }
    state.allocations.set('alloc-runtime', {
      debitWalletId: seededWalletId,
      grantWalletId: seededWalletId,
    })
    state.allocations.set('alloc-foreign', {
      debitWalletId: 'unrelated-wallet',
      grantWalletId: 'unrelated-wallet',
    })

    await runSeed(db)

    expect(state.allocations.has('alloc-runtime')).toBe(false)
    expect(state.allocations.has('alloc-foreign')).toBe(true)
  })

  /**
   * Idempotency: a second run must converge to the exact same state, not
   * duplicate rows (the delete-first strategy plus stable ids guarantee it).
   */
  it('leaves the database unchanged when run twice', async () => {
    const { db, state } = fakeDatabase()

    await runSeed(db)
    const firstState = {
      usage: new Map(state.usage),
      entries: new Map(state.entries),
      wallets: new Map(state.wallets),
    }
    const secondSummary = await runSeed(db)

    expect(state.usage).toEqual(firstState.usage)
    expect(state.entries).toEqual(firstState.entries)
    expect(state.wallets).toEqual(firstState.wallets)
    expect(secondSummary.usageRecords).toBe(buildSeedPlan().usageRecords.length)
  })
})
