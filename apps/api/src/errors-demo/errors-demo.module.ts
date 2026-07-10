/**
 * @fileoverview Errors-demo module: the on-demand error-catalog surface.
 * The library services resolve from the global dynamic module; the
 * workspace module contributes the command service the marker-driven
 * triggers run through.
 *
 * @layer errors-demo
 */
import { Module } from '@nestjs/common'

import { ErrorsDemoController } from './errors-demo.controller.js'
import { ErrorsDemoService } from './errors-demo.service.js'
import { WorkspaceModule } from '../workspace/workspace.module.js'

/** Wires the error-catalog listing and trigger endpoints. */
@Module({
  imports: [WorkspaceModule],
  controllers: [ErrorsDemoController],
  providers: [ErrorsDemoService],
})
export class ErrorsDemoModule {}
