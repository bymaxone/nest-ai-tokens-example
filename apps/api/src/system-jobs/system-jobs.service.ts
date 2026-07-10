/**
 * @fileoverview The `/system-jobs` simulations: platform work whose cost the
 * PLATFORM absorbs. Both jobs meter through `MeteringService.record` with
 * the library's reserved system-cost fields (`isSystemCost: true` plus a
 * `systemCostCategory`), so their rows never consume a wallet or budget and
 * never appear in user cost reports, while `/usage/system-costs` aggregates
 * them by category.
 *
 * `reindex` runs ONE batch embedding over deterministic fixture documents
 * (tenant-scoped: the nightly maintenance job of the admin's target
 * tenant). `agent-decision` records the deterministic 25-token assist an
 * autonomous agent consumed for a user: the decision id travels as
 * `correlationId` and the strategy/confidence as tags (the immutable
 * ledger stores no free text, so the reasoning is echoed back, never
 * persisted).
 *
 * @layer system-jobs
 */
import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { MeteringService } from '@bymax-one/nest-ai-tokens'
import type { NormalizedUsage, UsageRecord } from '@bymax-one/nest-ai-tokens'

import type { AgentDecisionBody, ReindexBody } from './dto/system-jobs.bodies.js'
import { batchSizeTag, resourceTag } from '../ai/correlation-tags.js'
import { tenantIdOf } from '../ai/metering-context.js'
import { MOCK_CHAT_LITE, MOCK_EMBEDDING_MODEL, MOCK_PROVIDER_ID } from '../ai/mock-models.js'
import { MockAiProvider } from '../ai/mock-ai.provider.js'
import { MOCK_EMBEDDING_PRESET } from '../ai/mock-usage.presets.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

/**
 * The only identity allowed to trigger the reindex job. Demo convention:
 * `root` stands in for the platform scheduler, targeting a tenant via
 * `x-tenant-id` exactly like the other admin planes.
 */
export const SYSTEM_JOBS_ADMIN_USER_ID = 'root'

/** The feature labels the system jobs meter under. */
export const SYSTEM_JOB_FEATURES = {
  reindex: 'system.reindex',
  agentDecision: 'agent.decision-assist',
} as const

/** The system-cost categories the jobs record. */
export const SYSTEM_COST_CATEGORIES = {
  reindex: 'reindex',
  agentDecision: 'agent-decision',
} as const

/** The resource reference every reindex run correlates to. */
export const REINDEX_RESOURCE_ID = 'reindex-run'

/** Deterministic input tokens one agent-decision assist consumes. */
export const AGENT_DECISION_TOKENS = 25

/**
 * The deterministic fixture corpus a reindex run embeds (sliced to the
 * requested count). Stable strings keep the batch usage reproducible.
 */
export const REINDEX_DOCUMENTS: readonly string[] = Array.from(
  { length: 20 },
  (unused, index) => `reindex document ${String(index + 1).padStart(2, '0')}: knowledge base page`,
)

/** The response of a reindex run. */
export interface ReindexResult {
  /** The single aggregate transaction id. */
  readonly transactionId: string
  /** How many fixture documents the batch embedded. */
  readonly batchSize: number
  /** Total tokens the batch consumed. */
  readonly tokensUsed: number
  /** The recorded category (present under /usage/system-costs). */
  readonly systemCostCategory: string
}

/** The response of an agent-decision assist. */
export interface AgentDecisionResult {
  /** Echo of the decision id (persisted as `correlationId`). */
  readonly decisionId: string
  /** Echo of the strategy (persisted as a tag). */
  readonly strategy: string
  /** Echo of the confidence (persisted as a tag). */
  readonly confidence: number
  /** Echo of the reasoning: NEVER persisted. */
  readonly reasoning: string
  /** The recorded transaction id. */
  readonly transactionId: string
  /** Tokens the assist consumed. */
  readonly tokensUsed: number
}

/** Serves the `/system-jobs` simulations. */
@Injectable()
export class SystemJobsService {
  /**
   * @param provider The deterministic mock inference layer.
   * @param metering The library's metering facade (container-resolved).
   */
  constructor(
    @Inject(MockAiProvider) private readonly provider: MockAiProvider,
    @Inject(MeteringService) private readonly metering: MeteringService,
  ) {}

  /**
   * Run the nightly-reindex simulation: ONE batch embedding over the
   * fixture corpus, recorded as a tenant-scoped system cost.
   *
   * @param identity The caller (must be the demo admin; the target tenant
   *   comes from `x-tenant-id` or the admin's own tenant mapping).
   * @param body The validated reindex body.
   * @returns The aggregate transaction summary.
   * @throws {ForbiddenException} when the caller is not the demo admin.
   */
  async reindex(identity: DemoIdentity, body: ReindexBody): Promise<ReindexResult> {
    if (identity.id !== SYSTEM_JOBS_ADMIN_USER_ID) {
      throw new ForbiddenException('The reindex job is restricted to the demo admin (root)')
    }
    const documents = REINDEX_DOCUMENTS.slice(0, body.count)
    const response = await this.provider.embed({ model: MOCK_EMBEDDING_MODEL, input: documents })
    const tenantId = tenantIdOf(identity)
    const record = await this.metering.record({
      usage: response,
      preset: MOCK_EMBEDDING_PRESET,
      context: {
        tenantId,
        scope: { type: 'tenant', id: tenantId },
        requestedBy: identity.id,
        feature: SYSTEM_JOB_FEATURES.reindex,
        isSystemCost: true,
        systemCostCategory: SYSTEM_COST_CATEGORIES.reindex,
        tags: [resourceTag(REINDEX_RESOURCE_ID), batchSizeTag(documents.length)],
      },
    })
    return {
      transactionId: record.id,
      batchSize: documents.length,
      tokensUsed: record.totalTokens,
      systemCostCategory: SYSTEM_COST_CATEGORIES.reindex,
    }
  }

  /**
   * Record one agent-decision assist: a deterministic 25-token usage
   * attributed to the user but absorbed by the platform.
   *
   * @param identity The request identity (the assisted user).
   * @param body The validated decision descriptor.
   * @returns The echo plus the recorded transaction summary.
   */
  async agentDecision(
    identity: DemoIdentity,
    body: AgentDecisionBody,
  ): Promise<AgentDecisionResult> {
    const record = await this.recordAssist(identity, body)
    return {
      decisionId: body.decisionId,
      strategy: body.strategy,
      confidence: body.confidence,
      reasoning: body.reasoning,
      transactionId: record.id,
      tokensUsed: record.totalTokens,
    }
  }

  /** Meter the deterministic assist usage under the reserved system fields. */
  private recordAssist(identity: DemoIdentity, body: AgentDecisionBody): Promise<UsageRecord> {
    const usage: NormalizedUsage = {
      provider: MOCK_PROVIDER_ID,
      model: MOCK_CHAT_LITE,
      operation: 'chat',
      inputTokens: AGENT_DECISION_TOKENS,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0,
      audioInTokens: 0,
      audioOutTokens: 0,
      imageInTokens: 0,
      imageOutTokens: 0,
    }
    return this.metering.record({
      usage,
      context: {
        tenantId: tenantIdOf(identity),
        scope: { type: 'user', id: identity.id },
        feature: SYSTEM_JOB_FEATURES.agentDecision,
        isSystemCost: true,
        systemCostCategory: SYSTEM_COST_CATEGORIES.agentDecision,
        correlationId: body.decisionId,
        tags: [`strategy:${body.strategy}`, `confidence:${body.confidence}`],
      },
    })
  }
}
