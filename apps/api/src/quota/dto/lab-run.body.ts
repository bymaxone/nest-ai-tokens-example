/**
 * @fileoverview Zod body DTO for the quota-lab run endpoints. The lab
 * demonstrates estimator VARIANTS, so the body is deliberately tiny: an
 * optional model pick (drives the model-based estimator branch) and an
 * optional prompt (the deterministic mock echoes it back).
 *
 * @layer quota
 */
import { z } from 'zod'

import { MOCK_CHAT_LITE, MOCK_CHAT_MODELS } from '../../ai/mock-models.js'
import { zodDto } from '../../common/zod-dto.js'

/** Longest prompt the lab accepts (a demo probe, not a document pipe). */
export const MAX_LAB_PROMPT_LENGTH = 2_000

/** The prompt used when the caller sends none. */
export const DEFAULT_LAB_PROMPT = 'quota lab probe'

/**
 * Body schema for the lab run endpoints. The model defaults to the cheap
 * variant so the constant/model-based contrast is visible by default.
 */
export const labRunBodySchema = z.object({
  /** The chat model to run (drives the model-based estimator branch). */
  model: z.enum(MOCK_CHAT_MODELS).default(MOCK_CHAT_LITE),
  /** The probe prompt the mock echoes back. */
  prompt: z.string().min(1).max(MAX_LAB_PROMPT_LENGTH).default(DEFAULT_LAB_PROMPT),
})

/** The parsed lab run body. */
export type LabRunBody = z.infer<typeof labRunBodySchema>

/** Opts the lab run body into the global `ZodValidationPipe`. */
export class LabRunBodyDto extends zodDto(labRunBodySchema) {}
