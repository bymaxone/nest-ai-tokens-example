/**
 * @fileoverview Deterministic demo seed plan for the ai-tokens reference schema.
 *
 * Builds every row the seed writes (wallets, wallet grant entries, historical
 * usage records) as plain data, with stable ids, stable dates relative to
 * {@link SEED_EPOCH}, and a seeded PRNG for the value spread. Nothing here
 * touches a database, so tests can assert exact counts and balances and the
 * seed executor stays a thin writer.
 *
 * Scope note: the seed grants wallet credit and backfills usage history for
 * charts; it does not fabricate wallet debit entries or debit allocations.
 * Those rows are produced by the library's WalletService at runtime and are
 * demonstrated by later flows, not by fixtures.
 *
 * @layer utility
 */
import { createHash } from 'node:crypto'

import type { Prisma } from '@prisma/client'

/**
 * Fixed anchor for every seeded date. All usage history spreads across the 90
 * days before this instant, so re-running the seed at any wall-clock time
 * produces byte-identical rows and tests can assert exact values.
 */
export const SEED_EPOCH = new Date('2026-07-01T00:00:00.000Z')

/** Demo tenants; every seeded row belongs to exactly one of them. */
export const DEMO_TENANTS = ['acme', 'globex'] as const

/** One demo user with a wallet, credit grants, and a usage history. */
export interface SeedUser {
  /** Stable user id, also used as the usage-record scope id. */
  readonly name: string
  /** Tenant the user (and all their rows) belongs to. */
  readonly tenantId: (typeof DEMO_TENANTS)[number]
  /** Number of historical usage records seeded for the user. */
  readonly usageCount: number
}

/** The demo users; counts are chosen so per-tenant chart shapes differ. */
export const DEMO_USERS: readonly SeedUser[] = [
  { name: 'ada', tenantId: 'acme', usageCount: 28 },
  { name: 'grace', tenantId: 'acme', usageCount: 22 },
  { name: 'linus', tenantId: 'globex', usageCount: 22 },
]

/** Monthly credit granted to every demo user, in nano-USD (50 USD). */
export const MONTHLY_ALLOCATION_NANO_USD = 50_000_000_000n

/** Extra trial credit granted to ada only, in nano-USD (10 USD). */
export const TRIAL_ALLOCATION_NANO_USD = 10_000_000_000n

/** How long ada's trial grant stays redeemable after the epoch, in days. */
const TRIAL_GRANT_DAYS = 30

// Flat demo rates in nano-USD per million tokens (0.60 / 2.40 / 0.10 USD).
const CHAT_INPUT_RATE = 600_000_000n
const CHAT_OUTPUT_RATE = 2_400_000_000n
const EMBED_INPUT_RATE = 100_000_000n

// Demo margin applied to user traffic: billed = raw * 1.25.
const USER_MARKUP_NUMERATOR = 125n
const USER_MARKUP_DENOMINATOR = 100n
const USER_MARKUP_DECIMAL = '1.25'

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

// Shape of the seeded history: how far back it reaches, the chat/embeddings
// traffic mix, and the token ranges each operation draws from.
const HISTORY_DAYS = 90
const CHAT_TRAFFIC_SHARE = 0.7
const CHAT_INPUT_TOKEN_RANGE = [200, 4_000] as const
const CHAT_OUTPUT_TOKEN_RANGE = [100, 2_000] as const
const EMBED_INPUT_TOKEN_RANGE = [500, 8_000] as const

// Internal maintenance rows: one nightly reindex snapshot per offset, per tenant.
const SYSTEM_REINDEX_TOKENS = 250_000
const SYSTEM_REINDEX_DAY_OFFSETS = [10, 40] as const

/** Everything the seed writes, in insertion order. */
export interface SeedPlan {
  readonly tenantIds: readonly string[]
  readonly walletIds: readonly string[]
  readonly wallets: readonly Prisma.AiWalletCreateManyInput[]
  readonly walletEntries: readonly Prisma.AiWalletEntryCreateManyInput[]
  readonly usageRecords: readonly Prisma.AiUsageRecordCreateManyInput[]
}

