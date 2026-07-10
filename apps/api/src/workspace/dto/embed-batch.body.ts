/**
 * @fileoverview Zod body DTO for `POST /workspace/embed/batch`. The batch
 * is bounded (1..50 texts) and travels to the provider as ONE call with
 * ONE usage block, which is what lets the workspace record a single
 * aggregate ledger row for the whole batch.
 *
 * @layer workspace
 */
import { z } from 'zod'

import { resourceIdField, textField } from './command-fields.js'
import { MOCK_EMBEDDING_MODEL } from '../../ai/mock-models.js'
import { zodDto } from '../../common/zod-dto.js'

/** Most texts one batch may embed. */
export const MAX_BATCH_TEXTS = 50

/** Body schema for the batch embed call. */
export const embedBatchBodySchema = z.object({
  /** The ordered texts to embed (vectors return in the same order). */
  texts: z.array(textField).min(1).max(MAX_BATCH_TEXTS),
  /** Per-call model override (the catalog ships one embeddings model). */
  model: z.literal(MOCK_EMBEDDING_MODEL).optional(),
  /** Document reference correlated into the ledger row's tags. */
  resourceId: resourceIdField,
})

/** The parsed batch embed body. */
export type EmbedBatchBody = z.infer<typeof embedBatchBodySchema>

/** Opts the batch embed body into the global `ZodValidationPipe`. */
export class EmbedBatchBodyDto extends zodDto(embedBatchBodySchema) {}
