/**
 * Unit tests for the system-jobs controller.
 *
 * Layer: unit.
 * Goal: prove each route is a thin delegation (identity + validated body
 * to the service, result returned untouched) and that both routes reject
 * identity-less requests 401 before touching the service.
 * Mocks: the system-jobs service (per-method doubles).
 */
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, jest } from '@jest/globals'

import { agentDecisionBodySchema, reindexBodySchema } from './dto/system-jobs.bodies.js'
import { SystemJobsController } from './system-jobs.controller.js'
import type { SystemJobsService } from './system-jobs.service.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'

/** A request double with (or without) the simulated identity. */
function requestWith(user?: { id: string; tenantId: string | null }): AuthenticatedRequest {
  return (user === undefined ? {} : { user }) as AuthenticatedRequest
}

/** The controller with one jest double per service method. */
function controllerWith() {
  const jobs = {
    reindex: jest.fn().mockReturnValue(Promise.resolve({ kind: 'reindex' })),
    agentDecision: jest.fn().mockReturnValue(Promise.resolve({ kind: 'agent-decision' })),
  }
  return {
    controller: new SystemJobsController(jobs as unknown as SystemJobsService),
    jobs,
  }
}

const root = { id: 'root', tenantId: 'acme' }
const ada = { id: 'ada', tenantId: 'acme' }

describe('SystemJobsController', () => {
  /**
   * Thin delegation per route.
   *
   * Each handler forwards the identity and the validated body to its
   * service method and returns the result untouched.
   */
  it('delegates both jobs to the service with the identity', async () => {
    const { controller, jobs } = controllerWith()
    const reindexBody = reindexBodySchema.parse({ count: 2 })
    const decisionBody = agentDecisionBodySchema.parse({
      decisionId: 'dec-1',
      strategy: 's1',
      confidence: 0.5,
      reasoning: 'why',
    })

    await expect(controller.reindex(requestWith(root), reindexBody)).resolves.toEqual({
      kind: 'reindex',
    })
    expect(jobs.reindex).toHaveBeenCalledWith(root, reindexBody)
    await expect(controller.agentDecision(requestWith(ada), decisionBody)).resolves.toEqual({
      kind: 'agent-decision',
    })
    expect(jobs.agentDecision).toHaveBeenCalledWith(ada, decisionBody)
  })

  /**
   * Identity gate on both routes.
   *
   * System jobs are identity-scoped (the admin gate itself lives in the
   * service): 401 before any service call.
   */
  it('rejects identity-less requests 401 on both routes', () => {
    const { controller, jobs } = controllerWith()

    expect(() => controller.reindex(requestWith(), reindexBodySchema.parse({}))).toThrow(
      UnauthorizedException,
    )
    expect(() =>
      controller.agentDecision(
        requestWith(),
        agentDecisionBodySchema.parse({
          decisionId: 'dec-1',
          strategy: 's1',
          confidence: 0.5,
          reasoning: 'why',
        }),
      ),
    ).toThrow(UnauthorizedException)
    expect(jobs.reindex).not.toHaveBeenCalled()
    expect(jobs.agentDecision).not.toHaveBeenCalled()
  })
})
