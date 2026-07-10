/**
 * @fileoverview Zod body DTO for `POST /workspace/rewrite`: bounded text,
 * an optional free-form style, an optional output language, and the shared
 * model override and resource correlation fields.
 *
 * @layer workspace
 */
import { z } from 'zod'

import { chatModelField, languageField, resourceIdField, textField } from './command-fields.js'
import { zodDto } from '../../common/zod-dto.js'

/** Longest style descriptor a rewrite may request. */
const MAX_STYLE_LENGTH = 64

/** Body schema for the rewrite command. */
export const rewriteBodySchema = z.object({
  /** The text to rewrite. */
  text: textField,
  /** Style descriptor, e.g. `formal` (tagged into the canned output). */
  style: z.string().min(1).max(MAX_STYLE_LENGTH).optional(),
  /** Output language (tagged into the canned output). */
  language: languageField.optional(),
  /** Per-call model override; defaults to the flagship chat model. */
  model: chatModelField.optional(),
  /** Document reference correlated into the ledger row's tags. */
  resourceId: resourceIdField,
})

/** The parsed rewrite body. */
export type RewriteBody = z.infer<typeof rewriteBodySchema>

/** Opts the rewrite body into the global `ZodValidationPipe`. */
export class RewriteBodyDto extends zodDto(rewriteBodySchema) {}
