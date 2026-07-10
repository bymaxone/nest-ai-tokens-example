/**
 * Unit tests for the quota controller.
 *
 * Layer: unit.
 * Goal: prove each route is a thin delegation (identity + validated body
 * to its service, result returned untouched), that identity-scoped routes
 * reject identity-less requests 401 before touching the service, and that
 * the declarative constant route carries the library's @Meter and
 * @RequireBudget metadata (feature, preset, identity extract, headers,
 * static estimate) the guard/interceptor read.
 * Mocks: the lab, status, and budgets services (per-method doubles).
 */
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, jest } from '@jest/globals'
import { METER_METADATA, REQUIRE_BUDGET_METADATA } from '@bymax-one/nest-ai-tokens'
import type { MeterConfig, RequireBudgetConfig } from '@bymax-one/nest-ai-tokens'

import { labRunBodySchema } from './dto/lab-run.body.js'
import { upsertBudgetBodySchema } from './dto/upsert-budget.body.js'
import { QuotaController } from './quota.controller.js'
import type { QuotaBudgetsService } from './quota-budgets.service.js'
import { LAB_CONSTANT_ESTIMATE, LAB_FEATURES, extractLabUsage } from './quota-lab.service.js'
import type { QuotaLabService } from './quota-lab.service.js'
import type { QuotaStatusService } from './quota-status.service.js'
import { MOCK_CHAT_PRESET } from '../ai/mock-usage.presets.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'

/** A request double with (or without) the simulated identity. */
function requestWith(user?: { id: string; tenantId: string | null }): AuthenticatedRequest {
  return (user === undefined ? {} : { user }) as AuthenticatedRequest
}

/** The controller with one jest double per service method. */
function controllerWith() {
  const lab = {
    completeConstant: jest.fn().mockReturnValue(Promise.resolve({ kind: 'constant' })),
    runModelBased: jest.fn().mockReturnValue(Promise.resolve({ kind: 'model-based' })),
  }
  const status = {
    status: jest.fn().mockReturnValue(Promise.resolve({ kind: 'status' })),
  }
  const budgets = {
    upsert: jest.fn().mockReturnValue(Promise.resolve({ kind: 'budget' })),
    list: jest.fn().mockReturnValue(Promise.resolve({ kind: 'budget-list' })),
  }
  return {
    controller: new QuotaController(
      lab as unknown as QuotaLabService,
      status as unknown as QuotaStatusService,
      budgets as unknown as QuotaBudgetsService,
    ),
    lab,
    status,
    budgets,
  }
}

const ada = { id: 'ada', tenantId: 'acme' }
const root = { id: 'root', tenantId: null }

describe('QuotaController delegation', () => {
  /**
   * Constant lab route.
   *
   * The handler forwards only the body (the guard/interceptor own the
   * identity) and returns the raw response untouched.
   */
  it('labConstant delegates the body to the lab service', async () => {
    const { controller, lab } = controllerWith()
    const body = labRunBodySchema.parse({})

    await expect(controller.labConstant(body)).resolves.toEqual({ kind: 'constant' })
    expect(lab.completeConstant).toHaveBeenCalledWith(body)
  })

  /**
   * Model-based lab route.
   *
   * The handler forwards the identity and body; without an identity it
   * rejects 401 before the service runs.
   */
  it('labModelBased delegates identity and body, 401 without identity', async () => {
    const { controller, lab } = controllerWith()
    const body = labRunBodySchema.parse({ model: 'mock-chat-pro' })

    await expect(controller.labModelBased(requestWith(ada), body)).resolves.toEqual({
      kind: 'model-based',
    })
    expect(lab.runModelBased).toHaveBeenCalledWith(ada, body)
    expect(() => controller.labModelBased(requestWith(), body)).toThrow(UnauthorizedException)
  })

  /**
   * Status route.
   *
   * Identity-scoped read: delegates the identity, 401 without one.
   */
  it('status delegates the identity, 401 without identity', async () => {
    const { controller, status } = controllerWith()

    await expect(controller.status(requestWith(ada))).resolves.toEqual({ kind: 'status' })
    expect(status.status).toHaveBeenCalledWith(ada)
    expect(() => controller.status(requestWith())).toThrow(UnauthorizedException)
  })

  /**
   * Budget routes.
   *
   * Upsert and list delegate identity (+ body); both reject identity-less
   * calls 401 (the admin 403 lives in the service).
   */
  it('budget routes delegate identity and body, 401 without identity', async () => {
    const { controller, budgets } = controllerWith()
    const body = upsertBudgetBodySchema.parse({ scopeType: 'user', scopeId: 'ada', limitCount: 1 })

    await expect(controller.upsertBudget(requestWith(root), body)).resolves.toEqual({
      kind: 'budget',
    })
    expect(budgets.upsert).toHaveBeenCalledWith(root, body)
    await expect(controller.listBudgets(requestWith(ada))).resolves.toEqual({
      kind: 'budget-list',
    })
    expect(budgets.list).toHaveBeenCalledWith(ada)
    expect(() => controller.upsertBudget(requestWith(), body)).toThrow(UnauthorizedException)
    expect(() => controller.listBudgets(requestWith())).toThrow(UnauthorizedException)
  })
})

describe('declarative metadata on the constant route', () => {
  /**
   * The @Meter and @RequireBudget contracts.
   *
   * The guard reads the static estimate from REQUIRE_BUDGET_METADATA and
   * the interceptor reads feature/preset/extract/headers from
   * METER_METADATA: these keys ARE the declarative wiring, so they are
   * pinned here exactly.
   */
  it('carries the meter and budget metadata the library reads', () => {
    // Descriptor access (not a bound-method read): the reflector keys live
    // on the handler function itself, exactly where the library reads them.
    const handler = Object.getOwnPropertyDescriptor(QuotaController.prototype, 'labConstant')
      ?.value as object
    const meter = Reflect.getMetadata(METER_METADATA, handler) as MeterConfig
    const budget = Reflect.getMetadata(REQUIRE_BUDGET_METADATA, handler) as RequireBudgetConfig

    expect(meter.feature).toBe(LAB_FEATURES.constant)
    expect(meter.preset).toBe(MOCK_CHAT_PRESET)
    expect(meter.extract).toBe(extractLabUsage)
    expect(meter.exposeHeaders).toBe(true)
    expect(budget.estimate).toBe(LAB_CONSTANT_ESTIMATE)
  })
})
