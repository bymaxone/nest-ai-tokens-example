/**
 * Unit tests for the workspace body DTOs.
 *
 * Layer: unit.
 * Goal: prove the size bounds, enum restrictions, defaults, and rejection
 * branches of every command schema (the validation surface the security
 * review leans on: no unbounded payloads, no unpriced models, tag-safe
 * resource ids).
 * Mocks: none; schemas are pure.
 */
import { describe, expect, it } from '@jest/globals'

import { analyzeBodySchema } from './analyze.body.js'
import { DEFAULT_RESOURCE_ID, MAX_TARGET_LANGUAGES, MAX_TEXT_LENGTH } from './command-fields.js'
import { customBodySchema } from './custom.body.js'
import { rewriteBodySchema } from './rewrite.body.js'
import { summarizeBodySchema } from './summarize.body.js'
import { translateBodySchema } from './translate.body.js'

describe('translate body', () => {
  /**
   * Happy path with defaults.
   *
   * Minimal input parses; the resource id defaults to the documented
   * ad-hoc reference so every record is tag-correlated.
   */
  it('parses minimal input and defaults resourceId', () => {
    const body = translateBodySchema.parse({ text: 'Hi', targetLanguages: ['pt'] })

    expect(body.resourceId).toBe(DEFAULT_RESOURCE_ID)
    expect(body.model).toBeUndefined()
  })

  /**
   * Bound rejections.
   *
   * Empty text, oversized text, empty/oversized language lists, malformed
   * language codes, unknown models, and tag-unsafe resource ids all fail
   * validation (sizes bounded; nothing unpriced or unfilterable).
   */
  it('rejects out-of-bound and malformed fields', () => {
    const languages = Array.from({ length: MAX_TARGET_LANGUAGES + 1 }, () => 'pt')

    expect(translateBodySchema.safeParse({ text: '', targetLanguages: ['pt'] }).success).toBe(false)
    expect(
      translateBodySchema.safeParse({
        text: 'x'.repeat(MAX_TEXT_LENGTH + 1),
        targetLanguages: ['pt'],
      }).success,
    ).toBe(false)
    expect(translateBodySchema.safeParse({ text: 'Hi', targetLanguages: [] }).success).toBe(false)
    expect(translateBodySchema.safeParse({ text: 'Hi', targetLanguages: languages }).success).toBe(
      false,
    )
    expect(
      translateBodySchema.safeParse({ text: 'Hi', targetLanguages: ['portuguese'] }).success,
    ).toBe(false)
    expect(
      translateBodySchema.safeParse({ text: 'Hi', targetLanguages: ['pt'], model: 'gpt-4o' })
        .success,
    ).toBe(false)
    expect(
      translateBodySchema.safeParse({
        text: 'Hi',
        targetLanguages: ['pt'],
        resourceId: 'has spaces',
      }).success,
    ).toBe(false)
  })

  /**
   * Regional language codes.
   *
   * The language field accepts `pt-BR`-style codes alongside bare codes.
   */
  it('accepts regional language codes', () => {
    const body = translateBodySchema.parse({
      text: 'Hi',
      sourceLanguage: 'en',
      targetLanguages: ['pt-BR'],
    })

    expect(body.targetLanguages).toEqual(['pt-BR'])
  })
})

describe('summarize body', () => {
  /**
   * Style and budget validation.
   *
   * Known styles and in-range budgets parse; unknown styles and
   * out-of-range budgets reject.
   */
  it('validates style and word budget', () => {
    expect(summarizeBodySchema.parse({ text: 'Hi', style: 'tldr', maxLength: 5 }).style).toBe(
      'tldr',
    )
    expect(summarizeBodySchema.safeParse({ text: 'Hi', style: 'haiku' }).success).toBe(false)
    expect(summarizeBodySchema.safeParse({ text: 'Hi', maxLength: 0 }).success).toBe(false)
    expect(summarizeBodySchema.safeParse({ text: 'Hi', maxLength: 201 }).success).toBe(false)
  })
})

describe('rewrite body', () => {
  /**
   * Optional style/language validation.
   *
   * Bounded style strings and language codes parse; oversized styles
   * reject.
   */
  it('validates the optional style and language', () => {
    expect(rewriteBodySchema.parse({ text: 'Hi', style: 'formal', language: 'pt' }).style).toBe(
      'formal',
    )
    expect(rewriteBodySchema.safeParse({ text: 'Hi', style: 'x'.repeat(65) }).success).toBe(false)
    expect(rewriteBodySchema.safeParse({ text: 'Hi', language: 'PT' }).success).toBe(false)
  })
})

describe('analyze body', () => {
  /**
   * Server-pinned schema.
   *
   * The body carries only text plus shared fields; an injected output
   * schema is STRIPPED (Zod object semantics), so the server-side fixed
   * schema can never be overridden from the client.
   */
  it('parses text and strips an injected output schema', () => {
    expect(analyzeBodySchema.parse({ text: 'Hi' }).resourceId).toBe(DEFAULT_RESOURCE_ID)
    const parsed = analyzeBodySchema.parse({ text: 'Hi', outputSchema: { a: 1 } })
    expect('outputSchema' in parsed).toBe(false)
  })
})

describe('custom body', () => {
  /**
   * Escape-hatch fields and defaults.
   *
   * responseFormat defaults to text; temperature and maxTokens are
   * accepted within their OpenAI-compatible ranges (and ignored by the
   * deterministic mock).
   */
  it('applies defaults and validates the SDK-fidelity knobs', () => {
    const body = customBodySchema.parse({ userPrompt: 'Hi', temperature: 0.5, maxTokens: 100 })

    expect(body.responseFormat).toBe('text')
    expect(customBodySchema.safeParse({ userPrompt: 'Hi', temperature: 3 }).success).toBe(false)
    expect(customBodySchema.safeParse({ userPrompt: 'Hi', maxTokens: 0 }).success).toBe(false)
    expect(customBodySchema.safeParse({ systemPrompt: 'sys' }).success).toBe(false)
  })
})
