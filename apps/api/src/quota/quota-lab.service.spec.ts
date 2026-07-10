/**
 * Unit tests for the quota lab service.
 *
 * Layer: unit.
 * Goal: prove the model-based estimator branches on the model (5000 vs
 * 1000 tokens), the programmatic run reserves the UNSCALED estimate and
 * settles it into the summary shape, the constant handler produces the
 * raw response for the declarative interceptor path, the meter extract
 * helper is the identity, and a hold shortfall propagates untouched.
 * Mocks: the library MeteringService (hold/capture/release double). The
 * provider is the REAL zero-latency MockAiProvider.
 */
import { describe, expect, it } from '@jest/globals'

import { labRunBodySchema } from './dto/lab-run.body.js'
import {
  LAB_CONSTANT_ESTIMATE,
  LAB_CONSTANT_TOKENS,
  LAB_FEATURES,
  LAB_LITE_TOKENS,
  LAB_PRO_TOKENS,
  QuotaLabService,
  extractLabUsage,
  labEstimateTokens,
} from './quota-lab.service.js'
import { MockAiProvider } from '../ai/mock-ai.provider.js'
import { MOCK_CHAT_PRESET } from '../ai/mock-usage.presets.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import { meteringWith } from '../../test/fixtures/metering.fixture.js'
import { recordWith } from '../../test/fixtures/usage-record.fixture.js'

const ada: DemoIdentity = { id: 'ada', tenantId: 'acme' }

/** The service under test with a real provider and a metering double. */
function serviceWith(record = recordWith({ id: 'txn-lab' })) {
  const double = meteringWith(record)
  const service = new QuotaLabService(new MockAiProvider({}), double.metering)
  return { service, ...double }
}

describe('labEstimateTokens', () => {
  /**
   * Estimator branches.
   *
   * The flagship model reserves 5000 tokens, everything else 1000: the
   * documented model-based variant, pure and synchronous.
   */
  it('assigns 5000 tokens to the flagship and 1000 to the cheap model', () => {
    expect(labEstimateTokens('mock-chat-pro')).toBe(LAB_PRO_TOKENS)
    expect(labEstimateTokens('mock-chat-lite')).toBe(LAB_LITE_TOKENS)
  })
})

describe('LAB_CONSTANT_ESTIMATE', () => {
  /**
   * Static-estimate shape.
   *
   * The declarative route's estimate is a flat 1000-token reservation on
   * the cheap model, independent of the body: exactly what
   * `@RequireBudget({ estimate })` supports.
   */
  it('is a flat 1000-token rated estimate', () => {
    expect(LAB_CONSTANT_ESTIMATE).toEqual({
      provider: 'mock',
      model: 'mock-chat-lite',
      operation: 'chat',
      inputTokens: LAB_CONSTANT_TOKENS,
      maxOutputTokens: 0,
    })
  })
})

describe('extractLabUsage', () => {
  /**
   * Identity extractor.
   *
   * The mock preset normalizer needs the WHOLE OpenAI-shaped response, so
   * the `@Meter` extract must hand it over untouched (the default would
   * read only `result.usage`).
   */
  it('returns the handler result untouched', () => {
    const result = { usage: { prompt_tokens: 1 }, model: 'mock-chat-lite' }

    expect(extractLabUsage(result)).toBe(result)
  })
})

describe('completeConstant', () => {
  /**
   * Declarative-path handler body.
   *
   * The handler only produces the deterministic response; no hold or
   * capture happens here (the guard and interceptor own the lifecycle).
   */
  it('returns the raw mock response without touching metering', async () => {
    const { service, holdFn, captureFn } = serviceWith()
    const body = labRunBodySchema.parse({ prompt: 'ping' })

    const response = await service.completeConstant(body)

    expect(response.choices[0].message.content).toBe('[mock:mock-chat-lite] ping')
    expect(holdFn).not.toHaveBeenCalled()
    expect(captureFn).not.toHaveBeenCalled()
  })
})

describe('runModelBased', () => {
  /**
   * Flagship branch: the hold carries the 5000-token estimate.
   *
   * The reservation is UNSCALED (no tolerance: the lab shows the raw
   * variant) and the settled record maps into the summary shape with
   * bigint money as a decimal string.
   */
  it('reserves 5000 tokens for the flagship model and settles the summary', async () => {
    const record = recordWith({
      id: 'txn-pro',
      model: 'mock-chat-pro',
      totalTokens: 42,
      billedCostNanoUsd: 123_456n,
    })
    const { service, holdFn, captureFn, hold } = serviceWith(record)
    const body = labRunBodySchema.parse({ model: 'mock-chat-pro', prompt: 'branch me' })

    const result = await service.runModelBased(ada, body)

    expect(holdFn).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'acme', feature: LAB_FEATURES.modelBased }),
      {
        provider: 'mock',
        model: 'mock-chat-pro',
        operation: 'chat',
        inputTokens: LAB_PRO_TOKENS,
        maxOutputTokens: 0,
      },
    )
    expect(captureFn).toHaveBeenCalledWith(
      hold,
      expect.objectContaining({ model: 'mock-chat-pro' }),
      MOCK_CHAT_PRESET,
    )
    expect(result).toEqual({
      model: 'mock-chat-pro',
      content: '[mock:mock-chat-pro] branch me',
      transactionId: 'txn-pro',
      billedNanoUsd: '123456',
      totalTokens: 42,
    })
  })

  /**
   * Cheap branch: the hold carries the 1000-token estimate.
   *
   * The default model exercises the other estimator branch.
   */
  it('reserves 1000 tokens for the cheap model', async () => {
    const { service, holdFn } = serviceWith()
    const body = labRunBodySchema.parse({})

    await service.runModelBased(ada, body)

    expect(holdFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ model: 'mock-chat-lite', inputTokens: LAB_LITE_TOKENS }),
    )
  })

  /**
   * Shortfall propagation.
   *
   * A hold rejection (the budget/wallet verdict) propagates untouched and
   * the provider never runs: the lab is enforced exactly like production.
   */
  it('propagates a hold shortfall untouched', async () => {
    const { service, holdFn, captureFn } = serviceWith()
    const blocked = new Error('AI_TOKENS_BUDGET_EXCEEDED')
    holdFn.mockRejectedValueOnce(blocked)

    await expect(service.runModelBased(ada, labRunBodySchema.parse({}))).rejects.toBe(blocked)
    expect(captureFn).not.toHaveBeenCalled()
  })
})
