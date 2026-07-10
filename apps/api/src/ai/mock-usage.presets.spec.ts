/**
 * Unit tests for the app-owned mock provider presets.
 *
 * Layer: unit.
 * Goal: prove the chat normalizer reuses the library math while stamping
 * the mock provider id (rating would otherwise miss the mock price rows),
 * and the embedding normalizer builds the canonical embeddings usage with
 * structural validation of the raw response.
 * Mocks: none; normalizers are pure.
 */
import { describe, expect, it } from '@jest/globals'

import {
  MOCK_CHAT_PRESET,
  MOCK_EMBEDDING_PRESET,
  normalizeMockChatUsage,
  normalizeMockEmbeddingUsage,
} from './mock-usage.presets.js'
import { MOCK_PROVIDER_ID } from './mock-models.js'

describe('normalizeMockChatUsage', () => {
  /**
   * Library math + provider stamp.
   *
   * The wrapped library normalizer reads the OpenAI-compatible usage block
   * (prompt/completion split) and the wrapper stamps `provider: 'mock'`,
   * which is what routes rating to the seeded mock price rows.
   */
  it('normalizes the OpenAI-compatible shape under the mock provider id', () => {
    const usage = normalizeMockChatUsage({
      model: 'mock-chat-pro',
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    })

    expect(usage.provider).toBe(MOCK_PROVIDER_ID)
    expect(usage.model).toBe('mock-chat-pro')
    expect(usage.operation).toBe('chat')
    expect(usage.inputTokens).toBe(10)
    expect(usage.outputTokens).toBe(4)
  })

  /**
   * Malformed usage propagates.
   *
   * A response without the usage block must throw (the metering layer
   * wraps it as AI_TOKENS_USAGE_MALFORMED) instead of silently rating a
   * zero-token call.
   */
  it('throws on a response without usage fields', () => {
    expect(() => normalizeMockChatUsage({ model: 'mock-chat-pro' })).toThrow()
  })
})

describe('normalizeMockEmbeddingUsage', () => {
  /**
   * Canonical embeddings usage.
   *
   * Prompt tokens map to inputTokens, the operation is 'embeddings' (the
   * price-resolution key for the mock-embed row), and every other token
   * category is zero.
   */
  it('builds the embeddings usage with prompt tokens only', () => {
    const usage = normalizeMockEmbeddingUsage({
      model: 'mock-embed',
      usage: { prompt_tokens: 7 },
    })

    expect(usage).toMatchObject({
      provider: MOCK_PROVIDER_ID,
      model: 'mock-embed',
      operation: 'embeddings',
      inputTokens: 7,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
    })
  })

  /**
   * Structural rejection.
   *
   * A malformed raw response (missing usage, negative counts) must throw
   * rather than fabricate a zero-cost record.
   */
  it('throws on malformed embedding responses', () => {
    expect(() => normalizeMockEmbeddingUsage({ model: 'mock-embed' })).toThrow()
    expect(() =>
      normalizeMockEmbeddingUsage({ model: 'mock-embed', usage: { prompt_tokens: -1 } }),
    ).toThrow()
  })
})

describe('presets', () => {
  /**
   * Preset wiring.
   *
   * Both presets pair their normalizer with the mock provider id and the
   * deterministic rate-table mode — the tuple `MeteringService.record`
   * consumes.
   */
  it('binds the mock provider id and rate-table mode', () => {
    expect(MOCK_CHAT_PRESET).toEqual({
      provider: MOCK_PROVIDER_ID,
      normalizer: normalizeMockChatUsage,
      ratingMode: 'rate-table',
    })
    expect(MOCK_EMBEDDING_PRESET).toEqual({
      provider: MOCK_PROVIDER_ID,
      normalizer: normalizeMockEmbeddingUsage,
      ratingMode: 'rate-table',
    })
  })
})
