/**
 * Unit tests for the pricing controller.
 *
 * Layer: unit.
 * Goal: prove the controller is thin: public reads delegate verbatim, the
 * update extracts the identity (401 when absent) before delegating.
 * Mocks: the catalog service; requests are plain stubs.
 */
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, jest } from '@jest/globals'

import { priceHistoryQuerySchema } from './dto/price-history.query.js'
import { updatePriceBodySchema } from './dto/update-price.body.js'
import { PricingController } from './pricing.controller.js'
import type { PricingCatalogService } from './pricing-catalog.service.js'
import type { AuthenticatedRequest, DemoIdentity } from '../identity/identity.middleware.js'

/** A request stub carrying an optional identity. */
function requestWith(user: DemoIdentity | undefined): AuthenticatedRequest {
  return { user } as AuthenticatedRequest
}

/** The controller under test plus its service doubles. */
function controllerWith() {
  const current = jest.fn<PricingCatalogService['current']>().mockResolvedValue({ items: [] })
  const history = jest.fn<PricingCatalogService['history']>().mockResolvedValue({ items: [] })
  const update = jest.fn<PricingCatalogService['update']>()
  const controller = new PricingController({
    current,
    history,
    update,
  } as unknown as PricingCatalogService)
  return { controller, current, history, update }
}

describe('PricingController.current', () => {
  /**
   * Public catalog delegation.
   *
   * The current listing needs no identity and forwards straight to the
   * catalog service.
   */
  it('delegates to the catalog service', async () => {
    const { controller, current } = controllerWith()

    await expect(controller.current()).resolves.toEqual({ items: [] })
    expect(current).toHaveBeenCalledTimes(1)
  })
})

describe('PricingController.history', () => {
  /**
   * Tuple delegation.
   *
   * The path model and the validated query reach the service untouched.
   */
  it('delegates the model and query', async () => {
    const { controller, history } = controllerWith()
    const query = priceHistoryQuerySchema.parse({ provider: 'mock' })

    await controller.history('mock-chat-pro', query)

    expect(history).toHaveBeenCalledWith('mock-chat-pro', query)
  })
})

describe('PricingController.update', () => {
  const body = updatePriceBodySchema.parse({
    provider: 'mock',
    operation: 'chat',
    inputNanoUsdPerMillion: '700000000',
  })

  /**
   * Identity extraction.
   *
   * The identity travels to the service (which owns the admin gate)
   * together with the path model and validated body.
   */
  it('delegates with the identity, model, and body', async () => {
    const { controller, update } = controllerWith()

    await controller.update(requestWith({ id: 'root', tenantId: null }), 'mock-chat-pro', body)

    expect(update).toHaveBeenCalledWith({ id: 'root', tenantId: null }, 'mock-chat-pro', body)
  })

  /**
   * Missing identity.
   *
   * Anonymous updates are 401 before any service call (the 403 admin gate
   * only applies to authenticated non-admins).
   */
  it('throws 401 without an identity', () => {
    const { controller, update } = controllerWith()

    expect(() => controller.update(requestWith(undefined), 'mock-chat-pro', body)).toThrow(
      UnauthorizedException,
    )
    expect(update).not.toHaveBeenCalled()
  })
})
