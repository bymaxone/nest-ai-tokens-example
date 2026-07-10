/**
 * @fileoverview Entry point for `prisma db seed`.
 *
 * Bootstrap only: connects a `PrismaClient` through the pg driver adapter,
 * delegates to the tested `runSeed` writer, prints the row counts, and
 * disconnects. Run it via `pnpm --filter api run prisma:seed` (the compose
 * Postgres must be up and migrated). The connection URL comes from the typed
 * env accessor, the app's single read point for the environment (it loads
 * `.env` files and fails fast with a value-free report when invalid).
 *
 * @layer bootstrap
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

import { loadEnvFromProcess } from '../src/config/env.js'
import { runSeed } from './seed-runner.js'

const { DATABASE_URL } = loadEnvFromProcess()

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) })

try {
  const summary = await runSeed(prisma)
  console.log(
    `Seeded ${summary.wallets} wallets, ${summary.walletEntries} wallet entries, ` +
      `${summary.usageRecords} usage records`,
  )
} finally {
  await prisma.$disconnect()
}
