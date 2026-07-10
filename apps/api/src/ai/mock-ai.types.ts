/**
 * @fileoverview Request/response shapes of the deterministic mock inference
 * layer. The RESPONSE shapes deliberately mirror the OpenAI-compatible wire
 * format (snake_case `usage.prompt_tokens` / `usage.completion_tokens`,
 * `choices[].finish_reason`): the mock stands in for a provider SDK, so the
 * app can meter its responses through the library's real normalizer path
 * exactly like a production consumer would with a live SDK.
 *
 * @layer ai
 */

/** A chat message role the mock understands. */
export type MockChatRole = 'system' | 'user' | 'assistant'

/** One chat message in a mock completion request. */
export interface MockChatMessage {
  /** The message author role. */
  readonly role: MockChatRole
  /** The message text (task directives travel as JSON in a user message). */
  readonly content: string
}

/** The response format the caller requests (OpenAI-compatible semantics). */
export type MockResponseFormat = 'text' | 'json_object'

/** A mock chat-completion request. */
export interface MockChatRequest {
  /** The chat model to answer as (echoed into the response). */
  readonly model: string
  /** The conversation; the LAST user message drives content synthesis. */
  readonly messages: readonly MockChatMessage[]
  /** Requested output format; defaults to `'text'`. */
  readonly responseFormat?: MockResponseFormat
}

/**
 * Why the completion ended: `'stop'` for a full answer, `'length'` when the
 * output was cut (the truncation failure-injection path).
 */
export type MockFinishReason = 'stop' | 'length'

/** OpenAI-compatible token usage block (what the library normalizer reads). */
export interface MockTokenUsage {
  /** Tokens consumed by the prompt: `ceil(promptChars / 4)`. */
  readonly prompt_tokens: number
  /** Tokens produced by the completion: `ceil(contentChars / 4)`. */
  readonly completion_tokens: number
  /** The sum of the two (informational, mirrors real providers). */
  readonly total_tokens: number
}

/** One completion choice (the mock always returns exactly one). */
export interface MockChatChoice {
  /** Choice position (always `0`). */
  readonly index: number
  /** The assistant message carrying the deterministic content. */
  readonly message: {
    readonly role: 'assistant'
    readonly content: string
  }
  /** Why the completion ended. */
  readonly finish_reason: MockFinishReason
}

/** A mock chat-completion response (OpenAI-compatible shape). */
export interface MockChatResponse {
  /** Deterministic response id derived from the request content. */
  readonly id: string
  /** The model that answered (echo of the request model). */
  readonly model: string
  /** The single completion choice. */
  readonly choices: readonly [MockChatChoice]
  /** The token usage the metering layer normalizes and rates. */
  readonly usage: MockTokenUsage
}

/** A mock embedding request (single text or a batch). */
export interface MockEmbeddingRequest {
  /** The embeddings model (echoed into the response). */
  readonly model: string
  /** One input text, or the ordered batch of texts to embed. */
  readonly input: string | readonly string[]
}

/** One embedded input with its position in the batch. */
export interface MockEmbeddingVector {
  /** Position of the source text in the request input. */
  readonly index: number
  /** The deterministic 8-dimension unit vector. */
  readonly embedding: readonly number[]
}

/** Embedding usage: prompts only (embeddings produce no completion tokens). */
export interface MockEmbeddingUsage {
  /** Tokens consumed across every input: `ceil(totalChars / 4)`. */
  readonly prompt_tokens: number
  /** Equals `prompt_tokens` (mirrors the OpenAI embeddings shape). */
  readonly total_tokens: number
}

/** A mock embedding response (OpenAI-compatible shape). */
export interface MockEmbeddingResponse {
  /** Deterministic response id derived from the request content. */
  readonly id: string
  /** The model that embedded (echo of the request model). */
  readonly model: string
  /** One vector per input, in input order. */
  readonly data: readonly MockEmbeddingVector[]
  /** The aggregate token usage for the whole request. */
  readonly usage: MockEmbeddingUsage
}
