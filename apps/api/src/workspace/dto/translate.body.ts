/**
 * @fileoverview Zod body DTO for `POST /workspace/translate`. The shipped
 * library exports no command DTOs (inference is host code), so this schema
 * is app-owned: bounded text, at least one target language, optional model
 * override and resource correlation.
 *
 * @layer workspace
 */
import { z } from 'zod'

import {
  MAX_TARGET_LANGUAGES,
  chatModelField,
  languageField,
  resourceIdField,
  textField,
} from './command-fields.js'
import { zodDto } from '../../common/zod-dto.js'

/** Body schema for the translate command. */
export const translateBodySchema = z.object({
  /** The text to translate. */
  text: textField,
  /** Optional source language hint (echoed to the provider). */
  sourceLanguage: languageField.optional(),
  /** The languages to translate into, in response order. */
  targetLanguages: z.array(languageField).min(1).max(MAX_TARGET_LANGUAGES),
  /** Per-call model override; defaults to the flagship chat model. */
  model: chatModelField.optional(),
  /** Document reference correlated into the ledger row's tags. */
  resourceId: resourceIdField,
})

/** The parsed translate body. */
export type TranslateBody = z.infer<typeof translateBodySchema>

/** Opts the translate body into the global `ZodValidationPipe`. */
export class TranslateBodyDto extends zodDto(translateBodySchema) {}
