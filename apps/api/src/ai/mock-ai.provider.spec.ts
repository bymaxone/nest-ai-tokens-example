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

import {
  MOCK_EMBEDDING_DIMENSIONS,
  MockAiProvider,
  charCodeHash,
  lastUserContent,
  responseIdFor,
  tokensForChars,
  unitVectorFor,
} from './mock-ai.provider.js'
import type { MockChatRequest } from './mock-ai.types.js'

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
   * Determinism and id stability (rule-of-phase 1).
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
   * With latencyMs 50 the response resolves only after the timer fires —
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
   * scheduled — tests and CI stay instantaneous.
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
