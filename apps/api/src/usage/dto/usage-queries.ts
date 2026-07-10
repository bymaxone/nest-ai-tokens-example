/**
 * @fileoverview Zod query DTOs for the `/usage` analytics endpoints. All
 * aggregation windows are bounded (a report filter always carries `from`
 * and `to`; the service applies the documented default window when the
 * client sends none) and every dimension value is whitelisted, so the
 * aggregator can never be driven with unbounded ranges or unknown
 * granularities.
 *
 * @layer usage
 */
import { z } from 'zod'

import { zodDto } from '../../common/zod-dto.js'

/** The widest window one aggregation call may request, in days. */
export const MAX_WINDOW_DAYS = 400

/** The window applied when the client sends no bounds, in days. */
export const DEFAULT_WINDOW_DAYS = 90

/** Milliseconds per day (window math). */
export const MS_PER_DAY = 86_400_000

/** The report granularities the by-period endpoint accepts. */
export const GRANULARITIES = ['day', 'week', 'month'] as const

/** One report granularity. */
export type Granularity = (typeof GRANULARITIES)[number]

/** Most consumers one top-consumers call may return. */
export const MAX_TOP_N = 50

/** Consumers returned when the client sends no `topN`. */
export const DEFAULT_TOP_N = 10

/** The shared window fields plus the caller/tenant scope switch. */
const windowShape = {
  /** Inclusive lower bound on `occurredAt` (ISO 8601). */
  from: z.coerce.date().optional(),
  /** Inclusive upper bound on `occurredAt` (ISO 8601). */
  to: z.coerce.date().optional(),
  /** Report for the caller only (default) or the whole tenant. */
  scope: z.enum(['me', 'tenant']).default('me'),
}

/** Reject inverted windows and windows wider than the documented cap. */
function boundedWindow(query: { from?: Date | undefined; to?: Date | undefined }): boolean {
  if (query.from === undefined || query.to === undefined) return true
  if (query.from > query.to) return false
  return query.to.getTime() - query.from.getTime() <= MAX_WINDOW_DAYS * MS_PER_DAY
}

/** The refinement message for an invalid window. */
const WINDOW_MESSAGE = `from must not be later than to and the window must not exceed ${MAX_WINDOW_DAYS} days`

/** Query schema for `/usage/by-type` and `/usage/by-model`. */
export const usageWindowQuerySchema = z
  .object(windowShape)
  .refine(boundedWindow, { message: WINDOW_MESSAGE, path: ['from'] })

/** The parsed window query. */
export type UsageWindowQuery = z.infer<typeof usageWindowQuerySchema>

/** Opts the window query into the global `ZodValidationPipe`. */
export class UsageWindowQueryDto extends zodDto(usageWindowQuerySchema) {}

/** Query schema for `/usage/by-period`: the window plus the granularity. */
export const byPeriodQuerySchema = z
  .object({ ...windowShape, granularity: z.enum(GRANULARITIES).default('day') })
  .refine(boundedWindow, { message: WINDOW_MESSAGE, path: ['from'] })

/** The parsed by-period query. */
export type ByPeriodQuery = z.infer<typeof byPeriodQuerySchema>

/** Opts the by-period query into the global `ZodValidationPipe`. */
export class ByPeriodQueryDto extends zodDto(byPeriodQuerySchema) {}

/** Query schema for `/usage/top-consumers` (tenant-scoped by nature). */
export const topConsumersQuerySchema = z
  .object({
    from: windowShape.from,
    to: windowShape.to,
    /** How many consumers to return, ordered by billed spend. */
    topN: z.coerce.number().int().min(1).max(MAX_TOP_N).default(DEFAULT_TOP_N),
  })
  .refine(boundedWindow, { message: WINDOW_MESSAGE, path: ['from'] })

/** The parsed top-consumers query. */
export type TopConsumersQuery = z.infer<typeof topConsumersQuerySchema>

/** Opts the top-consumers query into the global `ZodValidationPipe`. */
export class TopConsumersQueryDto extends zodDto(topConsumersQuerySchema) {}

/** Query schema for `/usage/system-costs` (tenant-scoped by nature). */
export const systemCostsQuerySchema = z
  .object({
    from: windowShape.from,
    to: windowShape.to,
    /** Exact system-cost category filter, e.g. `reindex`. */
    category: z.string().min(1).max(100).optional(),
  })
  .refine(boundedWindow, { message: WINDOW_MESSAGE, path: ['from'] })

/** The parsed system-costs query. */
export type SystemCostsQuery = z.infer<typeof systemCostsQuerySchema>

/** Opts the system-costs query into the global `ZodValidationPipe`. */
export class SystemCostsQueryDto extends zodDto(systemCostsQuerySchema) {}

/**
 * Resolve the effective report window: explicit bounds pass through, a
 * missing `to` defaults to `now`, and a missing `from` defaults to the
 * documented window before `to`.
 *
 * @param query The parsed window bounds.
 * @param now The clock (injected for determinism in tests).
 * @returns The inclusive report window.
 */
export function resolveWindow(
  query: { from?: Date | undefined; to?: Date | undefined },
  now: () => Date = () => new Date(),
): { from: Date; to: Date } {
  const to = query.to ?? now()
  const from = query.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * MS_PER_DAY)
  return { from, to }
}
