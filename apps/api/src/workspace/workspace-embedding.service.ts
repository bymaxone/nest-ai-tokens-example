/**
 * @fileoverview The workspace embedding surface: single embed and batch
 * embed. The batch contract (spec §4.3 contract 1) is enforced by shape:
 * the whole batch is ONE provider call with ONE usage block, metered by
 * ONE `MeteringService.record` call, so exactly one aggregate ledger row
 * exists per batch — with the batch size persisted as a `batch-size:<n>`
 * tag beside the resource correlation.
 *
 * @layer workspace
 */
import { Inject, Injectable } from '@nestjs/common'
import { MeteringService } from '@bymax-one/nest-ai-tokens'
import type { UsageRecord } from '@bymax-one/nest-ai-tokens'

import type { EmbedBatchBody } from './dto/embed-batch.body.js'
import type { EmbedBody } from './dto/embed.body.js'
import { batchSizeTag, buildMeteringContext, resourceTag, usageViewOf } from './workspace-usage.js'
import type { WorkspaceUsageView } from './workspace-usage.js'
import { MOCK_EMBEDDING_MODEL } from '../ai/mock-models.js'
import { MockAiProvider } from '../ai/mock-ai.provider.js'
import type { MockEmbeddingResponse } from '../ai/mock-ai.types.js'
import { MOCK_EMBEDDING_PRESET } from '../ai/mock-usage.presets.js'
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
  /**
   * @param provider The deterministic mock inference layer.
   * @param metering The library's metering facade (container-resolved).
   */
  constructor(
    @Inject(MockAiProvider) private readonly provider: MockAiProvider,
    @Inject(MeteringService) private readonly metering: MeteringService,
  ) {}

  /**
   * Embed one text: one provider call, one ledger row.
   *
   * @param identity The request identity (payer scope).
   * @param body The validated embed body.
   * @returns The vector plus the usage view.
   */
  async embed(identity: DemoIdentity, body: EmbedBody): Promise<EmbedResult> {
    const response = await this.provider.embed({
      model: body.model ?? MOCK_EMBEDDING_MODEL,
      input: body.text,
    })
    const record = await this.record(identity, EMBEDDING_FEATURES.single, response, [
      resourceTag(body.resourceId),
    ])
    return {
      resourceId: body.resourceId,
      vector: firstVectorOf(response),
      usage: usageViewOf(record),
    }
  }

  /**
   * Embed a batch of texts as ONE aggregate transaction: one provider
   * call carrying every input, one usage block, one ledger row tagged
   * with the batch size.
   *
   * @param identity The request identity (payer scope).
   * @param body The validated batch body.
   * @returns The vectors (input order) plus the single-record usage view.
   */
  async embedBatch(identity: DemoIdentity, body: EmbedBatchBody): Promise<EmbedBatchResult> {
    const response = await this.provider.embed({
      model: body.model ?? MOCK_EMBEDDING_MODEL,
      input: body.texts,
    })
    const record = await this.record(identity, EMBEDDING_FEATURES.batch, response, [
      resourceTag(body.resourceId),
      batchSizeTag(body.texts.length),
    ])
    return {
      resourceId: body.resourceId,
      embeddings: response.data.map((entry) => entry.embedding),
      batchSize: body.texts.length,
      usage: usageViewOf(record),
    }
  }

  /** Meter one embedding response exactly once with the embedding preset. */
  private record(
    identity: DemoIdentity,
    feature: string,
    response: MockEmbeddingResponse,
    tags: readonly string[],
  ): Promise<UsageRecord> {
    return this.metering.record({
      usage: response,
      preset: MOCK_EMBEDDING_PRESET,
      context: buildMeteringContext(identity, feature, tags),
    })
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
