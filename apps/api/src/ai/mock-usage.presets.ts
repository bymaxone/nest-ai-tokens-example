/**
 * @fileoverview App-owned provider presets for the mock inference layer,
 * demonstrating the library's custom-provider extension point. The library
 * ships `providerPresets.openaiCompatible(id)` for OpenAI-shaped gateways,
 * but its normalizer leaves `NormalizedUsage.provider` empty (the .d.ts
 * documents "the preset or context to supply" it) and `record()` rates by
 * `usage.provider` — so a custom provider stamps its own id in a thin
 * normalizer wrapper to make rating hit its price rows. Embeddings have no
 * shipped normalizer at all (the OpenAI-compatible one requires
 * `completion_tokens` and hard-codes the `'chat'` operation), so the
 * embedding normalizer builds the canonical `NormalizedUsage` directly.
 *
 * @layer ai
 */
import { normalizeOpenAiCompatibleUsage } from '@bymax-one/nest-ai-tokens'
import type { NormalizedUsage, ProviderPreset } from '@bymax-one/nest-ai-tokens'
import { z } from 'zod'

import { MOCK_PROVIDER_ID } from './mock-models.js'

/** The response subset the embedding normalizer reads, structurally validated. */
const embeddingUsageShape = z.object({
  model: z.string(),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative() }),
})

/**
 * Normalize a mock chat response: the library's OpenAI-compatible math
 * (reused, never re-implemented) with the mock provider id stamped on.
 *
 * @param raw The raw mock chat response.
 * @returns The canonical usage, rated against the mock price rows.
 * @throws {Error} When the usage token fields are absent (the metering
 *   layer wraps this as `AI_TOKENS_USAGE_MALFORMED`).
 */
export function normalizeMockChatUsage(raw: unknown): NormalizedUsage {
  return { ...normalizeOpenAiCompatibleUsage(raw), provider: MOCK_PROVIDER_ID }
}

/**
 * Normalize a mock embedding response into the canonical usage: prompt
 * tokens only, `'embeddings'` operation (which selects the embeddings
 * price row), every other token category zero.
 *
 * @param raw The raw mock embedding response.
 * @returns The canonical usage.
 * @throws {Error} When the response lacks the model or usage fields (the
 *   metering layer wraps this as `AI_TOKENS_USAGE_MALFORMED`).
 */
export function normalizeMockEmbeddingUsage(raw: unknown): NormalizedUsage {
  const response = embeddingUsageShape.parse(raw)
  return {
    provider: MOCK_PROVIDER_ID,
    model: response.model,
    operation: 'embeddings',
    inputTokens: response.usage.prompt_tokens,
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
}

/** The preset the workspace commands hand to `MeteringService.record`. */
export const MOCK_CHAT_PRESET: ProviderPreset = {
  provider: MOCK_PROVIDER_ID,
  normalizer: normalizeMockChatUsage,
  ratingMode: 'rate-table',
}

/** The preset the workspace embeddings hand to `MeteringService.record`. */
export const MOCK_EMBEDDING_PRESET: ProviderPreset = {
  provider: MOCK_PROVIDER_ID,
  normalizer: normalizeMockEmbeddingUsage,
  ratingMode: 'rate-table',
}
