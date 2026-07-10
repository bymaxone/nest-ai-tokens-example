/**
 * Unit tests for the deterministic mock inference provider.
 *
 * Layer: unit.
 * Goal: prove the spec-pinned token math with fixed fixtures (exact
 * counts, never recomputed with the production formula), vector
 * determinism and unit length, response-id stability, and the latency
 * knob's both branches.
 * Mocks: fake timers for the latency branch; everything else is pure.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals'

import { FAILURE_MARKERS } from './failure-markers.js'
import {
  MOCK_EMBEDDING_DIMENSIONS,
  MockAiProvider,
  applyDegrade,
  charCodeHash,
  cleanChatMessages,
  dropLastTranslation,
  lastUserContent,
  responseIdFor,
  tokensForChars,
  unitVectorFor,
} from './mock-ai.provider.js'
import type { MockChatRequest } from './mock-ai.types.js'
import { ApiException } from '../common/api-exception.js'

/** A zero-latency provider (the configuration every test tier uses). */
function provider(latencyMs?: number): MockAiProvider {
  return new MockAiProvider(latencyMs === undefined ? {} : { latencyMs })
}

afterEach(() => {
  jest.useRealTimers()
})

describe('tokensForChars', () => {
  /**
   * Pinned char-to-token math.
   *
   * Four characters per token, rounded up: the exact fixture values the
   * spec pins (0 chars is 0 tokens; partial groups round up).
   */
  it('divides by four and rounds up', () => {
    expect(tokensForChars(0)).toBe(0)
    expect(tokensForChars(1)).toBe(1)
    expect(tokensForChars(4)).toBe(1)
    expect(tokensForChars(5)).toBe(2)
  })
})

describe('chatCompletion', () => {
  const request: MockChatRequest = {
    model: 'mock-chat-pro',
    messages: [{ role: 'user', content: 'abcd' }],
  }

  /**
   * Exact token counts for a fixed fixture.
   *
   * 4 prompt chars -> 1 prompt token; the echo content
   * '[mock:mock-chat-pro] abcd' is 25 chars -> 7 completion tokens;
   * total 8. Literal numbers on purpose: recomputing with the production
   * formula would prove nothing.
   */
  it('computes the pinned token counts for a fixed request', async () => {
    const response = await provider().chatCompletion(request)

    expect(response.choices[0].message.content).toBe('[mock:mock-chat-pro] abcd')
    expect(response.usage).toEqual({ prompt_tokens: 1, completion_tokens: 7, total_tokens: 8 })
    expect(response.choices[0].finish_reason).toBe('stop')
    expect(response.model).toBe('mock-chat-pro')
  })

  /**
   * Prompt tokens sum over EVERY message.
   *
   * System and user messages both count: 8 + 4 = 12 chars -> 3 prompt
   * tokens, proving the math reads the whole conversation.
   */
  it('sums prompt chars across all messages', async () => {
    const response = await provider().chatCompletion({
      model: 'mock-chat-lite',
      messages: [
        { role: 'system', content: '12345678' },
        { role: 'user', content: 'abcd' },
      ],
    })

    expect(response.usage.prompt_tokens).toBe(3)
  })

  /**
   * Determinism and id stability (the determinism invariant).
   *
   * Equal requests produce byte-identical responses, including the
   * SHA-256-derived id; a different request gets a different id.
   */
  it('returns identical responses (and ids) for identical requests', async () => {
    const first = await provider().chatCompletion(request)
    const second = await provider().chatCompletion(request)
    const other = await provider().chatCompletion({ ...request, model: 'mock-chat-lite' })

    expect(second).toEqual(first)
    expect(first.id).toMatch(/^mock-[0-9a-f]{40}$/)
    expect(other.id).not.toBe(first.id)
  })

  /**
   * JSON mode parseability.
   *
   * A json_object request without a directive yields the parseable echo
   * object built from the request.
   */
  it('produces parseable JSON in json_object mode', async () => {
    const response = await provider().chatCompletion({
      model: 'mock-chat-pro',
      messages: [{ role: 'user', content: 'ping' }],
      responseFormat: 'json_object',
    })

    expect(JSON.parse(response.choices[0].message.content)).toEqual({
      echo: 'ping',
      model: 'mock-chat-pro',
    })
  })
})

