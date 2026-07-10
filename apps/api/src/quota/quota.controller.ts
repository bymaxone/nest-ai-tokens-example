/**
 * @fileoverview `/quota` routes: the estimator lab (constant + model-based
 * holds), the combined access status, and the budget admin/read surface.
 * Thin controllers: identity extraction plus delegation; the services own
 * the library calls.
 *
 * The CONSTANT lab route is the library's declarative controller path:
 * `EnforcementGuard` (over `BudgetGuard`) places the static
 * `@RequireBudget({ estimate })` hold pre-handler and `MeteringInterceptor`
 * settles it from the handler's return value per the `@Meter` config,
 * exposing the `x-ai-tokens-*` cost headers. The lab therefore requires the
 * enforcement blocks (`QUOTA_ENABLED=true`, the default); with them off the
 * guard allows and the interceptor's post-hoc enforce path reports the
 * library's invalid-config verdict.
 *
 * @layer quota
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { Meter, MeteringInterceptor, RequireBudget } from '@bymax-one/nest-ai-tokens'
import type { AccessStatus, Budget, JsonSafe } from '@bymax-one/nest-ai-tokens'

import { LabRunBodyDto } from './dto/lab-run.body.js'
import { UpsertBudgetBodyDto } from './dto/upsert-budget.body.js'
import { EnforcementGuard } from './enforcement.guard.js'
import { QuotaBudgetsService } from './quota-budgets.service.js'
import type { BudgetListResult } from './quota-budgets.service.js'
import {
  LAB_CONSTANT_ESTIMATE,
  LAB_FEATURES,
  QuotaLabService,
  extractLabUsage,
} from './quota-lab.service.js'
import type { LabRunResult } from './quota-lab.service.js'
import { QuotaStatusService } from './quota-status.service.js'
import { MOCK_CHAT_PRESET } from '../ai/mock-usage.presets.js'
import type { MockChatResponse } from '../ai/mock-ai.types.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'
import { requireIdentity } from '../identity/require-identity.js'

/** Serves the quota lab, status, and budget surface. */
@Controller('quota')
export class QuotaController {
  /**
   * @param lab The estimator lab service.
   * @param statusService The access-status read service.
   * @param budgets The budget admin/read service.
   */
  constructor(
    @Inject(QuotaLabService) private readonly lab: QuotaLabService,
    @Inject(QuotaStatusService) private readonly statusService: QuotaStatusService,
    @Inject(QuotaBudgetsService) private readonly budgets: QuotaBudgetsService,
  ) {}

  /**
   * `POST /quota/lab/constant`: the declarative constant-estimate path.
   * The guard reserves a flat 1000-token hold BEFORE the handler; the
   * interceptor settles it from this raw response and exposes the
   * `x-ai-tokens-*` headers.
   *
   * @param body The validated lab body.
   * @returns The raw mock response (the interceptor extracts its usage).
   */
  @Post('lab/constant')
  @HttpCode(HttpStatus.OK)
  @UseGuards(EnforcementGuard)
  @UseInterceptors(MeteringInterceptor)
  @RequireBudget({ estimate: LAB_CONSTANT_ESTIMATE })
  @Meter({
    feature: LAB_FEATURES.constant,
    preset: MOCK_CHAT_PRESET,
    extract: extractLabUsage,
    exposeHeaders: true,
  })
  labConstant(@Body() body: LabRunBodyDto): Promise<MockChatResponse> {
    return this.lab.completeConstant(body)
  }

  /**
   * `POST /quota/lab/model-based`: the programmatic model-based estimator.
   * The service sizes the hold from the requested model (5000 tokens for
   * the flagship, 1000 otherwise) and settles it with the response.
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated lab body.
   * @returns The echo content plus the settled transaction summary.
   */
  @Post('lab/model-based')
  @HttpCode(HttpStatus.OK)
  @UseGuards(EnforcementGuard)
  labModelBased(
    @Req() request: AuthenticatedRequest,
    @Body() body: LabRunBodyDto,
  ): Promise<LabRunResult> {
    return this.lab.runModelBased(requireIdentity(request), body)
  }

  /**
   * `GET /quota/status`: the caller's combined wallet + budget access
   * status. An identity-scoped READ: no guard, no metering (skip semantics
   * are metadata absence).
   *
   * @param request The request carrying the simulated identity.
   * @returns The JSON-safe access status.
   */
  @Get('status')
  status(@Req() request: AuthenticatedRequest): Promise<JsonSafe<AccessStatus>> {
    return this.statusService.status(requireIdentity(request))
  }

  /**
   * `POST /quota/budgets`: create or replace a budget (401 without an
   * identity, 403 for non-admins; see the service's admin-plane note).
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated budget definition.
   * @returns The stored, JSON-safe budget.
   */
  @Post('budgets')
  upsertBudget(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpsertBudgetBodyDto,
  ): Promise<JsonSafe<Budget>> {
    return this.budgets.upsert(requireIdentity(request), body)
  }

  /**
   * `GET /quota/budgets`: the budgets applying to the caller with live
   * window status.
   *
   * @param request The request carrying the simulated identity.
   * @returns The applying budgets and their status rows.
   */
  @Get('budgets')
  listBudgets(@Req() request: AuthenticatedRequest): Promise<BudgetListResult> {
    return this.budgets.list(requireIdentity(request))
  }
}
