/**
 * @fileoverview Entry point for `prisma db seed`.
 *
 * Bootstrap only: connects a `PrismaClient` through the pg driver adapter,
 * delegates to the tested `runSeed` writer, prints the row counts, and
 * disconnects. Run it via `pnpm --filter api run prisma:seed` (the compose
 * Postgres must be up and migrated).
 *
 * @layer bootstrap
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

import { runSeed } from './seed-runner.js'

const connectionString = process.env.DATABASE_URL
if (connectionString === undefined || connectionString === '') {
  throw new Error('DATABASE_URL is not set; copy .env.example to .env at the repo root')
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

try {
  const summary = await runSeed(prisma)
  console.log(
    `Seeded ${summary.wallets} wallets, ${summary.walletEntries} wallet entries, ` +
      `${summary.usageRecords} usage records`,
  )
} finally {
  await prisma.$disconnect()
}
