/**
 * @fileoverview Idempotent writer for the deterministic demo seed.
 *
 * Applies the plan from `seed-plan.ts` against any client that structurally
 * matches {@link SeedDatabase} (the real `PrismaClient` does; tests pass an
 * in-memory fake). Idempotency strategy: delete-first, then insert. Every row
 * the seed owns is removed (usage records by seeded tenant, wallet entries by
 * seeded wallet id, wallets by seeded tenant), and debit allocations that
 * runtime activity may have attached to the seeded wallets' entries are
 * removed first so the restrictive foreign keys never block the entry
 * deletion. The plan is then re-inserted with its stable ids, so any number
 * of runs converges to the same state.
 *
 * @layer service
 */
import type { Prisma } from '@prisma/client'

import { buildSeedPlan } from './seed-plan.js'

/** Result shape shared by Prisma's `deleteMany` and `createMany`. */
interface AffectedRows {
  count: number
}

/** Filter selecting allocations attached to any of the given wallets. */
export interface AllocationsByWalletFilter {
  OR: [
    { debitEntry: { walletId: { in: string[] } } },
    { grantEntry: { walletId: { in: string[] } } },
  ]
}

/** The subset of `PrismaClient` the seed writer needs. */
export interface SeedDatabase {
  aiUsageRecord: {
    deleteMany(args: { where: { tenantId: { in: string[] } } }): Promise<AffectedRows>
    createMany(args: { data: Prisma.AiUsageRecordCreateManyInput[] }): Promise<AffectedRows>
  }
  aiWalletDebitAllocation: {
    deleteMany(args: { where: AllocationsByWalletFilter }): Promise<AffectedRows>
  }
  aiWalletEntry: {
    deleteMany(args: { where: { walletId: { in: string[] } } }): Promise<AffectedRows>
    createMany(args: { data: Prisma.AiWalletEntryCreateManyInput[] }): Promise<AffectedRows>
  }
  aiWallet: {
    deleteMany(args: { where: { tenantId: { in: string[] } } }): Promise<AffectedRows>
    createMany(args: { data: Prisma.AiWalletCreateManyInput[] }): Promise<AffectedRows>
  }
}

/** Row counts written by one seed run. */
export interface SeedSummary {
  wallets: number
  walletEntries: number
  usageRecords: number
}

/**
 * Seeds the demo dataset, replacing any previous seed output.
 *
 * Deletes children before parents (debit allocations before entries, entries
 * before wallets) to respect the foreign keys, then inserts parents before
 * children. The seed never creates allocations itself; deleting them covers
 * runtime activity that attached allocations to the seeded wallets' entries,
 * whose restrictive foreign keys would otherwise block the entry deletion.
 *
 * @param db - Prisma client (or a structural stand-in) to write through.
 * @returns Counts of the rows written.
 */
export async function runSeed(db: SeedDatabase): Promise<SeedSummary> {
  const plan = buildSeedPlan()
  const tenantIds = [...plan.tenantIds]
  const walletIds = [...plan.walletIds]

  await db.aiWalletDebitAllocation.deleteMany({
    where: {
      OR: [
        { debitEntry: { walletId: { in: walletIds } } },
        { grantEntry: { walletId: { in: walletIds } } },
      ],
    },
  })
  await db.aiUsageRecord.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await db.aiWalletEntry.deleteMany({ where: { walletId: { in: walletIds } } })
  await db.aiWallet.deleteMany({ where: { tenantId: { in: tenantIds } } })

  const wallets = await db.aiWallet.createMany({ data: [...plan.wallets] })
  const walletEntries = await db.aiWalletEntry.createMany({ data: [...plan.walletEntries] })
  const usageRecords = await db.aiUsageRecord.createMany({ data: [...plan.usageRecords] })

  return {
    wallets: wallets.count,
    walletEntries: walletEntries.count,
    usageRecords: usageRecords.count,
  }
}
