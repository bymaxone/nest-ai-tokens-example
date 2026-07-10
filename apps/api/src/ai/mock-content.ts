/**
 * @fileoverview Deterministic content synthesis for the mock inference
 * layer: canned, input-derived answers so every workspace response is a
 * pure function of the request and therefore assertable in tests.
 *
 * The workspace command services talk to the mock through a small "task
 * directive" protocol: the LAST user message carries a JSON directive
 * (`{ "task": "translate", ... }`) exactly like a real JSON-mode prompt
 * would carry instructions, and the mock synthesizes the matching canned
 * shape (per-language tagged translations, first-N-words summaries, a
 * fixed sentiment/entities object). A message that is not a directive gets
 * the generic echo transform. Everything here is pure and side-effect
 * free; no clock, no randomness.
 *
 * @layer ai
 */
import { z } from 'zod'

/** The canned summary styles the mock renders distinctly. */
export const SUMMARY_STYLES = ['bullet', 'paragraph', 'tldr'] as const

/** A canned summary style. */
export type SummaryStyle = (typeof SUMMARY_STYLES)[number]

/** Words a summary keeps when the directive does not bound it. */
export const DEFAULT_SUMMARY_WORDS = 12

/** The sentiments the analyze transform can derive, in derivation order. */
export const MOCK_SENTIMENTS = ['negative', 'neutral', 'positive'] as const

/** A derived sentiment label. */
export type MockSentiment = (typeof MOCK_SENTIMENTS)[number]

/** How many entities the analyze transform reports at most. */
const MAX_ENTITIES = 5

/** Directive asking for per-language tagged translations. */
const translateDirectiveSchema = z.object({
  task: z.literal('translate'),
  text: z.string(),
  sourceLanguage: z.string().optional(),
  targetLanguages: z.array(z.string()).min(1),
})

/** Directive asking for a first-N-words summary in a style. */
const summarizeDirectiveSchema = z.object({
  task: z.literal('summarize'),
  text: z.string(),
  maxWords: z.number().int().positive().optional(),
  style: z.enum(SUMMARY_STYLES).optional(),
})

/** Directive asking for a tagged rewrite. */
const rewriteDirectiveSchema = z.object({
  task: z.literal('rewrite'),
  text: z.string(),
  style: z.string().optional(),
  language: z.string().optional(),
})

/** Directive asking for the fixed sentiment/entities analysis. */
const analyzeDirectiveSchema = z.object({
  task: z.literal('analyze'),
  text: z.string(),
})

/** Every task directive the mock understands. */
export const mockTaskDirectiveSchema = z.discriminatedUnion('task', [
  translateDirectiveSchema,
  summarizeDirectiveSchema,
  rewriteDirectiveSchema,
  analyzeDirectiveSchema,
])

/** A parsed task directive. */
export type MockTaskDirective = z.infer<typeof mockTaskDirectiveSchema>

/** The fixed analyze output shape (spec-pinned schema). */
export interface MockAnalysis {
  /** The derived sentiment label. */
  readonly sentiment: MockSentiment
  /** Capitalized words found in the text (first {@link MAX_ENTITIES}). */
  readonly entities: readonly string[]
}

/**
 * Collapse whitespace runs and trim, so content never depends on incidental
 * formatting of the request text.
 *
 * @param text The raw text.
 * @returns The whitespace-normalized text.
 */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Parse a user message into a task directive, when it is one.
 *
 * @param content The last user message content.
 * @returns The directive, or `undefined` for non-directive messages.
 */
export function parseDirective(content: string): MockTaskDirective | undefined {
  let candidate: unknown
  try {
    candidate = JSON.parse(content)
  } catch {
    return undefined
  }
  const parsed = mockTaskDirectiveSchema.safeParse(candidate)
  return parsed.success ? parsed.data : undefined
}

/**
 * The canned translation for one language: the language tag plus the
 * uppercased source text.
 *
 * @param language The target language code.
 * @param text The normalized source text.
 * @returns The tagged translation.
 */
export function translationFor(language: string, text: string): string {
  return `[${language}] ${text.toUpperCase()}`
}

/**
 * Render the translate directive as a JSON object with one tagged
 * translation per requested language, in request order.
 *
 * @param directive The translate directive.
 * @returns A parseable JSON string: `{ "translations": { <lang>: ... } }`.
 */
