/**
 * @fileoverview Zod body DTO for `POST /workspace/analyze`. The output
 * schema is fixed SERVER-SIDE (`{ sentiment, entities }` per the spec), so
 * the body carries only the text and the shared override fields.
 *
 * @layer workspace
 */
import { z } from 'zod'

import { chatModelField, resourceIdField, textField } from './command-fields.js'
import { zodDto } from '../../common/zod-dto.js'

/** Body schema for the analyze command. */
export const analyzeBodySchema = z.object({
  /** The text to analyze against the fixed sentiment/entities schema. */
  text: textField,
  /** Per-call model override; defaults to the flagship chat model. */
  model: chatModelField.optional(),
  /** Document reference correlated into the ledger row's tags. */
  resourceId: resourceIdField,
})

/** The parsed analyze body. */
export type AnalyzeBody = z.infer<typeof analyzeBodySchema>

/** Opts the analyze body into the global `ZodValidationPipe`. */
export class AnalyzeBodyDto extends zodDto(analyzeBodySchema) {}
