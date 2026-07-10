/**
 * @fileoverview Field schemas shared by the workspace DTOs. Every free-text
 * field is size-bounded (no unbounded payloads reach the mock or the token
 * math) and the identifiers are shape-restricted so they are safe to embed
 * in ledger tags.
 *
 * @layer workspace
 */
import { z } from 'zod'

import { MOCK_CHAT_MODELS } from '../../ai/mock-models.js'

/** Longest text any single workspace field accepts. */
export const MAX_TEXT_LENGTH = 10_000

/** Most target languages one translate call may request. */
export const MAX_TARGET_LANGUAGES = 10

/** The `resourceId` applied when the client sends none. */
export const DEFAULT_RESOURCE_ID = 'doc-adhoc'

/** Bounded free text (the body of every command). */
export const textField = z.string().min(1).max(MAX_TEXT_LENGTH)

/** A language code such as `pt`, `es`, or `pt-BR`. */
export const languageField = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'expected a language code such as pt or pt-BR')

/** Per-call chat model override (catalog-restricted so pricing always resolves). */
export const chatModelField = z.enum(MOCK_CHAT_MODELS)

/**
 * The document reference correlated into the usage record's tags. Shape
 * restricted (no spaces, no colons) so the `resource:<id>` tag stays
 * unambiguous and filterable.
 */
export const resourceIdField = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, 'expected a short id such as doc-1')
  .default(DEFAULT_RESOURCE_ID)
