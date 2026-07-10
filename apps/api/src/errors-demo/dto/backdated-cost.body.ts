/**
 * @fileoverview Body schema for the backdated-cost helper: a hypothetical
 * call (model + token counts) priced AT a supplied historical date, so the
 * effective-dated pricing story (spec §13 scenario 4) is demonstrable
 * without writing anything.
 *
 * @layer errors-demo
 */
import { z } from 'zod'

import { zodDto } from '../../common/zod-dto.js'

/** Upper bound keeping the hypothetical call plausible and overflow-free. */
const MAX_TOKENS = 10_000_000

/** Body schema for `POST /errors-demo/helpers/backdated-cost`. */
export const backdatedCostBodySchema = z.object({
  /** Provider the model is priced under; the demo models live under `mock`. */
  provider: z.string().min(1).max(64).default('mock'),
  /** The priced model id (unknown models raise `AI_TOKENS_PRICE_NOT_FOUND`). */
  model: z.string().min(1).max(128),
  /** Hypothetical input tokens. */
  promptTokens: z.number().int().min(0).max(MAX_TOKENS),
  /** Hypothetical output tokens. */
  completionTokens: z.number().int().min(0).max(MAX_TOKENS),
  /** The historical instant the rate must be resolved at. */
  date: z.coerce.date(),
})

/** The parsed backdated-cost body. */
export type BackdatedCostBody = z.infer<typeof backdatedCostBodySchema>

/** Opts the body into the global `ZodValidationPipe`. */
export class BackdatedCostBodyDto extends zodDto(backdatedCostBodySchema) {}
