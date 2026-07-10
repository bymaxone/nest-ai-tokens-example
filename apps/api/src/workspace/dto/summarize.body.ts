/**
 * @fileoverview Zod body DTO for `POST /workspace/summarize`: bounded text,
 * the canned style picker, an optional word budget, and the shared model
 * override and resource correlation fields.
 *
 * @layer workspace
 */
import { z } from 'zod'

import { chatModelField, resourceIdField, textField } from './command-fields.js'
import { SUMMARY_STYLES } from '../../ai/mock-content.js'
import { zodDto } from '../../common/zod-dto.js'

/** Largest word budget a summary may request. */
export const MAX_SUMMARY_WORDS = 200

/** Body schema for the summarize command. */
export const summarizeBodySchema = z.object({
  /** The text to summarize. */
  text: textField,
  /** Word budget for the summary (the mock keeps the first N words). */
  maxLength: z.number().int().min(1).max(MAX_SUMMARY_WORDS).optional(),
  /** Summary style; the mock renders each distinctly. */
  style: z.enum(SUMMARY_STYLES).optional(),
  /** Per-call model override; defaults to the flagship chat model. */
  model: chatModelField.optional(),
  /** Document reference correlated into the ledger row's tags. */
  resourceId: resourceIdField,
})

/** The parsed summarize body. */
export type SummarizeBody = z.infer<typeof summarizeBodySchema>

/** Opts the summarize body into the global `ZodValidationPipe`. */
export class SummarizeBodyDto extends zodDto(summarizeBodySchema) {}
