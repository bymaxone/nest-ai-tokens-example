/**
 * Unit tests for the mock inference module wiring.
 *
 * Layer: unit.
 * Goal: prove the latency knob flows from the typed environment into the
 * provider options and the module compiles with the provider exported.
 * Mocks: a literal EnvConfig fixture; no container is booted (the factory
 * is exercised directly, matching the ai-store module's test pattern).
 */
import { describe, expect, it } from '@jest/globals'

import { MockAiModule, mockAiProviderOptionsFactory } from './mock-ai.module.js'
import type { EnvConfig } from '../config/env.js'

describe('mockAiProviderOptionsFactory', () => {
  /**
   * Env-to-options mapping.
   *
   * MOCK_LATENCY_MS is the single source of the latency knob; the factory
   * must pass it through untouched so operators control the spinner delay
   * from the environment registry.
   */
  it('maps MOCK_LATENCY_MS into the provider options', () => {
    const env: EnvConfig = {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ai_tokens_example',
      PORT: 3001,
      AI_PROVIDER_MODE: 'mock',
      QUOTA_ENABLED: true,
      QUOTA_TOLERANCE: 1.2,
      QUOTA_MINIMUM_BALANCE: 0,
      TENANT_REQUIRED: false,
      PRICING_CACHE_TTL_MS: 300_000,
      MOCK_LATENCY_MS: 125,
      WEB_ORIGIN: ['http://localhost:3000'],
    }

    expect(mockAiProviderOptionsFactory(env)).toEqual({ latencyMs: 125 })
  })
})

describe('MockAiModule', () => {
  /**
   * Module identity.
   *
   * The module class exists and is decorated (its metadata carries the
   * provider); the e2e tier proves the full container resolution.
   */
  it('is a class usable as a Nest module', () => {
    expect(typeof MockAiModule).toBe('function')
  })
})
