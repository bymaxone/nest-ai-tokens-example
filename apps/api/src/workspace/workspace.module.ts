/**
 * @fileoverview Workspace module: the demo domain's command surface over
 * the mock inference layer. The library's metering services resolve from
 * the global dynamic module, so only the inference module is imported.
 *
 * @layer workspace
 */
import { Module } from '@nestjs/common'

import { WorkspaceCommandService } from './workspace-command.service.js'
import { WorkspaceEmbeddingService } from './workspace-embedding.service.js'
import { WorkspaceModelsService } from './workspace-models.service.js'
import { WorkspaceController } from './workspace.controller.js'
import { MockAiModule } from '../ai/mock-ai.module.js'

/** Wires the workspace command, embedding, and models endpoints. */
@Module({
  imports: [MockAiModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceCommandService, WorkspaceEmbeddingService, WorkspaceModelsService],
})
export class WorkspaceModule {}