describe('embed', () => {
  /**
   * Single-input embedding with pinned usage.
   *
   * 'abcdefgh' is 8 chars -> 2 prompt tokens, one 8-dimension vector, and
   * embeddings never produce completion tokens.
   */
  it('embeds a single text with pinned prompt-token usage', async () => {
    const response = await provider().embed({ model: 'mock-embed', input: 'abcdefgh' })

    expect(response.data).toHaveLength(1)
    expect(response.data[0]?.embedding).toHaveLength(MOCK_EMBEDDING_DIMENSIONS)
    expect(response.usage).toEqual({ prompt_tokens: 2, total_tokens: 2 })
  })

  /**
   * Batch embedding aggregates usage (contract 1 groundwork).
   *
   * A 3-text batch returns one vector per input in order and ONE usage
   * block covering all inputs: 3 + 3 + 6 = 12 chars -> 3 prompt tokens.
   */
  it('embeds a batch with one aggregate usage block', async () => {
    const response = await provider().embed({
      model: 'mock-embed',
      input: ['abc', 'def', 'ghijkl'],
    })

    expect(response.data.map((entry) => entry.index)).toEqual([0, 1, 2])
    expect(response.usage).toEqual({ prompt_tokens: 3, total_tokens: 3 })
  })

  /**
   * Vector determinism and unit length.
   *
   * The same text always embeds to the same vector; different texts
   * differ; every vector has norm 1 (within float tolerance).
   */
  it('produces deterministic unit vectors', () => {
    const first = unitVectorFor('same text')
    const second = unitVectorFor('same text')
    const other = unitVectorFor('other text')
    const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0))

    expect(second).toEqual(first)
    expect(other).not.toEqual(first)
    expect(norm).toBeCloseTo(1, 12)
  })

  /**
   * Hash spread.
   *
   * The per-dimension seed diversifies the hash so a vector is not eight
   * copies of one value; the hash itself is stable for equal input.
   */
  it('diversifies dimensions through the seeded hash', () => {
    expect(charCodeHash('text', 0)).toBe(charCodeHash('text', 0))
    expect(charCodeHash('text', 1)).not.toBe(charCodeHash('text', 0))
    expect(new Set(unitVectorFor('text')).size).toBeGreaterThan(1)
  })
})

describe('latency knob', () => {
  /**
   * Positive latency delays the response.
   *
   * With latencyMs 50 the response resolves only after the timer fires -
   * the dashboard-spinner knob works and stays off the zero path.
   */
  it('waits latencyMs before answering when configured', async () => {
    jest.useFakeTimers()
    const pending = provider(50).chatCompletion({
      model: 'mock-chat-pro',
      messages: [{ role: 'user', content: 'hi' }],
    })
    let resolved = false
    void pending.then(() => {
      resolved = true
    })

    await jest.advanceTimersByTimeAsync(49)
    expect(resolved).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    await pending
    expect(resolved).toBe(true)
  })

  /**
   * Zero latency never touches a timer.
   *
   * With the default knob the response resolves without any timer being
   * scheduled: tests and CI stay instantaneous.
   */
  it('skips the timer entirely at zero latency', async () => {
    jest.useFakeTimers()
    const response = await provider().embed({ model: 'mock-embed', input: 'x' })

    expect(jest.getTimerCount()).toBe(0)
    expect(response.data).toHaveLength(1)
  })
})

describe('lastUserContent', () => {
  /**
   * Last-user selection.
   *
   * The synthesis input is the LAST user message (not the last message);
   * a conversation without user turns yields the empty string.
   */
  it('picks the last user message and defaults to empty', () => {
    expect(
      lastUserContent({
        model: 'm',
        messages: [
          { role: 'user', content: 'first' },
          { role: 'user', content: 'second' },
          { role: 'assistant', content: 'reply' },
        ],
      }),
    ).toBe('second')
    expect(lastUserContent({ model: 'm', messages: [{ role: 'system', content: 's' }] })).toBe('')
  })
})

