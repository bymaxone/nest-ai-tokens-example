/**
 * Unit tests for the wiring smoke service and controller.
 *
 * Layer: unit.
 * Goal: prove the report reflects the resolved options and the reserved
 * logger token, and that the controller delegates untouched. The
 * registration proof against the real container lives in the boot test
 * (bootstrap.spec) and the e2e suite.
 * Mocks: structural stubs for the injected services and options.
 */
import { describe, expect, it } from '@jest/globals'

import { WiringController } from './wiring.controller.js'
import { WiringService } from './wiring.service.js'
import type { ResolvedOptionsView } from './wiring.service.js'

const options: ResolvedOptionsView = {
  currency: 'USD',
  ratingMode: 'rate-table',
  pricing: { cacheTtlMs: 300_000, strict: true },
  wallets: { enabled: true },
  budgets: { enabled: true },
}

// Structural stand-ins: the report only checks presence, never behavior.
const ledger: unknown = {}
const pricing: unknown = {}

describe('WiringService', () => {
  /**
   * Report shape with the v0.1.0 reserved logger.
   *
   * The module binds BYMAX_AI_TOKENS_LOGGER to null; the report must state
   * registration and surface the logger as unbound.
   */
  it('reports the resolved options and an unbound reserved logger', () => {
    const service = new WiringService(ledger, pricing, options, null)

    expect(service.describeWiring()).toEqual({
      registered: true,
      currency: 'USD',
      ratingMode: 'rate-table',
      pricingCacheTtlMs: 300_000,
      pricingStrict: true,
      walletsEnabled: true,
      budgetsEnabled: true,
      loggerBound: false,
    })
  })

  /**
   * Forward compatibility: a bound logger.
   *
   * When a future library version consumes the logger token, a non-null
   * binding must flip the report flag without further changes here.
   */
  it('reports loggerBound true when the token carries a value', () => {
    const service = new WiringService(ledger, pricing, options, { log: () => undefined })

    expect(service.describeWiring().loggerBound).toBe(true)
  })

  /**
   * Missing-service degradation.
   *
   * If either library service failed to resolve, the report must say so
   * instead of claiming a healthy registration.
   */
  it('reports registered false when a service is missing', () => {
    const withoutLedger = new WiringService(undefined, pricing, options, null)
    const withoutPricing = new WiringService(ledger, undefined, options, null)

    expect(withoutLedger.describeWiring().registered).toBe(false)
    expect(withoutPricing.describeWiring().registered).toBe(false)
  })

  /**
   * Disabled enforcement view.
   *
   * With QUOTA_ENABLED=false the resolved options carry disabled feature
   * blocks; the report must mirror them.
   */
  it('mirrors disabled wallet/budget blocks', () => {
    const disabled: ResolvedOptionsView = {
      ...options,
      wallets: { enabled: false },
      budgets: { enabled: false },
    }
    const service = new WiringService(ledger, pricing, disabled, null)

    const report = service.describeWiring()

    expect(report.walletsEnabled).toBe(false)
    expect(report.budgetsEnabled).toBe(false)
  })
})

describe('WiringController', () => {
  /**
   * Thin controller contract.
   *
   * The controller returns the service's report untouched (validate,
   * delegate, return; no reshaping).
   */
  it('delegates to the wiring service', () => {
    const service = new WiringService(ledger, pricing, options, null)
    const controller = new WiringController(service)

    expect(controller.getWiring()).toEqual(service.describeWiring())
  })
})
