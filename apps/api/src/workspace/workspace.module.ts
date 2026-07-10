/**
 * @fileoverview Workspace module: the demo domain's command surface over
 * the mock inference layer. The library's metering services resolve from
 * the global dynamic module; the shared ai layer contributes the
 * null-tolerant enforcement guard the metered handlers wear.
 *
 * @layer workspace
 */
import { Module } from '@nestjs/common'

import { WorkspaceCommandService } from './workspace-command.service.js'
import { WorkspaceEmbeddingService } from './workspace-embedding.service.js'
import { WorkspaceModelsService } from './workspace-models.service.js'
import { WorkspaceController } from './workspace.controller.js'
import { EnforcementGuard } from '../ai/enforcement.guard.js'
import { MockAiModule } from '../ai/mock-ai.module.js'

/** Wires the workspace command, embedding, and models endpoints. */
@Module({
  imports: [MockAiModule],
  controllers: [WorkspaceController],
  providers: [
    EnforcementGuard,
    WorkspaceCommandService,
    WorkspaceEmbeddingService,
    WorkspaceModelsService,
  ],
  // The errors-demo module drives its marker triggers through the real
  // command path, so the command service is part of this module's API.
  exports: [WorkspaceCommandService],
})
export class WorkspaceModule {}
