/**
 * @fileoverview Typed environment configuration for the API: the Zod schema,
 * the single read point for `process.env`, and the DI token the rest of the
 * app injects. Nothing outside this file (and the module options factory that
 * consumes its output) may touch `process.env`.
 *
 * Validation failures raise {@link EnvValidationError} carrying a value-free
 * report: variable names and issue descriptions only, never the received
 * values, so a misconfigured secret can never leak into logs.
 *
 * @layer config
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

/** DI token under which the parsed, immutable {@link EnvConfig} is provided. */
export const ENV_CONFIG = Symbol('ENV_CONFIG')

/**
 * Schema for every environment variable the API reads. Defaults mirror the
 * registry in `.env.example`; only `DATABASE_URL` is mandatory.
 */
export const envSchema = z.object({
  /** Prisma connection string for the Postgres datasource. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** TCP port the HTTP server listens on (0 lets the OS pick a free port). */
  PORT: z.coerce.number().int().min(0).max(65_535).default(3001),
  /**
   * Which AI provider layer the workspace endpoints use: the deterministic
   * mock (default, the only mode CI ever runs) or a local-only OpenAI opt-in.
   */
  AI_PROVIDER_MODE: z.enum(['mock', 'openai-optin']).default('mock'),
  /**
   * Enables the library's enforcement surface (the `wallets` and `budgets`
   * feature blocks: `WalletService`, `BudgetService`, `BudgetGuard`).
   */
  QUOTA_ENABLED: z.stringbool().default(true),
  /**
   * App-side estimation multiplier applied when this API sizes spend holds
   * from its own token estimates (headroom over the raw estimate). The
   * library itself has no tolerance option; this knob belongs to the host.
   */
  QUOTA_TOLERANCE: z.coerce.number().positive().default(1.2),
  /**
   * Lowest wallet balance a debit may leave, in USD. Zero or positive means
   * no overdraft; a negative floor maps to the library's
   * `wallets.overdraftNanoUsd` allowance (a floor of -5 equals a 5 USD
   * overdraft).
   */
  QUOTA_MINIMUM_BALANCE: z.coerce.number().default(0),
  /**
   * When true, the demo scope resolver rejects requests whose identity
   * carries no tenant instead of falling back to the global tenant.
   */
  TENANT_REQUIRED: z.stringbool().default(false),
  /** In-memory price-rate cache TTL handed to `pricing.cacheTtlMs`. */
  PRICING_CACHE_TTL_MS: z.coerce.number().int().positive().default(300_000),
})

/** The parsed, typed environment configuration. */
export type EnvConfig = z.infer<typeof envSchema>

/**
 * Raised when the environment fails validation. The `report` lists variable
 * names and issue descriptions only; received values are never included.
 */
export class EnvValidationError extends Error {
  /** One value-free line per offending variable: `NAME: issue`. */
  readonly report: readonly string[]

  /**
   * @param report Value-free issue lines, one per offending variable.
   */
  constructor(report: readonly string[]) {
    super(`Invalid environment configuration: ${report.join('; ')}`)
    this.name = 'EnvValidationError'
    this.report = report
  }
}

/** The subset of a Zod issue the report renderer consumes. */
interface ReportableIssue {
  readonly path: readonly PropertyKey[]
  readonly message: string
}

/**
 * Render Zod issues as value-free report lines (`NAME: issue`). Top-level
 * issues (empty path) are labeled `(root)`.
 *
 * @param issues The Zod issues from a failed parse.
 * @returns One line per issue, naming the variable but never its value.
 */
export function formatEnvIssues(issues: readonly ReportableIssue[]): string[] {
  return issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
}

/**
 * Parse and validate an environment source against {@link envSchema}.
 *
 * @param source The raw environment map (normally `process.env`).
 * @returns The typed configuration with defaults applied.
 * @throws {EnvValidationError} when any variable is missing or malformed.
 */
export function parseEnv(source: Record<string, string | undefined>): EnvConfig {
  const result = envSchema.safeParse(source)
  if (!result.success) throw new EnvValidationError(formatEnvIssues(result.error.issues))
  return result.data
}

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Read `.env` files (app-local first, then the repo-root registry) and parse
 * `process.env`. dotenv never overwrites variables that are already set, so
 * the shell environment always wins. This is the app's single read point for
 * `process.env`.
 *
 * @returns The typed configuration.
 * @throws {EnvValidationError} when the environment is invalid.
 */
export function loadEnvFromProcess(): EnvConfig {
  loadDotenv({
    path: [path.join(here, '../../.env'), path.join(here, '../../../../.env')],
    quiet: true,
  })
  return parseEnv(process.env)
}
