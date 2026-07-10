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
  const controller = new ErrorsDemoController({ catalog, trigger } as unknown as ErrorsDemoService)
  return { controller, catalog, trigger, view }
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
