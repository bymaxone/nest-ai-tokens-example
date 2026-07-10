/**
 * @fileoverview `/workspace` routes: the five command endpoints. Thin
 * controllers — identity extraction plus delegation; the command service
 * owns the inference call, the billing semantics, and the metering.
 * Commands respond 200 (they run an operation; the created ledger row is a
 * side effect the response references by `transactionId`).
 *
 * @layer workspace
 */
import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common'

import { AnalyzeBodyDto } from './dto/analyze.body.js'
import { CustomBodyDto } from './dto/custom.body.js'
import { RewriteBodyDto } from './dto/rewrite.body.js'
import { SummarizeBodyDto } from './dto/summarize.body.js'
import { TranslateBodyDto } from './dto/translate.body.js'
import { WorkspaceCommandService } from './workspace-command.service.js'
import type {
  AnalyzeResult,
  CustomResult,
  RewriteResult,
  SummarizeResult,
  TranslateResult,
} from './workspace-command.service.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'
import { requireIdentity } from '../identity/require-identity.js'

/** Serves the workspace command surface. */
@Controller('workspace')
export class WorkspaceController {
  /**
   * @param commands The workspace command service.
   */
  constructor(
    @Inject(WorkspaceCommandService) private readonly commands: WorkspaceCommandService,
  ) {}

  /**
   * `POST /workspace/translate`: translate into one or more languages.
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated translate body.
   * @returns Translations plus the usage view.
   */
  @Post('translate')
  @HttpCode(HttpStatus.OK)
  translate(
    @Req() request: AuthenticatedRequest,
    @Body() body: TranslateBodyDto,
  ): Promise<TranslateResult> {
    return this.commands.translate(requireIdentity(request), body)
  }

  /**
   * `POST /workspace/summarize`: summarize with the style picker.
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated summarize body.
   * @returns The summary plus the usage view.
   */
  @Post('summarize')
  @HttpCode(HttpStatus.OK)
  summarize(
    @Req() request: AuthenticatedRequest,
    @Body() body: SummarizeBodyDto,
  ): Promise<SummarizeResult> {
    return this.commands.summarize(requireIdentity(request), body)
  }

  /**
   * `POST /workspace/rewrite`: rewrite under a style.
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated rewrite body.
   * @returns The rewrite plus the usage view.
   */
  @Post('rewrite')
  @HttpCode(HttpStatus.OK)
  rewrite(
    @Req() request: AuthenticatedRequest,
    @Body() body: RewriteBodyDto,
  ): Promise<RewriteResult> {
    return this.commands.rewrite(requireIdentity(request), body)
  }

  /**
   * `POST /workspace/analyze`: analyze against the fixed schema.
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated analyze body.
   * @returns The typed analysis plus the usage view.
   */
  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  analyze(
    @Req() request: AuthenticatedRequest,
    @Body() body: AnalyzeBodyDto,
  ): Promise<AnalyzeResult> {
    return this.commands.analyze(requireIdentity(request), body)
  }

  /**
   * `POST /workspace/custom`: the caller-shaped escape hatch.
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated custom body.
   * @returns The raw content plus the usage view.
   */
  @Post('custom')
  @HttpCode(HttpStatus.OK)
  custom(@Req() request: AuthenticatedRequest, @Body() body: CustomBodyDto): Promise<CustomResult> {
    return this.commands.custom(requireIdentity(request), body)
  }
}
