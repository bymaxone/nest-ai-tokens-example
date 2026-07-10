/**
 * Unit tests for the quota-lab run body DTO.
 *
 * Layer: unit.
 * Goal: prove the defaults (cheap model, canned probe prompt), the model
 * whitelist, and the prompt bounds.
 * Mocks: none (schema only).
 */
import { describe, expect, it } from '@jest/globals'

import { DEFAULT_LAB_PROMPT, MAX_LAB_PROMPT_LENGTH, labRunBodySchema } from './lab-run.body.js'

describe('labRunBodySchema', () => {
  /**
   * Default shape.
   *
   * An empty body parses to the cheap model and the canned probe prompt,
   * so the constant/model-based contrast is visible with zero input.
   */
  it('defaults to the cheap model and the probe prompt', () => {
    expect(labRunBodySchema.parse({})).toEqual({
      model: 'mock-chat-lite',
      prompt: DEFAULT_LAB_PROMPT,
    })
  })

  /**
   * Model whitelist.
   *
   * Only the two mock chat models are runnable; anything else is a 400
   * before any service code runs.
   */
  it('accepts only the mock chat models', () => {
    expect(labRunBodySchema.parse({ model: 'mock-chat-pro' }).model).toBe('mock-chat-pro')
    expect(labRunBodySchema.safeParse({ model: 'gpt-4o' }).success).toBe(false)
  })

  /**
   * Prompt bounds.
   *
   * The lab is a probe, not a document pipe: empty prompts and prompts
   * beyond the cap are rejected.
   */
  it('bounds the prompt length', () => {
    expect(labRunBodySchema.safeParse({ prompt: '' }).success).toBe(false)
    expect(
      labRunBodySchema.safeParse({ prompt: 'x'.repeat(MAX_LAB_PROMPT_LENGTH + 1) }).success,
    ).toBe(false)
  })
})
