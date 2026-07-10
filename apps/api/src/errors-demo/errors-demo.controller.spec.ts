/**
 * Unit tests for the errors-demo controller.
 *
 * Layer: unit.
 * Goal: prove the controller is thin: it extracts the identity (401 when
 * absent) and delegates catalog reads and trigger runs untouched.
 * Mocks: the errors-demo service; requests are plain stubs.
 */
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, jest } from '@jest/globals'

import { backdatedCostBodySchema } from './dto/backdated-cost.body.js'
import { ErrorsDemoController } from './errors-demo.controller.js'
import type { ErrorCatalogView, ErrorsDemoService } from './errors-demo.service.js'
import type { AuthenticatedRequest, DemoIdentity } from '../identity/identity.middleware.js'

/** A request stub carrying an optional identity. */
function requestWith(user: DemoIdentity | undefined): AuthenticatedRequest {
  return { user } as AuthenticatedRequest
}

/** The controller under test plus its service double. */
function controllerWith() {
  const view: ErrorCatalogView = { entries: [], triggerable: [] }
  const catalog = jest.fn<ErrorsDemoService['catalog']>().mockReturnValue(view)
  const trigger = jest.fn<ErrorsDemoService['trigger']>()
  const backdatedCost = jest.fn<ErrorsDemoService['backdatedCost']>()
  const controller = new ErrorsDemoController({
    catalog,
    trigger,
    backdatedCost,
  } as unknown as ErrorsDemoService)
  return { controller, catalog, trigger, backdatedCost, view }
}

describe('ErrorsDemoController.catalog', () => {
  /**
   * Thin delegation on the read path.
   *
   * The catalog is served verbatim once the identity requirement holds.
   */
  it('delegates to the service for an identified caller', () => {
    const { controller, view } = controllerWith()

    const result = controller.catalog(requestWith({ id: 'ada', tenantId: 'acme' }))

    expect(result).toBe(view)
  })

  /**
   * Identity requirement.
   *
   * Without a demo identity the read is rejected with 401 before any
   * service work.
   */
  it('throws 401 without an identity', () => {
    const { controller, catalog } = controllerWith()

    expect(() => controller.catalog(requestWith(undefined))).toThrow(UnauthorizedException)
    expect(catalog).not.toHaveBeenCalled()
  })
})

describe('ErrorsDemoController.trigger', () => {
  /**
   * Thin delegation on the trigger path.
   *
   * The identity and the raw code parameter travel to the service
   * untouched; the service owns validation and dispatch.
   */
  it('delegates the code and identity to the service', async () => {
    const { controller, trigger } = controllerWith()
    const failure = new Error('raised')
    trigger.mockRejectedValue(failure)

    await expect(
      controller.trigger(requestWith({ id: 'ada', tenantId: 'acme' }), 'AI_TOKENS_STORE_ERROR'),
    ).rejects.toBe(failure)

    expect(trigger).toHaveBeenCalledWith({ id: 'ada', tenantId: 'acme' }, 'AI_TOKENS_STORE_ERROR')
  })

  /**
   * Identity requirement.
   *
   * Without a demo identity the trigger is rejected with 401 before any
   * dispatch.
   */
  it('throws 401 without an identity', () => {
    const { controller, trigger } = controllerWith()

    expect(() => controller.trigger(requestWith(undefined), 'x')).toThrow(UnauthorizedException)
    expect(trigger).not.toHaveBeenCalled()
  })
})

describe('ErrorsDemoController.backdatedCost', () => {
  const body = backdatedCostBodySchema.parse({
    model: 'mock-chat-pro',
    promptTokens: 10,
    completionTokens: 5,
    date: '2026-01-15T00:00:00.000Z',
  })

  /**
   * Thin delegation on the helper path.
   *
   * The validated body travels to the service untouched once the identity
   * requirement holds.
   */
  it('delegates the validated body to the service', async () => {
    const { controller, backdatedCost } = controllerWith()
    const result = { pricing: {}, cost: {} } as never
    backdatedCost.mockResolvedValue(result)

    await expect(
      controller.backdatedCost(requestWith({ id: 'ada', tenantId: 'acme' }), body),
    ).resolves.toBe(result)

    expect(backdatedCost).toHaveBeenCalledWith(body)
  })

  /**
   * Identity requirement.
   *
   * Without a demo identity the helper is rejected with 401 before any
   * pricing read.
   */
  it('throws 401 without an identity', () => {
    const { controller, backdatedCost } = controllerWith()

    expect(() => controller.backdatedCost(requestWith(undefined), body)).toThrow(
      UnauthorizedException,
    )
    expect(backdatedCost).not.toHaveBeenCalled()
  })
})
