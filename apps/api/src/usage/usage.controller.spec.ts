/**
 * Unit tests for the usage controller.
 *
 * Layer: unit.
 * Goal: prove each route is a thin delegation (identity + validated query
 * to the analytics service, result returned untouched) and that every
 * route rejects identity-less requests 401 before touching the service.
 * Mocks: the analytics service (per-method doubles).
 */
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, jest } from '@jest/globals'

import {
  byPeriodQuerySchema,
  systemCostsQuerySchema,
  topConsumersQuerySchema,
  usageWindowQuerySchema,
} from './dto/usage-queries.js'
import { UsageController } from './usage.controller.js'
import type { UsageAnalyticsService } from './usage-analytics.service.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'

/** A request double with (or without) the simulated identity. */
function requestWith(user?: { id: string; tenantId: string | null }): AuthenticatedRequest {
  return (user === undefined ? {} : { user }) as AuthenticatedRequest
}

/** The controller with one jest double per service method. */
function controllerWith() {
  const analytics = {
    balance: jest.fn().mockReturnValue(Promise.resolve({ kind: 'balance' })),
    byPeriod: jest.fn().mockReturnValue(Promise.resolve({ kind: 'by-period' })),
    byType: jest.fn().mockReturnValue(Promise.resolve({ kind: 'by-type' })),
    byModel: jest.fn().mockReturnValue(Promise.resolve({ kind: 'by-model' })),
    topConsumers: jest.fn().mockReturnValue(Promise.resolve({ kind: 'top-consumers' })),
    systemCosts: jest.fn().mockReturnValue(Promise.resolve({ kind: 'system-costs' })),
  }
  return {
    controller: new UsageController(analytics as unknown as UsageAnalyticsService),
    analytics,
  }
}

const ada = { id: 'ada', tenantId: 'acme' }

describe('UsageController', () => {
  /**
   * Thin delegation per route.
   *
   * Each handler forwards the identity and the validated query to its
   * service method and returns the result untouched: no logic in the
   * controller.
   */
  it('delegates every route to the analytics service with the identity', async () => {
    const { controller, analytics } = controllerWith()
    const windowQuery = usageWindowQuerySchema.parse({})
    const periodQuery = byPeriodQuerySchema.parse({ granularity: 'month' })
    const topQuery = topConsumersQuerySchema.parse({ topN: '3' })
    const systemQuery = systemCostsQuerySchema.parse({ category: 'reindex' })

    await expect(controller.balance(requestWith(ada))).resolves.toEqual({ kind: 'balance' })
    await expect(controller.byPeriod(requestWith(ada), periodQuery)).resolves.toEqual({
      kind: 'by-period',
    })
    await expect(controller.byType(requestWith(ada), windowQuery)).resolves.toEqual({
      kind: 'by-type',
    })
    await expect(controller.byModel(requestWith(ada), windowQuery)).resolves.toEqual({
      kind: 'by-model',
    })
    await expect(controller.topConsumers(requestWith(ada), topQuery)).resolves.toEqual({
      kind: 'top-consumers',
    })
    await expect(controller.systemCosts(requestWith(ada), systemQuery)).resolves.toEqual({
      kind: 'system-costs',
    })

    expect(analytics.balance).toHaveBeenCalledWith(ada)
    expect(analytics.byPeriod).toHaveBeenCalledWith(ada, periodQuery)
    expect(analytics.byType).toHaveBeenCalledWith(ada, windowQuery)
    expect(analytics.byModel).toHaveBeenCalledWith(ada, windowQuery)
    expect(analytics.topConsumers).toHaveBeenCalledWith(ada, topQuery)
    expect(analytics.systemCosts).toHaveBeenCalledWith(ada, systemQuery)
  })

  /**
   * Identity gate on every route.
   *
   * All usage reads are identity-scoped: 401 before any service call, so
   * reports cannot be probed anonymously.
   */
  it('rejects identity-less requests 401 on every route', () => {
    const { controller, analytics } = controllerWith()
    const windowQuery = usageWindowQuerySchema.parse({})

    expect(() => controller.balance(requestWith())).toThrow(UnauthorizedException)
    expect(() => controller.byPeriod(requestWith(), byPeriodQuerySchema.parse({}))).toThrow(
      UnauthorizedException,
    )
    expect(() => controller.byType(requestWith(), windowQuery)).toThrow(UnauthorizedException)
    expect(() => controller.byModel(requestWith(), windowQuery)).toThrow(UnauthorizedException)
    expect(() => controller.topConsumers(requestWith(), topConsumersQuerySchema.parse({}))).toThrow(
      UnauthorizedException,
    )
    expect(() => controller.systemCosts(requestWith(), systemCostsQuerySchema.parse({}))).toThrow(
      UnauthorizedException,
    )
    expect(analytics.balance).not.toHaveBeenCalled()
    expect(analytics.byType).not.toHaveBeenCalled()
  })
})
