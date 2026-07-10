/**
 * @fileoverview Pure, synchronous spend-hold estimators for the workspace
 * surface. The library sizes a hold from a host-supplied `HoldEstimate`; the
 * host owns BOTH the body-size token math (mirroring the mock provider's
 * `ceil(chars / 4)` rule) and the `QUOTA_TOLERANCE` headroom multiplier (the
 * library ships no estimation-tolerance option). Estimators never touch a
 * database or a request object: they are pure functions of the validated
 * body, so a shortfall rejection is deterministic for a given input.
 *
 * Estimates are deliberately approximations of the final prompt (task
 * directives add JSON overhead the estimate ignores): capture settles the
 * exact provider-reported usage, and the tolerance headroom absorbs the
 * drift in the common case.
 *
 * @layer workspace
 */
import type { HoldEstimate } from '@bymax-one/nest-ai-tokens'

import { MOCK_PROVIDER_ID } from '../ai/mock-models.js'

/** Characters per token, mirroring the mock provider's deterministic math. */
export const CHARS_PER_TOKEN = 4

/**
 * Estimate the tokens a text consumes: `ceil(chars / 4)`, never below one
 * (an empty text still occupies one prompt token in the mock's math).
 *
 * @param text The raw input text.
 * @returns The estimated token count.
 */
export function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN))
}

/**
 * Estimate a translate call: the text estimate scaled by the number of
 * requested target languages (each language produces its own output).
 *
 * @param text The source text.
 * @param targetCount The number of requested target languages.
 * @returns The estimated token count.
 */
export function estimateTranslateTokens(text: string, targetCount: number): number {
  return estimateTextTokens(text) * Math.max(1, targetCount)
}

/**
 * Estimate a batch embedding call: the sum of the per-text estimates (the
 * batch is ONE provider call whose usage aggregates every input).
 *
 * @param texts The ordered batch of input texts.
 * @returns The estimated token count.
 */
export function estimateBatchTokens(texts: readonly string[]): number {
  return texts.reduce((total, text) => total + estimateTextTokens(text), 0)
}

/**
 * Apply the host-side `QUOTA_TOLERANCE` headroom to a raw token estimate.
 * The scaled value rounds UP so a fractional product never under-reserves:
 * at tolerance `1.2`, an estimate of `1000` reserves exactly `1200` tokens
 * and `1001` reserves `1202` (the boundary the unit suite pins).
 *
 * @param tokens The raw token estimate.
 * @param tolerance The positive headroom multiplier (`QUOTA_TOLERANCE`).
 * @returns The scaled estimate, rounded up to a whole token.
 */
export function withTolerance(tokens: number, tolerance: number): number {
  return Math.ceil(tokens * tolerance)
}

/**
 * Build the rated hold estimate for a chat command. Output headroom mirrors
 * the input estimate: the mock's canned content grows with the input, so a
 * symmetric ceiling plus the tolerance covers the deterministic outputs.
 *
 * @param model The chat model the call will run on.
 * @param rawTokens The raw body-size token estimate.
 * @param tolerance The `QUOTA_TOLERANCE` headroom multiplier.
 * @returns The estimate handed to `MeteringService.hold`.
 */
export function chatHoldEstimate(
  model: string,
  rawTokens: number,
  tolerance: number,
): HoldEstimate {
  const scaled = withTolerance(rawTokens, tolerance)
  return {
    provider: MOCK_PROVIDER_ID,
    model,
    operation: 'chat',
    inputTokens: scaled,
    maxOutputTokens: scaled,
  }
}

/**
 * Build the rated hold estimate for an embedding call (no output tokens:
 * embeddings bill prompt tokens only).
 *
 * @param model The embeddings model the call will run on.
 * @param rawTokens The raw body-size token estimate.
 * @param tolerance The `QUOTA_TOLERANCE` headroom multiplier.
 * @returns The estimate handed to `MeteringService.hold`.
 */
export function embeddingHoldEstimate(
  model: string,
  rawTokens: number,
  tolerance: number,
): HoldEstimate {
  return {
    provider: MOCK_PROVIDER_ID,
    model,
    operation: 'embeddings',
    inputTokens: withTolerance(rawTokens, tolerance),
    maxOutputTokens: 0,
  }
}
