/**
 * Unit tests for the deterministic content synthesis.
 *
 * Layer: unit.
 * Goal: prove every canned transform is a pure function of the input (the
 * workspace responses are assertable byte for byte), the directive parser
 * accepts exactly the protocol shapes, and non-directive input falls back
 * to the echo transform.
 * Mocks: none; everything here is pure.
 */
import { describe, expect, it } from '@jest/globals'

import {
  DEFAULT_SUMMARY_WORDS,
  MOCK_SENTIMENTS,
  analyzeContent,
  analyzeText,
  echoContent,
  normalizeText,
  parseDirective,
  rewriteContent,
  summarizeContent,
  synthesizeChatContent,
  translateContent,
  translationFor,
} from './mock-content.js'

describe('normalizeText', () => {
  /**
   * Whitespace normalization.
   *
   * Runs of spaces, tabs, and newlines collapse to single spaces and the
   * edges are trimmed, so content never depends on incidental formatting.
   */
  it('collapses whitespace runs and trims the edges', () => {
    expect(normalizeText('  Hello \t\n  world  ')).toBe('Hello world')
  })
})

describe('parseDirective', () => {
  /**
   * Directive acceptance.
   *
   * A well-formed translate directive parses into its typed shape so the
   * synthesis switch can dispatch on `task`.
   */
  it('parses a valid translate directive', () => {
    const directive = parseDirective(
      JSON.stringify({ task: 'translate', text: 'Hi', targetLanguages: ['pt'] }),
    )

    expect(directive).toEqual({ task: 'translate', text: 'Hi', targetLanguages: ['pt'] })
  })

  /**
   * Non-JSON fallback.
   *
   * Plain text is not a directive; the parser must return undefined so the
   * echo transform takes over instead of throwing.
   */
  it('returns undefined for non-JSON content', () => {
    expect(parseDirective('just some text')).toBeUndefined()
  })

  /**
   * Schema rejection.
   *
   * Valid JSON that is not a protocol shape (unknown task, missing fields)
   * must also fall back to undefined, keeping the mock lenient and
   * deterministic for arbitrary user prompts.
   */
  it('returns undefined for JSON that is not a directive', () => {
    expect(parseDirective(JSON.stringify({ task: 'paint', text: 'x' }))).toBeUndefined()
    expect(parseDirective(JSON.stringify({ task: 'translate', text: 'x' }))).toBeUndefined()
  })
})

describe('translateContent', () => {
  /**
   * Per-language tagged translations.
   *
   * Each requested language gets the language tag plus the uppercased
   * source text, in request order, as parseable JSON — the canned shape
   * the translate command asserts.
   */
  it('renders one tagged uppercase translation per language', () => {
    const content = translateContent({ text: 'Hello  world', targetLanguages: ['pt', 'es'] })

    expect(JSON.parse(content)).toEqual({
      translations: { pt: '[pt] HELLO WORLD', es: '[es] HELLO WORLD' },
    })
    expect(translationFor('fr', 'Hi')).toBe('[fr] HI')
  })
})

describe('analyzeText', () => {
  /**
   * Deterministic sentiment derivation.
   *
   * The sentiment is the char-code sum modulo three, remainders mapping to
   * negative/neutral/positive in order. Single-char inputs pin all three
   * classes: 'a' (97 % 3 = 1, neutral), 'b' (98 % 3 = 2, positive),
   * 'c' (99 % 3 = 0, negative).
   */
  it('derives each sentiment class from the char-code sum', () => {
    expect(analyzeText('a').sentiment).toBe('neutral')
    expect(analyzeText('b').sentiment).toBe('positive')
    expect(analyzeText('c').sentiment).toBe('negative')
    expect(MOCK_SENTIMENTS).toEqual(['negative', 'neutral', 'positive'])
  })

  /**
   * Entity extraction.
   *
   * Capitalized words are the entities: unique, in first-appearance order,
   * capped at five, and empty when the text has none.
   */
  it('extracts unique capitalized words capped at five', () => {
    const analysis = analyzeText('Alice met Bob and Alice met Carol Dave Erin Frank')

    expect(analysis.entities).toEqual(['Alice', 'Bob', 'Carol', 'Dave', 'Erin'])
    expect(analyzeText('no capitals here').entities).toEqual([])
  })

  /**
   * JSON rendering.
   *
   * The analyze directive renders the fixed schema as parseable JSON — the
   * exact shape the analyze command types its response with.
   */
  it('renders the fixed sentiment/entities JSON', () => {
    expect(JSON.parse(analyzeContent({ text: 'Alice says hi' }))).toEqual({
      sentiment: analyzeText('Alice says hi').sentiment,
      entities: ['Alice'],
    })
  })
})

