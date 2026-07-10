/**
 * @fileoverview Zod query DTO for `GET /pricing/:model/history`. The
 * library's `getPriceHistory` keys on (provider, model, operation) with an
 * optional tier filter; the model rides the path, the rest rides the query.
 *
 * @layer pricing
 */
import { AI_OPERATIONS, SERVICE_TIERS } from '@bymax-one/nest-ai-tokens'
import { z } from 'zod'

import { zodDto } from '../../common/zod-dto.js'

/** Query schema for the per-model pricing history. */
export const priceHistoryQuerySchema = z.object({
  /** Provider half of the tuple (e.g. `mock`, `openai`). */
  provider: z.string().min(1),
  /** Operation half of the tuple; chat is the dashboard default. */
  operation: z.enum(AI_OPERATIONS).default('chat'),
  /** Optional tier filter; omitted = all tiers, newest first. */
  serviceTier: z.enum(SERVICE_TIERS).optional(),
})

/** The parsed history query. */
export type PriceHistoryQuery = z.infer<typeof priceHistoryQuerySchema>

/** Opts the history query into the global `ZodValidationPipe`. */
export class PriceHistoryQueryDto extends zodDto(priceHistoryQuerySchema) {}