export function translateContent(
  directive: Readonly<{ text: string; targetLanguages: readonly string[] }>,
): string {
  const text = normalizeText(directive.text)
  const translations = Object.fromEntries(
    directive.targetLanguages.map((language) => [language, translationFor(language, text)]),
  )
  return JSON.stringify({ translations })
}

/**
 * Derive the deterministic analysis: sentiment from the char-code sum
 * modulo the sentiment count, entities from the capitalized words.
 *
 * @param text The text to analyze (normalized internally).
 * @returns The fixed sentiment/entities shape.
 */
export function analyzeText(text: string): MockAnalysis {
  const normalized = normalizeText(text)
  let charSum = 0
  // charCodeAt(0) is always a number for the non-empty strings for..of yields.
  for (const char of normalized) charSum += char.charCodeAt(0)
  const remainder = charSum % MOCK_SENTIMENTS.length
  const sentiment: MockSentiment =
    remainder === 0 ? 'negative' : remainder === 1 ? 'neutral' : 'positive'
  const capitalized = normalized.match(/\b[A-Z][A-Za-z]+/g) ?? []
  const entities = [...new Set(capitalized)].slice(0, MAX_ENTITIES)
  return { sentiment, entities }
}

/**
 * Render the analyze directive as the fixed JSON schema.
 *
 * @param directive The analyze directive.
 * @returns A parseable JSON string: `{ "sentiment": ..., "entities": [...] }`.
 */
export function analyzeContent(directive: Readonly<{ text: string }>): string {
  return JSON.stringify(analyzeText(directive.text))
}

/**
 * Render the summarize directive: the first N words of the text, shaped by
 * the requested style and tagged so tests can assert the style took.
 *
 * @param directive The summarize directive.
 * @returns The tagged summary text.
 */
export function summarizeContent(
  directive: Readonly<{
    text: string
    maxWords?: number | undefined
    style?: SummaryStyle | undefined
  }>,
): string {
  const style = directive.style ?? 'paragraph'
  const maxWords = directive.maxWords ?? DEFAULT_SUMMARY_WORDS
  const words = normalizeText(directive.text).split(' ')
  const kept = words.slice(0, maxWords).join(' ')
  const suffix = words.length > maxWords ? ' ...' : ''
  const body = style === 'tldr' ? `TL;DR: ${kept}` : style === 'bullet' ? `- ${kept}` : kept
  return `[summary:${style}] ${body}${suffix}`
}

/**
 * Render the rewrite directive: the normalized text under a style (and
 * optional language) tag.
 *
 * @param directive The rewrite directive.
 * @returns The tagged rewrite.
 */
export function rewriteContent(
  directive: Readonly<{ text: string; style?: string | undefined; language?: string | undefined }>,
): string {
  const style = directive.style ?? 'neutral'
  const languageTag = directive.language === undefined ? '' : `:${directive.language}`
  return `[rewrite:${style}${languageTag}] ${normalizeText(directive.text)}`
}

/**
 * The generic echo transform for non-directive messages: a parseable JSON
 * echo in JSON mode, a model-tagged echo in text mode.
 *
 * @param model The answering model (part of the tag).
 * @param content The last user message content.
 * @param format The requested response format.
 * @returns The echo content.
 */
export function echoContent(
  model: string,
  content: string,
  format: 'text' | 'json_object',
): string {
  const normalized = normalizeText(content)
  if (format === 'json_object') return JSON.stringify({ echo: normalized, model })
  return `[mock:${model}] ${normalized}`
}

/**
 * Synthesize the completion content for a request: directive-shaped canned
 * output when the last user message is a task directive, the echo
 * transform otherwise. Pure; same inputs always yield the same content.
 *
 * @param model The answering model.
 * @param lastUserContent The last user message content.
 * @param format The requested response format.
 * @returns The deterministic completion content.
 */
export function synthesizeChatContent(
  model: string,
  lastUserContent: string,
  format: 'text' | 'json_object',
): string {
  const directive = parseDirective(lastUserContent)
  switch (directive?.task) {
    case 'translate':
      return translateContent(directive)
    case 'analyze':
      return analyzeContent(directive)
    case 'summarize':
      return summarizeContent(directive)
    case 'rewrite':
      return rewriteContent(directive)
    default:
      return echoContent(model, lastUserContent, format)
  }
}
