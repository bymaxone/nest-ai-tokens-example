/**
 * Unit tests for the workspace embedding service.
 *
 * Layer: unit.
 * Goal: prove the single embed reserves one tolerance-scaled hold and
 * settles one row with the resource tag, the batch embed reserves ONE
 * hold sized by the summed estimate and settles ONE aggregate row tagged
 * with the batch size (the shape that enforces contract 1), vectors
 * return in input order, provider failures release the hold, and the
 * first-vector guard is loud on a contract breach.
 * Mocks: the library MeteringService (hold/capture/release double). The
 * provider is the REAL zero-latency MockAiProvider.
 */
import { describe, expect, it } from '@jest/globals'
import type { UsageRecord } from '@bymax-one/nest-ai-tokens'

import { embedBatchBodySchema } from './dto/embed-batch.body.js'
import { embedBodySchema } from './dto/embed.body.js'
import { PROVIDER_FAILURE_REASON } from '../ai/metered-call.js'
import {
  EMBEDDING_FEATURES,
  WorkspaceEmbeddingService,
  firstVectorOf,
} from './workspace-embedding.service.js'
import { MockAiProvider, unitVectorFor } from '../ai/mock-ai.provider.js'
import { MOCK_EMBEDDING_PRESET } from '../ai/mock-usage.presets.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import { envWith, meteringWith } from '../../test/fixtures/metering.fixture.js'
import { recordWith } from '../../test/fixtures/usage-record.fixture.js'

const ada: DemoIdentity = { id: 'ada', tenantId: 'acme' }

/** The service under test with a real provider and a metering double. */
function serviceWith(record: UsageRecord = recordWith({ id: 'txn-e' })) {
  const double = meteringWith(record)
  const service = new WorkspaceEmbeddingService(new MockAiProvider({}), double.metering, envWith())
  return { service, ...double }
}

describe('embed', () => {
  /**
   * Single embed happy path (matrix row 46).
   *
   * The deterministic vector returns with the usage view; ONE hold is
   * reserved with the tolerance-scaled estimate (8 chars -> 2 tokens,
   * x1.2 -> 3, zero output: embeddings bill prompts only) and the RAW
   * response settles it once under workspace.embed with the resource tag.
   */
  it('returns the deterministic vector and settles one hold', async () => {
    const { service, holdFn, captureFn, hold } = serviceWith()
    const body = embedBodySchema.parse({ text: 'embed me', resourceId: 'doc-3' })

    const result = await service.embed(ada, body)

    expect(result.vector).toEqual(unitVectorFor('embed me'))
    expect(result.usage.transactionId).toBe('txn-e')
    expect(holdFn).toHaveBeenCalledTimes(1)
    expect(holdFn).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: EMBEDDING_FEATURES.single,
        tags: ['resource:doc-3'],
      }),
      {
        provider: 'mock',
        model: 'mock-embed',
        operation: 'embeddings',
        inputTokens: 3,
        maxOutputTokens: 0,
      },
    )
    expect(captureFn).toHaveBeenCalledTimes(1)
    expect(captureFn).toHaveBeenCalledWith(
      hold,
      expect.objectContaining({ model: 'mock-embed' }),
      MOCK_EMBEDDING_PRESET,
    )
  })
})

describe('embedBatch', () => {
  /**
   * Batch embed: ONE aggregate record (contract 1, matrix row 47).
   *
   * Three texts produce three vectors in input order but exactly ONE hold
   * (sized by the summed per-text estimate) and ONE capture, tagged with
   * the resource AND the batch size.
   */
  it('returns ordered vectors and settles ONE aggregate record', async () => {
    const { service, holdFn, captureFn } = serviceWith()
    const body = embedBatchBodySchema.parse({ texts: ['a', 'b', 'c'], resourceId: 'doc-4' })

    const result = await service.embedBatch(ada, body)

    expect(result.embeddings).toEqual([unitVectorFor('a'), unitVectorFor('b'), unitVectorFor('c')])
    expect(result.batchSize).toBe(3)
    expect(holdFn).toHaveBeenCalledTimes(1)
    expect(holdFn).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: EMBEDDING_FEATURES.batch,
        tags: ['resource:doc-4', 'batch-size:3'],
      }),
      // Three one-char texts: 1 token each, summed to 3, x1.2 -> 4.
      expect.objectContaining({ inputTokens: 4, maxOutputTokens: 0 }),
    )
    expect(captureFn).toHaveBeenCalledTimes(1)
  })

  /**
   * Throw markers abort the batch and release the hold.
   *
   * A throw marker in any batch input fails the whole call before any
   * usage exists: nothing settles and the reservation is restored.
   */
  it('releases the hold and propagates provider failures', async () => {
    const { service, captureFn, releaseFn, hold } = serviceWith()
    const body = embedBatchBodySchema.parse({ texts: ['ok', 'x @@fail:timeout@@'] })

    await expect(service.embedBatch(ada, body)).rejects.toMatchObject({
      code: 'provider.timeout',
    })
    expect(captureFn).not.toHaveBeenCalled()
    expect(releaseFn).toHaveBeenCalledWith(hold, PROVIDER_FAILURE_REASON)
  })
})

describe('firstVectorOf', () => {
  /**
   * Contract guard.
   *
   * A response without a vector is a provider-layer bug and must fail
   * loudly instead of returning an empty embedding.
   */
  it('throws on a vector-less response', () => {
    expect(() =>
      firstVectorOf({
        id: 'x',
        model: 'mock-embed',
        data: [],
        usage: { prompt_tokens: 0, total_tokens: 0 },
      }),
    ).toThrow('carried no vector')
  })
})
