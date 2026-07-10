/**
 * @fileoverview `MockAiProvider`, the deterministic in-app stand-in for a
 * provider SDK. The shipped library deliberately owns no inference: a host
 * calls its own SDK and hands the raw response to the metering layer
 * (`MeteringService.record({ usage, preset, context })`). This class plays
 * the SDK role with zero network, zero keys, and zero randomness, so every
 * token count, cost, and content byte is a pure function of the request.
 *
 * ADAPTING TO A REAL SDK: replace this class with your provider client and
 * keep everything else. `chatCompletion` maps to `openai.chat.completions
 * .create(...)` (or `anthropic.messages.create(...)`), `embed` maps to
 * `openai.embeddings.create(...)`; the workspace services then pass the raw
 * SDK response to `MeteringService.record` with the matching library preset
 * (`providerPresets.openaiChat`, `providerPresets.anthropic`, ...) instead
 * of the app-owned mock preset. Nothing in the metering path changes.
 *
 * Token math (spec-pinned): `prompt_tokens = ceil(totalPromptChars / 4)`,
 * `completion_tokens = ceil(contentChars / 4)`; embeddings consume prompt
 * tokens only. The response id is a SHA-256 digest of the request, so a
 * repeated request gets the same id (and the same everything else).
 *
 * @layer ai
 */
import { createHash } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'
import { z } from 'zod'

import { detectMarker } from './failure-markers.js'
import type { DegradeMode, DetectedMarker } from './failure-markers.js'
import { synthesizeChatContent } from './mock-content.js'
import type {
  MockChatMessage,
  MockChatRequest,
  MockChatResponse,
  MockEmbeddingRequest,
  MockEmbeddingResponse,
  MockEmbeddingVector,
  MockFinishReason,
} from './mock-ai.types.js'
import { ApiException } from '../common/api-exception.js'

/** DI token under which the provider options are provided. */
export const MOCK_AI_PROVIDER_OPTIONS = Symbol('MOCK_AI_PROVIDER_OPTIONS')

/** Construction options for {@link MockAiProvider}. */
export interface MockAiProviderOptions {
  /**
   * Artificial per-call latency in milliseconds, so a dashboard shows a
   * believable spinner. Zero (the default) skips the delay entirely; tests
   * always run at zero.
   */
  readonly latencyMs?: number
}

/** Characters per token in the spec-pinned mock token math. */
const CHARS_PER_TOKEN = 4

/** Dimensions of the deterministic mock embedding vectors. */
export const MOCK_EMBEDDING_DIMENSIONS = 8

/** FNV-1a offset basis (32-bit). */
const FNV_OFFSET_BASIS = 0x811c9dc5

/** FNV-1a prime (32-bit). */
const FNV_PRIME = 0x01000193

/** Buckets a hash collapses into per vector dimension. */
const DIMENSION_BUCKETS = 1000

/**
 * The spec-pinned mock token math: four characters per token, rounded up.
 *
 * @param chars The character count.
 * @returns The token count.
 */
export function tokensForChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

/**
 * 32-bit FNV-1a hash of a text under a per-dimension seed. Chosen for
 * determinism and portability, not security: it only spreads embedding
 * inputs across vector buckets.
 *
 * @param text The input text.
 * @param seed The dimension index diversifying the hash.
 * @returns The unsigned 32-bit hash.
 */
export function charCodeHash(text: string, seed: number): number {
  let hash = (FNV_OFFSET_BASIS ^ seed) >>> 0
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME) >>> 0
  }
  return hash
}

/**
 * The deterministic unit vector for one input text: each dimension maps a
 * seeded char-code hash into a non-zero bucket value in `(-1, 1)`, then the
 * vector is normalized to length 1. Bucket values are offset by one so no
 * dimension is ever exactly zero, which keeps the norm strictly positive
 * without an unreachable guard branch.
 *
 * @param text The input text.
 * @returns The 8-dimension unit vector.
 */
