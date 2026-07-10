/**
 * @fileoverview Zod body DTO for `POST /workspace/custom`, the escape
 * hatch: caller-controlled system/user prompts and response format.
 * `temperature` and `maxTokens` are accepted for API fidelity with real
 * SDK calls but are IGNORED by the deterministic mock (a temperature would
 * be the opposite of deterministic); their JSDoc says so honestly.
 *
 * @layer workspace
 */
import { z } from 'zod'

import { chatModelField, resourceIdField, textField } from './command-fields.js'
import { zodDto } from '../../common/zod-dto.js'

/** Highest temperature the schema admits (OpenAI-compatible range). */
const MAX_TEMPERATURE = 2

/** Largest completion budget the schema admits. */
const MAX_MAX_TOKENS = 4096

/** Body schema for the custom command. */
export const customBodySchema = z.object({
  /** Optional system prompt (travels as the system message). */
  systemPrompt: textField.optional(),
  /** The user prompt (the mock's echo transform answers it). */
  userPrompt: textField,
  /** Requested output format; `json_object` responses must parse. */
  responseFormat: z.enum(['text', 'json_object']).default('text'),
  /** Accepted for SDK fidelity; ignored by the deterministic mock. */
  temperature: z.number().min(0).max(MAX_TEMPERATURE).optional(),
  /** Accepted for SDK fidelity; ignored by the deterministic mock. */
  maxTokens: z.number().int().min(1).max(MAX_MAX_TOKENS).optional(),
  /** Per-call model override; defaults to the flagship chat model. */
  model: chatModelField.optional(),
  /** Document reference correlated into the ledger row's tags. */
  resourceId: resourceIdField,
})

/** The parsed custom body. */
export type CustomBody = z.infer<typeof customBodySchema>

/** Opts the custom body into the global `ZodValidationPipe`. */
export class CustomBodyDto extends zodDto(customBodySchema) {}
