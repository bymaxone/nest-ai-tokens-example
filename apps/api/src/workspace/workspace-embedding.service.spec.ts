/**
 * Unit tests for the workspace embedding service.
 *
 * Layer: unit.
 * Goal: prove the single embed meters one row with the resource tag, the
 * batch embed meters ONE aggregate row tagged with the batch size (the
 * shape that enforces contract 1), vectors return in input order, and the
 * first-vector guard is loud on a contract breach.
 * Mocks: the library MeteringService (record double). The provider is the
 * REAL zero-latency MockAiProvider.
 */
import { describe, expect, it, jest } from '@jest/globals'
import type { MeteringService, UsageRecord } from '@bymax-one/nest-ai-tokens'

import { embedBatchBodySchema } from './dto/embed-batch.body.js'
import { embedBodySchema } from './dto/embed.body.js'
import {
  EMBEDDING_FEATURES,
  WorkspaceEmbeddingService,
  firstVectorOf,
} from './workspace-embedding.service.js'
import { MockAiProvider, unitVectorFor } from '../ai/mock-ai.provider.js'
import { MOCK_EMBEDDING_PRESET } from '../ai/mock-usage.presets.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import { recordWith } from '../../test/fixtures/usage-record.fixture.js'

const ada: DemoIdentity = { id: 'ada', tenantId: 'acme' }

/** The service under test with a real provider and a metering double. */
function serviceWith(record: UsageRecord = recordWith({ id: 'txn-e' })) {
  const recordFn = jest.fn<MeteringService['record']>().mockResolvedValue(record)
  const metering = { record: recordFn } as unknown as MeteringService
  const service = new WorkspaceEmbeddingService(new MockAiProvider({}), metering)
  return { service, recordFn }
}

describe('embed', () => {
  /**
   * Single embed happy path (matrix row 46).
   *
   * The deterministic vector returns with the usage view; the RAW provider
   * response is metered once under workspace.embed with the resource tag
   * and the embedding preset.
   */
  it('returns the deterministic vector and meters once', async () => {
    const { service, recordFn } = serviceWith()
    const body = embedBodySchema.parse({ text: 'embed me', resourceId: 'doc-3' })

    const result = await service.embed(ada, body)

    expect(result.vector).toEqual(unitVectorFor('embed me'))
    expect(result.usage.transactionId).toBe('txn-e')
    expect(recordFn).toHaveBeenCalledTimes(1)
    expect(recordFn).toHaveBeenCalledWith({
      usage: expect.objectContaining({ model: 'mock-embed' }),
      preset: MOCK_EMBEDDING_PRESET,
      context: expect.objectContaining({
        feature: EMBEDDING_FEATURES.single,
        tags: ['resource:doc-3'],
      }),
    })
  })
})

describe('embedBatch', () => {
  /**
   * Batch embed: ONE aggregate record (contract 1, matrix row 47).
   *
   * Three texts produce three vectors in input order but exactly ONE
   * record call, tagged with the resource AND the batch size.
   */
  it('returns ordered vectors and meters ONE aggregate record', async () => {
    const { service, recordFn } = serviceWith()
    const body = embedBatchBodySchema.parse({ texts: ['a', 'b', 'c'], resourceId: 'doc-4' })

    const result = await service.embedBatch(ada, body)

    expect(result.embeddings).toEqual([unitVectorFor('a'), unitVectorFor('b'), unitVectorFor('c')])
    expect(result.batchSize).toBe(3)
    expect(recordFn).toHaveBeenCalledTimes(1)
    expect(recordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          feature: EMBEDDING_FEATURES.batch,
          tags: ['resource:doc-4', 'batch-size:3'],
        }),
      }),
    )
  })

  /**
   * Throw markers abort the batch without metering.
   *
   * A throw marker in any batch input fails the whole call before any
   * usage exists, so nothing is recorded.
   */
  it('propagates provider failures without metering', async () => {
    const { service, recordFn } = serviceWith()
    const body = embedBatchBodySchema.parse({ texts: ['ok', 'x @@fail:timeout@@'] })

    await expect(service.embedBatch(ada, body)).rejects.toMatchObject({
      code: 'provider.timeout',
    })
    expect(recordFn).not.toHaveBeenCalled()
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
