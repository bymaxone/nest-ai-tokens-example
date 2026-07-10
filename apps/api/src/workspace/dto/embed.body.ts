/**
 * @fileoverview Zod body DTO for `POST /workspace/embed` (single text).
 * `dimensions` is accepted for SDK fidelity with real embedding APIs but
 * IGNORED by the deterministic mock, which always returns its fixed
 * 8-dimension unit vectors.
 *
 * @layer workspace
 */
import { z } from 'zod'

import { resourceIdField, textField } from './command-fields.js'
import { MOCK_EMBEDDING_MODEL } from '../../ai/mock-models.js'
import { zodDto } from '../../common/zod-dto.js'

/** Largest dimension count the schema admits (OpenAI-compatible bound). */
const MAX_DIMENSIONS = 3072

/** Body schema for the single embed call. */
export const embedBodySchema = z.object({
  /** The text to embed. */
  text: textField,
  /** Per-call model override (the catalog ships one embeddings model). */
  model: z.literal(MOCK_EMBEDDING_MODEL).optional(),
  /** Accepted for SDK fidelity; ignored by the deterministic mock. */
  dimensions: z.number().int().min(1).max(MAX_DIMENSIONS).optional(),
  /** Document reference correlated into the ledger row's tags. */
  resourceId: resourceIdField,
})

/** The parsed embed body. */
export type EmbedBody = z.infer<typeof embedBodySchema>

/** Opts the embed body into the global `ZodValidationPipe`. */
export class EmbedBodyDto extends zodDto(embedBodySchema) {}
