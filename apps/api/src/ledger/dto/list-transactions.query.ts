/**
 * @fileoverview Zod query DTO for `GET /ledger/transactions`. This project
 * uses Zod DTOs + JSDoc instead of class-validator/Swagger: the class opts
 * into the global `ZodValidationPipe` via its static `schema`, and the
 * merged interface gives handlers the parsed shape. Fields mirror the
 * library's `LedgerFilter` (the shipped filter has no signed-amount or
 * ordering options; costs are unsigned and the store orders `createdAt`
 * ascending).
 *
 * @layer ledger
 */
import { AI_OPERATIONS, SERVICE_TIERS } from '@bymax-one/nest-ai-tokens'
import type { UsageStatus } from '@bymax-one/nest-ai-tokens'
import { z } from 'zod'

import { zodDto } from '../../common/zod-dto.js'

/** Every lifecycle status a ledger row can carry (mirrors `UsageStatus`). */
const USAGE_STATUS_VALUES = [
  'pending',
  'posted',
  'reversed',
  'released',
] as const satisfies readonly UsageStatus[]

/** Largest page a single list call may request. */
export const MAX_PAGE_SIZE = 100

/** Page size applied when the client sends no `limit`. */
export const DEFAULT_PAGE_SIZE = 20

/**
 * Split a comma-separated list parameter (e.g. `status=posted,reversed`),
 * trimming entries and dropping empties before per-item validation.
 *
 * @param value The raw query-string value.
 * @returns The non-empty entries.
 */
function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

/** Comma-separated list of non-empty labels (used by `features`). */
const labelListSchema = z
  .string()
  .transform(splitCsv)
  .pipe(z.array(z.string().min(1)).min(1))

/** Comma-separated list of lifecycle statuses. */
const statusListSchema = z
  .string()
  .transform(splitCsv)
  .pipe(z.array(z.enum(USAGE_STATUS_VALUES)).min(1))

/**
 * Query schema for the ledger list endpoint. Pagination is bounded (no
 * unbounded listing); date bounds are inclusive and must form a valid
 * window when both are present.
 */
export const listTransactionsQuerySchema = z
  .object({
    /** Exact feature label match. */
    feature: z.string().min(1).optional(),
    /** Any-of feature labels, comma separated. */
    features: labelListSchema.optional(),
    /** Provider id (known ids plus custom registrations). */
    provider: z.string().min(1).optional(),
    /** Exact model match (the model the response reported). */
    model: z.string().min(1).optional(),
    /** Operation kind. */
    operation: z.enum(AI_OPERATIONS).optional(),
    /** Response service tier. */
    serviceTier: z.enum(SERVICE_TIERS).optional(),
    /** Lifecycle statuses, comma separated; omitted = posted + reversed. */
    status: statusListSchema.optional(),
    /** Restrict to platform-absorbed rows (true) or user traffic (false). */
    isSystemCost: z.stringbool().optional(),
    /** Exact system-cost category match. */
    systemCostCategory: z.string().min(1).optional(),
    /** Inclusive lower bound on `occurredAt` (ISO 8601). */
    from: z.coerce.date().optional(),
    /** Inclusive upper bound on `occurredAt` (ISO 8601). */
    to: z.coerce.date().optional(),
    /** Page size, bounded to keep list responses finite. */
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    /** Rows to skip before the page starts. */
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    message: 'from must not be later than to',
    path: ['from'],
  })

/** The parsed list query. */
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>

/** Opts the list query into the global `ZodValidationPipe`. */
export class ListTransactionsQueryDto extends zodDto(listTransactionsQuerySchema) {}
