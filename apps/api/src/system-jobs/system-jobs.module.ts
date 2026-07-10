/**
 * @fileoverview System-jobs module: the platform-absorbed cost simulations
 * over the mock inference layer. The library's metering facade resolves
 * from the global dynamic module, so only the inference module is
 * imported.
 *
 * @layer system-jobs
 */
import { Module } from '@nestjs/common'

import { SystemJobsController } from './system-jobs.controller.js'
import { SystemJobsService } from './system-jobs.service.js'
import { MockAiModule } from '../ai/mock-ai.module.js'

/** Wires the system-job endpoints. */
@Module({
  imports: [MockAiModule],
  controllers: [SystemJobsController],
  providers: [SystemJobsService],
})
export class SystemJobsModule {}