describe('failure injection', () => {
  const throwCases = Object.entries(FAILURE_MARKERS).flatMap(([token, behavior]) =>
    behavior.kind === 'throw' ? [[token, behavior.code, behavior.httpStatus] as const] : [],
  )

  /**
   * Table-driven throw markers (chat).
   *
   * Every throw-kind marker anywhere in the conversation must raise the
   * app-owned provider error with its documented code and HTTP status,
   * BEFORE any usage exists.
   */
  it.each(throwCases)('chat with %s throws %s (%i)', async (token, code, status) => {
    expect.assertions(3)
    try {
      await provider().chatCompletion({
        model: 'mock-chat-pro',
        messages: [{ role: 'user', content: `hello ${token}` }],
      })
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException)
      expect((error as ApiException).code).toBe(code)
      expect((error as ApiException).getStatus()).toBe(status)
    }
  })

  /**
   * Throw markers reach embeddings too.
   *
   * A throw marker inside any batch input aborts the whole embed call
   * with the same documented error.
   */
  it('embed input with a throw marker throws the documented error', async () => {
    await expect(
      provider().embed({ model: 'mock-embed', input: ['ok', 'x @@fail:rate_limited@@'] }),
    ).rejects.toMatchObject({ code: 'provider.rate_limited' })
  })

  /**
   * Marker stripping keeps token math stable (spec §12).
   *
   * The marked prompt must count exactly the tokens of its unmarked twin:
   * marker characters never reach the char math.
   */
  it('strips the marker from prompt-token math', async () => {
    const unmarked = await provider().chatCompletion({
      model: 'mock-chat-pro',
      messages: [{ role: 'user', content: 'abcd' }],
    })
    const marked = await provider().chatCompletion({
      model: 'mock-chat-pro',
      messages: [{ role: 'user', content: 'abcd@@fail:truncate@@' }],
    })

    expect(marked.usage.prompt_tokens).toBe(unmarked.usage.prompt_tokens)
  })

  /**
   * Truncation degrade (contract 5 groundwork).
   *
   * The content is cut to its first half (rounded up), the finish reason
   * flips to 'length', and the usage reflects the TRUNCATED content: a
   * real-but-cut response that still debits downstream.
   */
  it('truncate returns half the content with finish_reason length', async () => {
    const full = await provider().chatCompletion({
      model: 'mock-chat-pro',
      messages: [{ role: 'user', content: 'abcd' }],
    })
    const truncated = await provider().chatCompletion({
      model: 'mock-chat-pro',
      messages: [{ role: 'user', content: 'abcd@@fail:truncate@@' }],
    })
    const fullContent = full.choices[0].message.content
    const expected = fullContent.slice(0, Math.ceil(fullContent.length / 2))

    expect(truncated.choices[0].message.content).toBe(expected)
    expect(truncated.choices[0].finish_reason).toBe('length')
    expect(truncated.usage.completion_tokens).toBe(tokensForChars(expected.length))
  })

  /**
   * Bad-JSON degrade (contract 5 groundwork).
   *
   * The content becomes a deterministic unparseable fragment while the
   * usage stays valid: downstream must reject WITHOUT debiting.
   */
  it('bad_json returns unparseable content with valid usage', async () => {
    const response = await provider().chatCompletion({
      model: 'mock-chat-pro',
      messages: [{ role: 'user', content: 'analyze this @@fail:bad_json@@' }],
      responseFormat: 'json_object',
    })
    const content = response.choices[0].message.content

    expect(content).toBe('not-json{')
    expect(() => {
      JSON.parse(content)
    }).toThrow()
    expect(response.usage.completion_tokens).toBe(tokensForChars(content.length))
    expect(response.choices[0].finish_reason).toBe('stop')
  })

  /**
   * Partial-translations degrade.
   *
   * A translate directive answered under the marker loses its LAST
   * requested language, so the command layer can surface
   * command.missing_translations deterministically.
   */
  it('partial_translations drops the last requested language', async () => {
    const directive = JSON.stringify({
      task: 'translate',
      text: 'Hi @@fail:partial_translations@@',
      targetLanguages: ['pt', 'es'],
    })
    const response = await provider().chatCompletion({
      model: 'mock-chat-pro',
      messages: [{ role: 'user', content: directive }],
      responseFormat: 'json_object',
    })

    expect(JSON.parse(response.choices[0].message.content)).toEqual({
      translations: { pt: '[pt] HI' },
    })
  })

  /**
   * Degrade markers are chat-only for embeddings.
   *
   * An embedding input carrying a degrade marker embeds its CLEANED text
   * (identical vector and token math to the unmarked input) instead of
   * failing or degrading.
   */
  it('embed strips degrade markers and proceeds', async () => {
    const response = await provider().embed({
      model: 'mock-embed',
      input: 'abc@@fail:truncate@@',
    })

    expect(response.data[0]?.embedding).toEqual(unitVectorFor('abc'))
    expect(response.usage.prompt_tokens).toBe(1)
  })
})

describe('marker helpers', () => {
  /**
   * First-marker precedence across messages.
   *
   * When several messages carry markers, the FIRST in message order
   * decides the behavior; every message still gets its own stripping.
   */
  it('cleanChatMessages picks the first marker in message order', () => {
    const { messages, marker } = cleanChatMessages([
      { role: 'system', content: 'sys @@fail:timeout@@' },
      { role: 'user', content: 'user @@fail:rate_limited@@' },
    ])

    expect(marker?.token).toBe('@@fail:timeout@@')
    expect(messages.map((m) => m.content)).toEqual(['sys ', 'user '])
  })

  /**
   * Degrade passthrough without a mode.
   *
   * Marker-free calls flow through applyDegrade untouched with the
   * normal finish reason.
   */
  it('applyDegrade passes content through when no mode is set', () => {
    expect(applyDegrade('abc', undefined)).toEqual({ content: 'abc', finishReason: 'stop' })
  })

  /**
   * Partial-translation edge shapes.
   *
   * Non-JSON and non-translation JSON pass through unchanged: the degrade
   * only rewrites the canonical translations payload.
   */
  it('dropLastTranslation leaves non-translation content untouched', () => {
    expect(dropLastTranslation('[mock:m] plain')).toBe('[mock:m] plain')
    expect(dropLastTranslation('{"echo":"x"}')).toBe('{"echo":"x"}')
    expect(dropLastTranslation('{"translations":{"pt":"[pt] A","es":"[es] A"}}')).toBe(
      '{"translations":{"pt":"[pt] A"}}',
    )
  })
})

describe('responseIdFor', () => {
  /**
   * Canonical fingerprint.
   *
   * Equal payloads share the id; distinct payloads do not; the shape is
   * the documented `mock-<40 hex>` prefix.
   */
  it('fingerprints payloads deterministically', () => {
    expect(responseIdFor({ a: 1 })).toBe(responseIdFor({ a: 1 }))
    expect(responseIdFor({ a: 1 })).not.toBe(responseIdFor({ a: 2 }))
    expect(responseIdFor({ a: 1 })).toMatch(/^mock-[0-9a-f]{40}$/)
  })
})