describe('summarizeContent', () => {
  /**
   * First-N-words summary with the default budget.
   *
   * Without maxWords the summary keeps the default word budget and marks
   * the truncation with a trailing ellipsis.
   */
  it('keeps the default word budget and marks truncation', () => {
    const words = Array.from({ length: DEFAULT_SUMMARY_WORDS + 3 }, (_, i) => `w${i}`)
    const expected = words.slice(0, DEFAULT_SUMMARY_WORDS).join(' ')

    expect(summarizeContent({ text: words.join(' ') })).toBe(`[summary:paragraph] ${expected} ...`)
  })

  /**
   * Style shaping.
   *
   * Each style has a distinct, assertable rendering: tldr gets the TL;DR
   * prefix, bullet gets the dash, paragraph is bare; a text within budget
   * has no ellipsis.
   */
  it('shapes each style distinctly and skips the ellipsis within budget', () => {
    expect(summarizeContent({ text: 'one two three', style: 'tldr', maxWords: 5 })).toBe(
      '[summary:tldr] TL;DR: one two three',
    )
    expect(summarizeContent({ text: 'one two three', style: 'bullet', maxWords: 2 })).toBe(
      '[summary:bullet] - one two ...',
    )
    expect(summarizeContent({ text: 'one two', style: 'paragraph', maxWords: 2 })).toBe(
      '[summary:paragraph] one two',
    )
  })
})

describe('rewriteContent', () => {
  /**
   * Tagged rewrite.
   *
   * The rewrite is the normalized text under a style tag; the language tag
   * joins only when requested; the style defaults to neutral.
   */
  it('tags the rewrite with style and optional language', () => {
    expect(rewriteContent({ text: ' Hi  there ' })).toBe('[rewrite:neutral] Hi there')
    expect(rewriteContent({ text: 'Hi', style: 'formal', language: 'pt' })).toBe(
      '[rewrite:formal:pt] Hi',
    )
  })
})

describe('echoContent', () => {
  /**
   * Echo transforms.
   *
   * JSON mode echoes a parseable object naming the model; text mode tags
   * the normalized text with the model — the custom command's canned
   * answer for arbitrary prompts.
   */
  it('echoes JSON in json mode and a tagged line in text mode', () => {
    expect(JSON.parse(echoContent('mock-chat-pro', ' Hi  you ', 'json_object'))).toEqual({
      echo: 'Hi you',
      model: 'mock-chat-pro',
    })
    expect(echoContent('mock-chat-lite', 'Hi', 'text')).toBe('[mock:mock-chat-lite] Hi')
  })
})

describe('synthesizeChatContent', () => {
  /**
   * Directive dispatch.
   *
   * Each directive task routes to its transform; a non-directive message
   * routes to the echo transform — one assertion per switch arm.
   */
  it('dispatches every directive task and falls back to echo', () => {
    const translate = JSON.stringify({ task: 'translate', text: 'Hi', targetLanguages: ['pt'] })
    const analyze = JSON.stringify({ task: 'analyze', text: 'Alice' })
    const summarize = JSON.stringify({ task: 'summarize', text: 'one two', maxWords: 2 })
    const rewrite = JSON.stringify({ task: 'rewrite', text: 'Hi' })

    expect(JSON.parse(synthesizeChatContent('m', translate, 'json_object'))).toEqual({
      translations: { pt: '[pt] HI' },
    })
    expect(JSON.parse(synthesizeChatContent('m', analyze, 'json_object'))).toEqual(
      JSON.parse(analyzeContent({ text: 'Alice' })),
    )
    expect(synthesizeChatContent('m', summarize, 'text')).toBe('[summary:paragraph] one two')
    expect(synthesizeChatContent('m', rewrite, 'text')).toBe('[rewrite:neutral] Hi')
    expect(synthesizeChatContent('m', 'plain', 'text')).toBe('[mock:m] plain')
  })

  /**
   * Determinism invariant.
   *
   * The same input must synthesize byte-identical content across calls —
   * the property every ledger and cost assertion builds on.
   */
  it('produces identical content for identical input', () => {
    const directive = JSON.stringify({ task: 'analyze', text: 'Some Text Here' })

    expect(synthesizeChatContent('m', directive, 'json_object')).toBe(
      synthesizeChatContent('m', directive, 'json_object'),
    )
  })
})