export function unitVectorFor(text: string): number[] {
  const raw = Array.from({ length: MOCK_EMBEDDING_DIMENSIONS }, (_, dimension) => {
    const bucket = (charCodeHash(text, dimension) % DIMENSION_BUCKETS) + 1
    return (bucket / (DIMENSION_BUCKETS + 1)) * 2 - 1
  })
  const norm = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0))
  return raw.map((value) => value / norm)
}

/**
 * Deterministic response id: `mock-` plus the SHA-256 digest of the
 * canonical request serialization (truncated for readability). Equal
 * requests get equal ids. SHA-256 is used over weaker digests as house
 * policy even though this id is not a security artifact.
 *
 * @param payload The request to fingerprint.
 * @returns The response id.
 */
export function responseIdFor(payload: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  return `mock-${digest.slice(0, 40)}`
}

/**
 * The deterministic in-app inference layer. See the file overview for the
 * SDK-adaptation guide; see `mock-content.ts` for the content protocol and
 * `failure-markers.ts` for the failure-injection markers.
 */
@Injectable()
export class MockAiProvider {
  /** The artificial per-call latency (0 disables the delay). */
  private readonly latencyMs: number

  /**
   * @param options The provider options (latency knob).
   */
  constructor(@Inject(MOCK_AI_PROVIDER_OPTIONS) options: MockAiProviderOptions) {
    this.latencyMs = options.latencyMs ?? 0
  }

  /**
   * Produce the deterministic chat completion for a request: canned content
   * from the last user message (see `mock-content.ts`), token counts from
   * the pinned char math, and a request-derived response id.
   *
   * @param request The chat request.
   * @returns The OpenAI-compatible mock response.
   */
  async chatCompletion(request: MockChatRequest): Promise<MockChatResponse> {
    await this.delay()
    const { messages, marker } = cleanChatMessages(request.messages)
    throwIfThrowMarker(marker)
    const format = request.responseFormat ?? 'text'
    const promptChars = messages.reduce((sum, message) => sum + message.content.length, 0)
    const cleanRequest: MockChatRequest = { ...request, messages }
    const synthesized = synthesizeChatContent(request.model, lastUserContent(cleanRequest), format)
    const { content, finishReason } = applyDegrade(
      synthesized,
      marker?.behavior.kind === 'degrade' ? marker.behavior.mode : undefined,
    )
    const promptTokens = tokensForChars(promptChars)
    const completionTokens = tokensForChars(content.length)
    return {
      id: responseIdFor(request),
      model: request.model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    }
  }

  /**
   * Produce the deterministic embedding(s) for a request: one unit vector
   * per input and aggregate prompt-token usage for the whole request (a
   * batch is ONE provider call with ONE usage block, which is what lets the
   * workspace record a single aggregate ledger row per batch).
   *
   * @param request The embedding request (single text or batch).
   * @returns The OpenAI-compatible mock response.
   */
  async embed(request: MockEmbeddingRequest): Promise<MockEmbeddingResponse> {
    await this.delay()
    const rawInputs = typeof request.input === 'string' ? [request.input] : request.input
    const detections = rawInputs.map((text) => detectMarker(text))
    // Degrade modes are chat semantics (truncation, JSON shape); embedding
    // inputs honor throw markers and silently strip the rest, so the scan
    // targets throw markers specifically: a degrade marker earlier in the
    // batch must not shadow a throw marker later in it.
    throwIfThrowMarker(detections.find((d) => d.marker?.behavior.kind === 'throw')?.marker)
    const inputs = detections.map((d) => d.cleanInput)
    const data: MockEmbeddingVector[] = inputs.map((text, index) => ({
      index,
      embedding: unitVectorFor(text),
    }))
    const totalChars = inputs.reduce((sum, text) => sum + text.length, 0)
    const promptTokens = tokensForChars(totalChars)
    return {
      id: responseIdFor(request),
      model: request.model,
      data,
      usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
    }
  }

