/**
 * @fileoverview Zod body DTO for the budget admin upsert. Money limits are
 * BigInt nano-USD carried as digit-only decimal strings (never through
 * `Number`, so precision cannot be lost) with strict bounds: no sign (a
 * negative limit is invalid per the library's normative rules), no zero-fill
 * tricks, and a sane maximum. A present limit of `0` is a deliberate hard
 * block (the library's documented "0 = block all" semantics); absence means
 * the dimension is unlimited, and at least one dimension must be present.
 *
 * @layer quota
 */
import { z } from 'zod'

import { zodDto } from '../../common/zod-dto.js'

/** Upper bound for a nano-USD limit: 15 digits keeps it under 1M USD. */
const NANO_USD_LIMIT_PATTERN = /^[0-9]{1,15}$/

/** Largest token cap a budget may carry (one trillion tokens). */
export const MAX_LIMIT_TOKENS = 1_000_000_000_000

/** Largest operation-count cap a budget may carry (one billion calls). */
export const MAX_LIMIT_COUNT = 1_000_000_000

/** A non-negative integer nano-USD amount as a decimal string -> bigint. */
const nanoUsdLimitSchema = z
  .string()
  .regex(NANO_USD_LIMIT_PATTERN, 'must be a non-negative integer nano-USD string (max 15 digits)')
  .transform(BigInt)

/**
 * Body schema for `POST /quota/budgets`. Scope is restricted to the demo's
 * subject kinds (a user within the admin's target tenant, or the tenant
 * itself); windows follow the library's calendar kinds.
 */
export const upsertBudgetBodySchema = z
  .object({
    /** The budgeted subject kind. */
    scopeType: z.enum(['user', 'tenant']),
    /** The budgeted subject id (a demo user id or the tenant id). */
    scopeId: z.string().min(1).max(64),
    /** Billed-spend cap in nano-USD (string; `0` = hard block). */
    limitNanoUsd: nanoUsdLimitSchema.optional(),
    /** Total-token cap (`0` = hard block). */
    limitTokens: z.number().int().min(0).max(MAX_LIMIT_TOKENS).optional(),
    /** Operation-count cap (`0` = hard block). */
    limitCount: z.number().int().min(0).max(MAX_LIMIT_COUNT).optional(),
    /** How the budget window repeats. */
    window: z.enum(['day', 'week', 'month', 'total']).default('month'),
    /** Enforcement policy; omitted -> the module default (`block`). */
    policy: z.enum(['block', 'throttle', 'allow']).optional(),
    /** Restrict which features count; omitted -> all features. */
    features: z.array(z.string().min(1).max(100)).min(1).max(20).optional(),
  })
  .refine(
    (body) =>
      body.limitNanoUsd !== undefined ||
      body.limitTokens !== undefined ||
      body.limitCount !== undefined,
    {
      message: 'at least one limit dimension (limitNanoUsd, limitTokens, limitCount) is required',
      path: ['limitNanoUsd'],
    },
  )

/** The parsed budget upsert body. */
export type UpsertBudgetBody = z.infer<typeof upsertBudgetBodySchema>

/** Opts the budget upsert body into the global `ZodValidationPipe`. */
export class UpsertBudgetBodyDto extends zodDto(upsertBudgetBodySchema) {}
