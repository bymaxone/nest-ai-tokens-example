/**
 * @fileoverview Zod body DTO for `PUT /pricing/:model`. The shipped library
 * validates `upsertPrice` input structurally through its `NewPriceVersion`
 * type but ships no class-validator DTO, so this schema is the HTTP-side
 * mirror of `NewPriceVersion`: same fields, with money accepted ONLY as
 * digit strings (JSON numbers are floats and could silently lose nano-USD
 * precision) and the server owning `model` (path), `effectiveFrom` (the
 * update instant), and `source` (`'manual'` provenance).
 *
 * @layer pricing
 */
import { AI_OPERATIONS, SERVICE_TIERS } from '@bymax-one/nest-ai-tokens'
import { z } from 'zod'

import { zodDto } from '../../common/zod-dto.js'

/**
 * Integer nano-USD per 1,000,000 tokens as a digit string. Strings keep the
 * full bigint range exact end to end; a JSON number would round above
 * 2^53.
 */
const nanoUsdPerMillion = z
  .string()
  .regex(/^\d{1,30}$/, 'expected a non-negative integer nano-USD amount as a digit string')
  .transform(BigInt)

/** The rate fields an update may set (absent fields default to 0n downstream). */
const rateFields = {
  inputNanoUsdPerMillion: nanoUsdPerMillion.optional(),
  outputNanoUsdPerMillion: nanoUsdPerMillion.optional(),
  cacheReadNanoUsdPerMillion: nanoUsdPerMillion.optional(),
  cacheWrite5mNanoUsdPerMillion: nanoUsdPerMillion.optional(),
  cacheWrite1hNanoUsdPerMillion: nanoUsdPerMillion.optional(),
  reasoningNanoUsdPerMillion: nanoUsdPerMillion.optional(),
  audioInNanoUsdPerMillion: nanoUsdPerMillion.optional(),
  audioOutNanoUsdPerMillion: nanoUsdPerMillion.optional(),
  imageInNanoUsdPerMillion: nanoUsdPerMillion.optional(),
  imageOutNanoUsdPerMillion: nanoUsdPerMillion.optional(),
  tierInputNanoUsdPerMillion: nanoUsdPerMillion.optional(),
  tierOutputNanoUsdPerMillion: nanoUsdPerMillion.optional(),
}

/** The field names counted by the at-least-one-rate refinement. */
const RATE_FIELD_NAMES = Object.keys(rateFields)

/**
 * Body schema for a price update. Requires at least one rate field: the
 * store defaults absent rates to zero, so an empty body would silently
 * replace a model's pricing with an all-zero window.
 */
export const updatePriceBodySchema = z
  .object({
    /** Provider half of the price-resolution key. */
    provider: z.string().min(1),
    /** Operation half of the price-resolution key. */
    operation: z.enum(AI_OPERATIONS),
    /** Service tier; the store defaults it to `'standard'`. */
    serviceTier: z.enum(SERVICE_TIERS).optional(),
    /** Long-context tier threshold in tokens. */
    tierThresholdTokens: z.number().int().positive().optional(),
    /** Non-token line-item rates, nano-USD per unit as digit strings. */
    unitRates: z.record(z.string().min(1), nanoUsdPerMillion).optional(),
    ...rateFields,
  })
  .refine(
    (body) => RATE_FIELD_NAMES.some((field) => body[field as keyof typeof body] !== undefined),
    {
      message: 'at least one rate field is required',
    },
  )

/** The parsed update body. */
export type UpdatePriceBody = z.infer<typeof updatePriceBodySchema>

/** Opts the update body into the global `ZodValidationPipe`. */
export class UpdatePriceBodyDto extends zodDto(updatePriceBodySchema) {}
