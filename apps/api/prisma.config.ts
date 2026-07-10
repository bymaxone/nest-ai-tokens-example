/**
 * @fileoverview Prisma CLI configuration for `apps/api`.
 *
 * Provides the datasource URL, the multi-file schema folder, and the
 * migrations settings for all Prisma CLI commands (`migrate dev`, `db seed`,
 * `generate`, ...). The runtime `PrismaClient` connects through the
 * `@prisma/adapter-pg` driver adapter instead of reading a schema URL.
 *
 * @layer config
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

const here = path.dirname(fileURLToPath(import.meta.url))

// The Prisma CLI does not auto-load .env files when prisma.config.ts exists.
// Read the app-local override first, then the repo-root registry; dotenv never
// overwrites variables that are already set, so the shell environment wins.
loadEnv({ path: [path.join(here, '.env'), path.join(here, '../../.env')], quiet: true })

interface EnvVars {
  DATABASE_URL: string
}

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env<EnvVars>('DATABASE_URL'),
  },
})
