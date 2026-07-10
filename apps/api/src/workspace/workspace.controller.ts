/**
 * @fileoverview `/workspace` routes: the five command endpoints, the two
 * embedding endpoints, and the models info read. Thin controllers -
 * identity extraction plus delegation; the services own the inference
 * calls, the billing semantics, and the metering. Commands respond 200
 * (they run an operation; the created ledger row is a side effect the
 * response references by `transactionId`). `GET /workspace/models` is
 * deliberately identity-free: it meters nothing and carries NO guard, the
 * inert path the enforcement surface contrasts against.
 *
 * Enforcement: every metered handler wears the null-tolerant
 * `EnforcementGuard` (the library's `BudgetGuard` underneath), so an
 * exhausted hard budget rejects pre-handler and a missing identity rejects
 * 401 through the module `scopeResolver`; wallet enforcement itself happens
 * in the services via tolerance-scaled spend holds. Opting OUT is metadata
 * absence, not a marker decorator: an unguarded handler is never checked
 * and an un-`@Meter`ed handler is never intercepted.
 *
 * @layer workspace
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
} from '@nestjs/common'

import { AnalyzeBodyDto } from './dto/analyze.body.js'
import { CustomBodyDto } from './dto/custom.body.js'
import { EmbedBatchBodyDto } from './dto/embed-batch.body.js'
import { EmbedBodyDto } from './dto/embed.body.js'
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
import { WorkspaceEmbeddingService } from './workspace-embedding.service.js'
import type { EmbedBatchResult, EmbedResult } from './workspace-embedding.service.js'
import { WorkspaceModelsService } from './workspace-models.service.js'
import type { ModelsInfo } from './workspace-models.service.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'
import { requireIdentity } from '../identity/require-identity.js'
import { EnforcementGuard } from '../ai/enforcement.guard.js'

/** Serves the workspace command surface. */
@Controller('workspace')
export class WorkspaceController {
  /**
   * @param commands The workspace command service.
   * @param embeddings The workspace embedding service.
   * @param models The models info service.
   */
  constructor(
    @Inject(WorkspaceCommandService) private readonly commands: WorkspaceCommandService,
    @Inject(WorkspaceEmbeddingService) private readonly embeddings: WorkspaceEmbeddingService,
    @Inject(WorkspaceModelsService) private readonly models: WorkspaceModelsService,
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
  @UseGuards(EnforcementGuard)
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
  @UseGuards(EnforcementGuard)
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
  @UseGuards(EnforcementGuard)
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
  @UseGuards(EnforcementGuard)
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
  @UseGuards(EnforcementGuard)
  custom(@Req() request: AuthenticatedRequest, @Body() body: CustomBodyDto): Promise<CustomResult> {
    return this.commands.custom(requireIdentity(request), body)
  }

  /**
   * `POST /workspace/embed`: embed one text (one ledger row).
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated embed body.
   * @returns The vector plus the usage view.
   */
  @Post('embed')
  @HttpCode(HttpStatus.OK)
  @UseGuards(EnforcementGuard)
  embed(@Req() request: AuthenticatedRequest, @Body() body: EmbedBodyDto): Promise<EmbedResult> {
    return this.embeddings.embed(requireIdentity(request), body)
  }

  /**
   * `POST /workspace/embed/batch`: embed up to 50 texts as ONE aggregate
   * transaction.
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated batch body.
   * @returns The vectors plus the single-record usage view.
   */
  @Post('embed/batch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(EnforcementGuard)
  embedBatch(
    @Req() request: AuthenticatedRequest,
    @Body() body: EmbedBatchBodyDto,
  ): Promise<EmbedBatchResult> {
    return this.embeddings.embedBatch(requireIdentity(request), body)
  }

  /**
   * `GET /workspace/models`: default models plus current pricing badges.
   * Identity-free and unmetered by design (a pure read).
   *
   * @returns The models info payload.
   */
  @Get('models')
  describeModels(): Promise<ModelsInfo> {
    return this.models.describeModels()
  }
}