/**
 * Returns a mulberry32 pseudo-random generator for the given seed.
 *
 * A tiny, well-known 32-bit PRNG: identical seeds yield identical sequences on
 * every platform, which is exactly the determinism the seed needs.
 *
 * @param seed - 32-bit integer seed.
 * @returns Function yielding floats in [0, 1).
 */
function createRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * Computes a stable content hash for a seeded usage record.
 *
 * @param parts - Identifying fields of the row.
 * @returns Hex SHA-256 over the joined parts.
 */
function payloadHash(parts: readonly (string | number)[]): string {
  return createHash('sha256').update(parts.join(':')).digest('hex')
}

/** Draws an integer in [min, max) from the generator. */
function drawInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min))
}

/** Returns the stable wallet id for a demo user. */
function walletIdFor(user: SeedUser): string {
  return `seed-wallet-${user.name}`
}

/** Builds the wallet row for one demo user (balance = sum of its grants). */
function buildWallet(user: SeedUser, balanceNanoUsd: bigint): Prisma.AiWalletCreateManyInput {
  return {
    id: walletIdFor(user),
    tenantId: user.tenantId,
    ownerType: 'user',
    ownerId: user.name,
    balanceNanoUsd,
  }
}

/** Builds one credit grant entry for a demo user's wallet. */
function buildGrant(
  user: SeedUser,
  reason: string,
  amountNanoUsd: bigint,
  expiresAt?: Date,
): Prisma.AiWalletEntryCreateManyInput {
  return {
    id: `seed-grant-${user.name}-${reason}`,
    walletId: walletIdFor(user),
    type: 'grant',
    amountNanoUsd,
    effectiveAt: SEED_EPOCH,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    idempotencyKey: `seed-grant-${user.name}-${reason}`,
    reason,
  }
}

/** Draws the token counts and rates for one usage record. */
function drawUsage(random: () => number): {
  operation: 'chat' | 'embeddings'
  model: string
  feature: string
  inputTokens: number
  outputTokens: number
  rawCostNanoUsd: bigint
} {
  const isChat = random() < CHAT_TRAFFIC_SHARE
  if (isChat) {
    const inputTokens = drawInt(random, ...CHAT_INPUT_TOKEN_RANGE)
    const outputTokens = drawInt(random, ...CHAT_OUTPUT_TOKEN_RANGE)
    const rawCostNanoUsd =
      (BigInt(inputTokens) * CHAT_INPUT_RATE + BigInt(outputTokens) * CHAT_OUTPUT_RATE) / 1_000_000n
    return {
      operation: 'chat',
      model: 'mock-gpt-mini',
      feature: 'demo.chat',
      inputTokens,
      outputTokens,
      rawCostNanoUsd,
    }
  }
  const inputTokens = drawInt(random, ...EMBED_INPUT_TOKEN_RANGE)
  const rawCostNanoUsd = (BigInt(inputTokens) * EMBED_INPUT_RATE) / 1_000_000n
  return {
    operation: 'embeddings',
    model: 'mock-embed',
    feature: 'demo.embeddings',
    inputTokens,
    outputTokens: 0,
    rawCostNanoUsd,
  }
}

/** Builds one historical usage record for a demo user. */
function buildUsageRecord(
  user: SeedUser,
  sequence: number,
  random: () => number,
): Prisma.AiUsageRecordCreateManyInput {
  const usage = drawUsage(random)
  const occurredAt = new Date(
    SEED_EPOCH.getTime() -
      drawInt(random, 0, HISTORY_DAYS) * MS_PER_DAY -
      drawInt(random, 0, 24) * MS_PER_HOUR -
      drawInt(random, 0, 60) * MS_PER_MINUTE,
  )
  const id = `seed-usage-${String(sequence).padStart(4, '0')}`
  return {
    id,
    tenantId: user.tenantId,
    scopeType: 'user',
    scopeId: user.name,
    requestedBy: user.name,
    provider: 'mock',
    model: usage.model,
    operation: usage.operation,
    feature: usage.feature,
    tags: ['seed'],
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    rawCostNanoUsd: usage.rawCostNanoUsd,
    billedCostNanoUsd: (usage.rawCostNanoUsd * USER_MARKUP_NUMERATOR) / USER_MARKUP_DENOMINATOR,
    markupMultiplier: USER_MARKUP_DECIMAL,
    status: 'posted',
    idempotencyKey: id,
    payloadHash: payloadHash([user.tenantId, id, usage.inputTokens, occurredAt.toISOString()]),
    correlationId: `doc-${sequence}`,
    occurredAt,
  }
}

