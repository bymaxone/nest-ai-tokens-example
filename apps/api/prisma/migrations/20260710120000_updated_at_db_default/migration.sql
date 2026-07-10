-- Align the updatedAt columns with the library's shipped canonical migration
-- (dist/prisma/migrations/0001_init.sql): the official PrismaAiTokensStore
-- writes through parameterized raw SQL and omits updatedAt on INSERT, relying
-- on a database-side DEFAULT. Prisma's @updatedAt alone is client-side only
-- and generated these columns without a default, so raw inserts violated the
-- NOT NULL constraint. The schema now declares @default(now()) @updatedAt.
ALTER TABLE "ai_usage_records" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ai_wallets" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ai_budgets" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ai_budget_windows" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
