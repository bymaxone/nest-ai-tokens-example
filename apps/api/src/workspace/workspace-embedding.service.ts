/**
 * @fileoverview The workspace embedding surface: single embed and batch
 * embed. Each call runs the library's full enforcement lifecycle: a
 * body-size estimator (scaled by the host `QUOTA_TOLERANCE`) sizes a spend
 * hold, so a wallet/budget shortfall rejects BEFORE the mock inference runs
 * and writes NO ledger row. The batch contract (spec §4.3 contract 1) is
 * enforced by shape: the whole batch is ONE provider call with ONE usage
 * block settled by ONE capture, so exactly one aggregate ledger row exists
 * per batch: with the batch size persisted as a `batch-size:<n>` tag beside
 * the resource correlation.
 *
 * @layer workspace
 */
import { Inject, Injectable } from '@nestjs/common'
import { MeteringService } from '@bymax-one/nest-ai-tokens'
import type { HoldEstimate, UsageRecord } from '@bymax-one/nest-ai-tokens'

import type { EmbedBatchBody } from './dto/embed-batch.body.js'
import type { EmbedBody } from './dto/embed.body.js'
import { buildMeteringContext } from '../ai/metering-context.js'
import { runWithHold } from '../ai/metered-call.js'
import {
  embeddingHoldEstimate,
  estimateBatchTokens,
  estimateTextTokens,
} from './workspace-estimators.js'
import { batchSizeTag, resourceTag, usageViewOf } from './workspace-usage.js'
import type { WorkspaceUsageView } from './workspace-usage.js'
import { MOCK_EMBEDDING_MODEL } from '../ai/mock-models.js'
import { MockAiProvider } from '../ai/mock-ai.provider.js'
import type { MockEmbeddingResponse } from '../ai/mock-ai.types.js'
import { MOCK_EMBEDDING_PRESET } from '../ai/mock-usage.presets.js'
import { ENV_CONFIG } from '../config/env.js'
import type { EnvConfig } from '../config/env.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

/** The feature labels the embedding calls meter under. */
export const EMBEDDING_FEATURES = {
  single: 'workspace.embed',
  batch: 'workspace.embed.batch',
} as const

/** The single-embed response. */
export interface EmbedResult {
  /** Echo of the request's document reference. */
  readonly resourceId: string
  /** The deterministic 8-dimension unit vector. */
  readonly vector: readonly number[]
  /** The metering summary (transaction id, tokens, exact costs). */
  readonly usage: WorkspaceUsageView
}

/** The batch-embed response: many vectors, ONE transaction. */
export interface EmbedBatchResult {
  /** Echo of the request's document reference. */
  readonly resourceId: string
  /** One vector per input text, in input order. */
  readonly embeddings: readonly (readonly number[])[]
  /** The number of inputs the single aggregate record covers. */
  readonly batchSize: number
  /** The metering summary of the ONE aggregate record. */
  readonly usage: WorkspaceUsageView
}

/** Serves the workspace embedding endpoints. */
@Injectable()
export class WorkspaceEmbeddingService {
  /** The host-side estimation headroom applied to every spend hold. */
  private readonly tolerance: number

  /**
   * @param provider The deterministic mock inference layer.
   * @param metering The library's metering facade (container-resolved).
   * @param env The typed environment (supplies `QUOTA_TOLERANCE`).
   */
  constructor(
    @Inject(MockAiProvider) private readonly provider: MockAiProvider,
    @Inject(MeteringService) private readonly metering: MeteringService,
    @Inject(ENV_CONFIG) env: EnvConfig,
  ) {
    this.tolerance = env.QUOTA_TOLERANCE
  }

  /**
   * Embed one text: one provider call, one settled ledger row.
   *
   * @param identity The request identity (payer scope).
   * @param body The validated embed body.
   * @returns The vector plus the usage view.
   */
  async embed(identity: DemoIdentity, body: EmbedBody): Promise<EmbedResult> {
    const record = await this.run(
      identity,
      EMBEDDING_FEATURES.single,
      body.model ?? MOCK_EMBEDDING_MODEL,
      body.text,
      estimateTextTokens(body.text),
      [resourceTag(body.resourceId)],
    )
    return {
      resourceId: body.resourceId,
      vector: firstVectorOf(record.response),
      usage: usageViewOf(record.record),
    }
  }

  /**
   * Embed a batch of texts as ONE aggregate transaction: one hold sized by
   * the summed estimate, one provider call carrying every input, one usage
   * block, one settled ledger row tagged with the batch size.
   *
   * @param identity The request identity (payer scope).
   * @param body The validated batch body.
   * @returns The vectors (input order) plus the single-record usage view.
   */
  async embedBatch(identity: DemoIdentity, body: EmbedBatchBody): Promise<EmbedBatchResult> {
    const record = await this.run(
      identity,
      EMBEDDING_FEATURES.batch,
      body.model ?? MOCK_EMBEDDING_MODEL,
      [...body.texts],
      estimateBatchTokens(body.texts),
      [resourceTag(body.resourceId), batchSizeTag(body.texts.length)],
    )
    return {
      resourceId: body.resourceId,
      embeddings: record.response.data.map((entry) => entry.embedding),
      batchSize: body.texts.length,
      usage: usageViewOf(record.record),
    }
  }

  /** Hold, run the embedding call, and settle it with the actual usage. */
  private async run(
    identity: DemoIdentity,
    feature: string,
    model: string,
    input: string | readonly string[],
    rawTokens: number,
    tags: readonly string[],
  ): Promise<{ response: MockEmbeddingResponse; record: UsageRecord }> {
    const context = buildMeteringContext(identity, feature, tags)
    const estimate: HoldEstimate = embeddingHoldEstimate(model, rawTokens, this.tolerance)
    const call = await runWithHold(this.metering, context, estimate, MOCK_EMBEDDING_PRESET, () =>
      this.provider.embed({ model, input }),
    )
    const record = await call.settle()
    return { response: call.response, record }
  }
}

/**
 * The single vector of a single-input embedding response. The provider
 * contract guarantees one vector per input; a missing vector is a
 * provider-layer bug surfaced loudly rather than an empty embedding.
 *
 * @param response The mock embedding response.
 * @returns The first (and only) vector.
 * @throws {Error} When the response carries no vector.
 */
export function firstVectorOf(response: MockEmbeddingResponse): readonly number[] {
  const first = response.data[0]
  if (first === undefined) {
    throw new Error('The mock embedding response carried no vector for the input.')
  }
  return first.embedding
}
