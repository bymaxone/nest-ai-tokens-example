/**
 * @fileoverview The mock inference catalog: the provider id and the model
 * ids the deterministic in-app mock serves. Single source of truth shared
 * by the pricing seed (rate rows per model), the mock provider (response
 * `model` echo), and the workspace DTOs (per-call model override
 * validation), so the three surfaces can never drift apart.
 *
 * @layer ai
 */

/** Provider id of the deterministic in-app mock provider. */
export const MOCK_PROVIDER_ID = 'mock'

/** The flagship chat model (the workspace commands' default). */
export const MOCK_CHAT_PRO = 'mock-chat-pro'

/** The cheaper chat variant (the per-call override demo). */
export const MOCK_CHAT_LITE = 'mock-chat-lite'

/** The embeddings model (single and batch embeds). */
export const MOCK_EMBEDDING_MODEL = 'mock-embed'

/** Every chat model the mock serves; the first entry is the default. */
export const MOCK_CHAT_MODELS = [MOCK_CHAT_PRO, MOCK_CHAT_LITE] as const

/** A chat model id the mock serves. */
export type MockChatModel = (typeof MOCK_CHAT_MODELS)[number]

/** The default chat model for workspace commands. */
export const DEFAULT_CHAT_MODEL: MockChatModel = MOCK_CHAT_PRO
