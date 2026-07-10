/**
 * @fileoverview `/system-jobs` routes: the reindex batch (admin-plane) and
 * the agent-decision assist. Thin controllers: identity extraction plus
 * delegation; the service owns the system-cost semantics. Neither route
 * wears the enforcement guard: system costs are platform-absorbed by the
 * library contract (they never consume a wallet or budget), so there is
 * nothing to enforce.
 *
 * @layer system-jobs
 */
import { Body, Controller, Inject, Post, Req } from '@nestjs/common'

import { AgentDecisionBodyDto, ReindexBodyDto } from './dto/system-jobs.bodies.js'
import { SystemJobsService } from './system-jobs.service.js'
import type { AgentDecisionResult, ReindexResult } from './system-jobs.service.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'
import { requireIdentity } from '../identity/require-identity.js'

/** Serves the system-job simulations. */
@Controller('system-jobs')
export class SystemJobsController {
  /**
   * @param jobs The system-jobs service.
   */
  constructor(@Inject(SystemJobsService) private readonly jobs: SystemJobsService) {}

  /**
   * `POST /system-jobs/reindex`: run the nightly-reindex simulation (401
   * without an identity, 403 for non-admins; see the service's admin
   * note).
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated reindex body.
   * @returns The aggregate transaction summary.
   */
  @Post('reindex')
  reindex(
    @Req() request: AuthenticatedRequest,
    @Body() body: ReindexBodyDto,
  ): Promise<ReindexResult> {
    return this.jobs.reindex(requireIdentity(request), body)
  }

  /**
   * `POST /system-jobs/agent-decision`: record one agent-decision assist
   * for the caller.
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated decision descriptor.
   * @returns The echo plus the recorded transaction summary.
   */
  @Post('agent-decision')
  agentDecision(
    @Req() request: AuthenticatedRequest,
    @Body() body: AgentDecisionBodyDto,
  ): Promise<AgentDecisionResult> {
    return this.jobs.agentDecision(requireIdentity(request), body)
  }
}
