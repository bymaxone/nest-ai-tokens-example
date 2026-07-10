/**
 * Unit tests for the models info service.
 *
 * Layer: unit.
 * Goal: prove the payload composes the catalog defaults with the CURRENT
 * price rows from the library's rate resolution (bigint rates as decimal
 * strings), and that a missing rate stays loud in both failure shapes.
 * Mocks: the library PricingService (resolveRate double).
 */
import { describe, expect, it, jest } from '@jest/globals'
import type { PriceVersion, PricingService } from '@bymax-one/nest-ai-tokens'

import { WorkspaceModelsService } from './workspace-models.service.js'

/** A complete open price row for one tuple. */
function priceRow(model: string, operation: PriceVersion['operation']): PriceVersion {
  return {
    id: `price-${model}`,
    provider: 'mock',
    model,
    operation,
    serviceTier: 'standard',
    inputNanoUsdPerMillion: 600_000_000n,
    outputNanoUsdPerMillion: 2_400_000_000n,
    cacheReadNanoUsdPerMillion: 0n,
    cacheWrite5mNanoUsdPerMillion: 0n,
    cacheWrite1hNanoUsdPerMillion: 0n,
    reasoningNanoUsdPerMillion: 0n,
    audioInNanoUsdPerMillion: 0n,
    audioOutNanoUsdPerMillion: 0n,
    imageInNanoUsdPerMillion: 0n,
    imageOutNanoUsdPerMillion: 0n,
    currency: 'USD',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    source: 'seed:mock',
  }
}

describe('describeModels', () => {
  /**
   * Payload composition (matrix row 49).
   *
   * The command side carries the default chat model, the override
   * choices, and its current pricing; the embedding side carries the
   * embeddings model and pricing; bigint rates render as decimal strings.
   */
  it('composes catalog defaults with current pricing', async () => {
    const resolveRate = jest
      .fn<PricingService['resolveRate']>()
      .mockImplementation((input) => Promise.resolve(priceRow(input.model, input.operation)))
    const service = new WorkspaceModelsService({ resolveRate } as unknown as PricingService)

    const info = await service.describeModels()

    expect(info.command.model).toBe('mock-chat-pro')
    expect(info.command.models).toEqual(['mock-chat-pro', 'mock-chat-lite'])
    expect(info.command.pricing.inputNanoUsdPerMillion).toBe('600000000')
    expect(info.embedding.model).toBe('mock-embed')
    expect(info.embedding.pricing.id).toBe('price-mock-embed')
    expect(resolveRate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'mock', model: 'mock-chat-pro', operation: 'chat' }),
    )
    expect(resolveRate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'mock', model: 'mock-embed', operation: 'embeddings' }),
    )
  })

  /**
   * Loud rate miss.
   *
   * If rate resolution returns null (non-strict misconfiguration), the
   * service still fails loudly instead of serving a price-less payload.
   */
  it('throws when a catalog model has no open price row', async () => {
    const resolveRate = jest.fn<PricingService['resolveRate']>().mockResolvedValue(null)
    const service = new WorkspaceModelsService({ resolveRate } as unknown as PricingService)

    await expect(service.describeModels()).rejects.toThrow('No current price row')
  })
})