  /** Apply the artificial latency; a zero knob never touches a timer. */
  private async delay(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.latencyMs))
    }
  }
}

/**
 * The content of the LAST user message, or the empty string for a
 * conversation with no user turn (the echo transform then echoes nothing).
 *
 * @param request The chat request.
 * @returns The last user message content.
 */
export function lastUserContent(request: MockChatRequest): string {
  const { messages } = request
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message !== undefined && message.role === 'user') return message.content
  }
  return ''
}

/** The cleaned conversation plus the first marker found across it. */
interface CleanedMessages {
  /** The messages with the detected marker stripped everywhere. */
  readonly messages: readonly MockChatMessage[]
  /** The first marker found in message order, if any. */
  readonly marker?: DetectedMarker | undefined
}

/**
 * Strip failure markers from a conversation. The first marker found (in
 * message order) decides the behavior; stripping every occurrence keeps
 * marker characters out of the token math (spec §12).
 *
 * @param messages The raw conversation.
 * @returns The cleaned conversation and the detected marker.
 */
export function cleanChatMessages(messages: readonly MockChatMessage[]): CleanedMessages {
  let marker: DetectedMarker | undefined
  const cleaned = messages.map((message) => {
    const detection = detectMarker(message.content)
    marker ??= detection.marker
    return { ...message, content: detection.cleanInput }
  })
  return { messages: cleaned, marker }
}

/**
 * Raise the app-owned provider error for a throw-kind marker; degrade
 * kinds and marker-free input pass through. Thrown BEFORE any usage
 * exists, so a failed call can never produce a ledger row.
 *
 * @param marker The detected marker, if any.
 * @throws {ApiException} The marker's documented code and HTTP status.
 */
export function throwIfThrowMarker(marker: DetectedMarker | undefined): void {
  if (marker !== undefined && marker.behavior.kind === 'throw') {
    const { code, httpStatus, message } = marker.behavior
    throw new ApiException(code, httpStatus, message, { marker: marker.token })
  }
}

/** A degraded (or untouched) completion: its content and finish reason. */
interface DegradedContent {
  readonly content: string
  readonly finishReason: MockFinishReason
}

/**
 * Apply a degrade mode to synthesized content (spec §12):
 * - `truncate`: keep the first half (rounded up) and finish with
 *   `'length'`: a real-but-cut response whose usage reflects what was
 *   actually produced;
 * - `bad_json`: replace the content with an unparseable fragment while
 *   keeping normal usage semantics;
 * - `partial_translations`: drop the LAST language from a translations
 *   payload (non-translation content passes through untouched).
 *
 * @param content The synthesized content.
 * @param mode The degrade mode, if a degrade marker was detected.
 * @returns The final content and finish reason.
 */
export function applyDegrade(content: string, mode: DegradeMode | undefined): DegradedContent {
  if (mode === 'truncate') {
    return { content: content.slice(0, Math.ceil(content.length / 2)), finishReason: 'length' }
  }
  if (mode === 'bad_json') return { content: 'not-json{', finishReason: 'stop' }
  if (mode === 'partial_translations') {
    return { content: dropLastTranslation(content), finishReason: 'stop' }
  }
  return { content, finishReason: 'stop' }
}

/**
 * Remove the last language from a `{ translations: { ... } }` payload so
 * the command layer can surface `command.missing_translations`. Content
 * that is not a translations payload is returned unchanged (the degrade
 * marker is then a no-op by design).
 *
 * @param content The synthesized JSON content.
 * @returns The content with the last translation dropped.
 */
export function dropLastTranslation(content: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return content
  }
  const shape = z.object({ translations: z.record(z.string(), z.string()) }).safeParse(parsed)
  if (!shape.success) return content
  const entries = Object.entries(shape.data.translations)
  return JSON.stringify({ translations: Object.fromEntries(entries.slice(0, -1)) })
}