/** Builds one internal system-cost record (a nightly reindex) for a tenant. */
function buildSystemRecord(
  tenantId: string,
  sequence: number,
  daysBeforeEpoch: number,
): Prisma.AiUsageRecordCreateManyInput {
  const inputTokens = SYSTEM_REINDEX_TOKENS
  const rawCostNanoUsd = (BigInt(inputTokens) * EMBED_INPUT_RATE) / 1_000_000n
  const occurredAt = new Date(SEED_EPOCH.getTime() - daysBeforeEpoch * MS_PER_DAY)
  const id = `seed-usage-${String(sequence).padStart(4, '0')}`
  return {
    id,
    tenantId,
    scopeType: 'tenant',
    scopeId: tenantId,
    requestedBy: 'root',
    provider: 'mock',
    model: 'mock-embed',
    operation: 'embeddings',
    feature: 'system.reindex',
    tags: ['seed'],
    inputTokens,
    outputTokens: 0,
    totalTokens: inputTokens,
    rawCostNanoUsd,
    billedCostNanoUsd: rawCostNanoUsd,
    markupMultiplier: '1',
    status: 'posted',
    isSystemCost: true,
    systemCostCategory: 'reindex',
    idempotencyKey: id,
    payloadHash: payloadHash([tenantId, id, inputTokens, occurredAt.toISOString()]),
    occurredAt,
  }
}

/**
 * Builds the complete, deterministic seed plan.
 *
 * Calling this any number of times, on any machine, at any time yields the
 * exact same rows: ids are stable strings, dates derive from
 * {@link SEED_EPOCH}, and the value spread comes from a fixed-seed PRNG.
 *
 * @returns Every row the seed writes, in insertion order.
 */
export function buildSeedPlan(): SeedPlan {
  const random = createRandom(0x5eed)
  const wallets: Prisma.AiWalletCreateManyInput[] = []
  const walletEntries: Prisma.AiWalletEntryCreateManyInput[] = []
  const usageRecords: Prisma.AiUsageRecordCreateManyInput[] = []
  const trialExpiry = new Date(SEED_EPOCH.getTime() + TRIAL_GRANT_DAYS * MS_PER_DAY)

  for (const user of DEMO_USERS) {
    const grantAmounts: [string, bigint, Date?][] = [
      ['monthly_allocation', MONTHLY_ALLOCATION_NANO_USD],
    ]
    if (user.name === 'ada') {
      grantAmounts.push(['trial_allocation', TRIAL_ALLOCATION_NANO_USD, trialExpiry])
    }
    let balance = 0n
    for (const [reason, amount, expiresAt] of grantAmounts) {
      walletEntries.push(buildGrant(user, reason, amount, expiresAt))
      balance += amount
    }
    wallets.push(buildWallet(user, balance))
    for (let i = 0; i < user.usageCount; i += 1) {
      usageRecords.push(buildUsageRecord(user, usageRecords.length + 1, random))
    }
  }
  for (const tenantId of DEMO_TENANTS) {
    for (const dayOffset of SYSTEM_REINDEX_DAY_OFFSETS) {
      usageRecords.push(buildSystemRecord(tenantId, usageRecords.length + 1, dayOffset))
    }
  }

  return {
    tenantIds: [...DEMO_TENANTS],
    walletIds: DEMO_USERS.map((user) => walletIdFor(user)),
    wallets,
    walletEntries,
    usageRecords,
  }
}
