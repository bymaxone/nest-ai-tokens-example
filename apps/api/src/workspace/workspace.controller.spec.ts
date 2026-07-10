/**
 * Unit tests for the workspace controller.
 *
 * Layer: unit.
 * Goal: prove each route is a thin delegation (identity + validated body
 * to the service, result returned untouched), that metered routes reject
 * identity-less requests with 401 BEFORE touching the service, and that
 * the models read needs no identity.
 * Mocks: the command, embedding, and models services (per-method doubles).
 */
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, jest } from '@jest/globals'

import { analyzeBodySchema } from './dto/analyze.body.js'
import { customBodySchema } from './dto/custom.body.js'
import { embedBatchBodySchema } from './dto/embed-batch.body.js'
import { embedBodySchema } from './dto/embed.body.js'
import { rewriteBodySchema } from './dto/rewrite.body.js'
import { summarizeBodySchema } from './dto/summarize.body.js'
import { translateBodySchema } from './dto/translate.body.js'
import { WorkspaceController } from './workspace.controller.js'
import type { WorkspaceCommandService } from './workspace-command.service.js'
import type { WorkspaceEmbeddingService } from './workspace-embedding.service.js'
import type { WorkspaceModelsService } from './workspace-models.service.js'
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
  const embeddings = {
    embed: jest.fn().mockReturnValue(Promise.resolve({ kind: 'embed' })),
    embedBatch: jest.fn().mockReturnValue(Promise.resolve({ kind: 'embed-batch' })),
  }
  const models = {
    describeModels: jest.fn().mockReturnValue(Promise.resolve({ kind: 'models' })),
  }
  return {
    controller: new WorkspaceController(
      service as unknown as WorkspaceCommandService,
      embeddings as unknown as WorkspaceEmbeddingService,
      models as unknown as WorkspaceModelsService,
    ),
    service,
    embeddings,
    models,
  }
}

const ada = { id: 'ada', tenantId: 'acme' }

describe('WorkspaceController', () => {
  /**
   * Thin delegation per route.
   *
   * Each handler forwards the identity and the validated body to its
   * service method and returns the service result untouched: no logic in
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
    const { controller, service, embeddings } = controllerWith()
    const body = translateBodySchema.parse({ text: 'Hi', targetLanguages: ['pt'] })
    const embedBody = embedBodySchema.parse({ text: 'Hi' })

    expect(() => controller.translate(requestWith(), body)).toThrow(UnauthorizedException)
    expect(() => controller.embed(requestWith(), embedBody)).toThrow(UnauthorizedException)
    expect(service.translate).not.toHaveBeenCalled()
    expect(embeddings.embed).not.toHaveBeenCalled()
  })

  /**
   * Embedding delegation.
   *
   * Both embed routes forward identity + body and return the service
   * result untouched.
   */
  it('delegates the embedding routes with the identity', async () => {
    const { controller, embeddings } = controllerWith()
    const embedBody = embedBodySchema.parse({ text: 'Hi' })
    const batchBody = embedBatchBodySchema.parse({ texts: ['a', 'b'] })

    await expect(controller.embed(requestWith(ada), embedBody)).resolves.toEqual({ kind: 'embed' })
    await expect(controller.embedBatch(requestWith(ada), batchBody)).resolves.toEqual({
      kind: 'embed-batch',
    })
    expect(embeddings.embed).toHaveBeenCalledWith(ada, embedBody)
    expect(embeddings.embedBatch).toHaveBeenCalledWith(ada, batchBody)
  })

  /**
   * Identity-free models read.
   *
   * GET /workspace/models delegates without any identity requirement (the
   * unguarded-read contrast for the future quota surface).
   */
  it('serves the models read without an identity', async () => {
    const { controller, models } = controllerWith()

    await expect(controller.describeModels()).resolves.toEqual({ kind: 'models' })
    expect(models.describeModels).toHaveBeenCalledTimes(1)
  })
})
