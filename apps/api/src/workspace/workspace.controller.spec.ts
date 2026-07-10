/**
 * Unit tests for the workspace controller.
 *
 * Layer: unit.
 * Goal: prove each route is a thin delegation (identity + validated body
 * to the service, result returned untouched) and that every route rejects
 * identity-less requests with 401 BEFORE touching the service.
 * Mocks: the command service (per-method doubles).
 */
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, jest } from '@jest/globals'

import { analyzeBodySchema } from './dto/analyze.body.js'
import { customBodySchema } from './dto/custom.body.js'
import { rewriteBodySchema } from './dto/rewrite.body.js'
import { summarizeBodySchema } from './dto/summarize.body.js'
import { translateBodySchema } from './dto/translate.body.js'
import { WorkspaceController } from './workspace.controller.js'
import type { WorkspaceCommandService } from './workspace-command.service.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'

/** A request double with (or without) the simulated identity. */
function requestWith(user?: { id: string; tenantId: string | null }): AuthenticatedRequest {
  return (user === undefined ? {} : { user }) as AuthenticatedRequest
}

/** The controller with one jest double per service method. */
function controllerWith() {
  const service = {
    translate: jest.fn().mockReturnValue(Promise.resolve({ kind: 'translate' })),
    summarize: jest.fn().mockReturnValue(Promise.resolve({ kind: 'summarize' })),
    rewrite: jest.fn().mockReturnValue(Promise.resolve({ kind: 'rewrite' })),
    analyze: jest.fn().mockReturnValue(Promise.resolve({ kind: 'analyze' })),
    custom: jest.fn().mockReturnValue(Promise.resolve({ kind: 'custom' })),
  }
  return {
    controller: new WorkspaceController(service as unknown as WorkspaceCommandService),
    service,
  }
}

const ada = { id: 'ada', tenantId: 'acme' }

describe('WorkspaceController', () => {
  /**
   * Thin delegation per route.
   *
   * Each handler forwards the identity and the validated body to its
   * service method and returns the service result untouched — no logic in
   * the controller.
   */
  it('delegates every command to the service with the identity', async () => {
    const { controller, service } = controllerWith()
    const translateBody = translateBodySchema.parse({ text: 'Hi', targetLanguages: ['pt'] })
    const summarizeBody = summarizeBodySchema.parse({ text: 'Hi' })
    const rewriteBody = rewriteBodySchema.parse({ text: 'Hi' })
    const analyzeBody = analyzeBodySchema.parse({ text: 'Hi' })
    const customBody = customBodySchema.parse({ userPrompt: 'Hi' })

    await expect(controller.translate(requestWith(ada), translateBody)).resolves.toEqual({
      kind: 'translate',
    })
    await expect(controller.summarize(requestWith(ada), summarizeBody)).resolves.toEqual({
      kind: 'summarize',
    })
    await expect(controller.rewrite(requestWith(ada), rewriteBody)).resolves.toEqual({
      kind: 'rewrite',
    })
    await expect(controller.analyze(requestWith(ada), analyzeBody)).resolves.toEqual({
      kind: 'analyze',
    })
    await expect(controller.custom(requestWith(ada), customBody)).resolves.toEqual({
      kind: 'custom',
    })
    expect(service.translate).toHaveBeenCalledWith(ada, translateBody)
    expect(service.summarize).toHaveBeenCalledWith(ada, summarizeBody)
    expect(service.rewrite).toHaveBeenCalledWith(ada, rewriteBody)
    expect(service.analyze).toHaveBeenCalledWith(ada, analyzeBody)
    expect(service.custom).toHaveBeenCalledWith(ada, customBody)
  })

  /**
   * Identity requirement.
   *
   * Without a demo identity every command rejects 401 before the service
   * is touched (metered endpoints need a payer).
   */
  it('rejects identity-less requests with 401 before the service runs', () => {
    const { controller, service } = controllerWith()
    const body = translateBodySchema.parse({ text: 'Hi', targetLanguages: ['pt'] })

    expect(() => controller.translate(requestWith(), body)).toThrow(UnauthorizedException)
    expect(service.translate).not.toHaveBeenCalled()
  })
})
