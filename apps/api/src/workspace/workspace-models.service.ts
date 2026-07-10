/**
 * @fileoverview The models info read: default models plus their CURRENT
 * price rows, composed from the app catalog and the library's
 * `PricingService.resolveRate` (the shipped library has no
 * getDefaultModel/getCurrentPricing helpers; the default model is a host
 * decision and "current pricing" is the rate in effect right now). All
 * bigint rates map to decimal strings at this HTTP boundary via the
 * library's `toJsonSafe`.
 *
 * @layer workspace
 */
import { Inject, Injectable } from '@nestjs/common'
import { PricingService, toJsonSafe } from '@bymax-one/nest-ai-tokens'
import type { AiOperation, JsonSafe, PriceVersion } from '@bymax-one/nest-ai-tokens'

import {
  DEFAULT_CHAT_MODEL,
  MOCK_CHAT_MODELS,
  MOCK_EMBEDDING_MODEL,
  MOCK_PROVIDER_ID,
} from '../ai/mock-models.js'

/** One service's model info: the default model and its current pricing. */
export interface ModelInfo {
  /** The default model the endpoints use without an override. */
  readonly model: string
  /** The current (open) price row, bigint rates as decimal strings. */
  readonly pricing: JsonSafe<PriceVersion>
}

/** The `GET /workspace/models` payload. */
export interface ModelsInfo {
  /** The chat-command side: default model, override choices, pricing. */
  readonly command: ModelInfo & { readonly models: readonly string[] }
  /** The embeddings side: default model and pricing. */
  readonly embedding: ModelInfo
}

/** Serves the models info read. */
@Injectable()
export class WorkspaceModelsService {
  /**
   * @param pricing The library's pricing service (container-resolved).
   */
  constructor(@Inject(PricingService) private readonly pricing: PricingService) {}

  /**
   * Compose the default models with their current price rows.
   *
   * @returns The models info payload.
   * @throws {AiTokensException} `AI_TOKENS_PRICE_NOT_FOUND` if a catalog
   *   model has no open price row (impossible after the boot seed; strict
   *   pricing keeps such a state loud).
   */
  async describeModels(): Promise<ModelsInfo> {
    const [command, embedding] = await Promise.all([
      this.currentPricing(DEFAULT_CHAT_MODEL, 'chat'),
      this.currentPricing(MOCK_EMBEDDING_MODEL, 'embeddings'),
    ])
    return {
      command: { model: DEFAULT_CHAT_MODEL, models: MOCK_CHAT_MODELS, pricing: command },
      embedding: { model: MOCK_EMBEDDING_MODEL, pricing: embedding },
    }
  }

  /** Resolve the rate in effect now for one catalog tuple. */
  private async currentPricing(
    model: string,
    operation: AiOperation,
  ): Promise<JsonSafe<PriceVersion>> {
    const rate = await this.pricing.resolveRate({
      provider: MOCK_PROVIDER_ID,
      model,
      operation,
      at: new Date(),
    })
    // Strict pricing throws on a miss, so a null can only mean the module
    // was reconfigured non-strict without seeding; keep that loud too.
    if (rate === null) {
      throw new Error(`No current price row for ${MOCK_PROVIDER_ID}/${model}/${operation}`)
    }
    return toJsonSafe(rate)
  }
}
