/**
 * @fileoverview Zod body DTOs for the `/system-jobs` simulations: the
 * reindex batch size and the agent-decision descriptor. Every field is
 * bounded; the strategy is slug-shaped so it can travel as a ledger tag,
 * and the reasoning is bounded free text that is ECHOED but never
 * persisted (the immutable ledger stores no request content).
 *
 * @layer system-jobs
 */
import { z } from 'zod'

import { zodDto } from '../../common/zod-dto.js'

/** Most documents one reindex run may embed. */
export const MAX_REINDEX_COUNT = 20

/** Documents embedded when the caller sends no count. */
export const DEFAULT_REINDEX_COUNT = 5

/** Body schema for `POST /system-jobs/reindex`. */
export const reindexBodySchema = z.object({
  /** How many fixture documents to embed in the single batch. */
  count: z.number().int().min(1).max(MAX_REINDEX_COUNT).default(DEFAULT_REINDEX_COUNT),
})

/** The parsed reindex body. */
export type ReindexBody = z.infer<typeof reindexBodySchema>

/** Opts the reindex body into the global `ZodValidationPipe`. */
export class ReindexBodyDto extends zodDto(reindexBodySchema) {}

/** A slug-shaped value that can travel as a ledger tag. */
const tagSafeSchema = z.string().regex(/^[A-Za-z0-9][\w.-]{0,63}$/, 'must be a short slug')

/** Body schema for `POST /system-jobs/agent-decision`. */
export const agentDecisionBodySchema = z.object({
  /** The decision this assist belongs to (persisted as `correlationId`). */
  decisionId: tagSafeSchema,
  /** The strategy the agent applied (persisted as a `strategy:` tag). */
  strategy: tagSafeSchema,
  /** The agent's confidence in `[0, 1]` (persisted as a `confidence:` tag). */
  confidence: z.number().min(0).max(1),
  /** The agent's reasoning: echoed in the response, NEVER persisted. */
  reasoning: z.string().min(1).max(2_000),
})

/** The parsed agent-decision body. */
export type AgentDecisionBody = z.infer<typeof agentDecisionBodySchema>

/** Opts the agent-decision body into the global `ZodValidationPipe`. */
export class AgentDecisionBodyDto extends zodDto(agentDecisionBodySchema) {}
