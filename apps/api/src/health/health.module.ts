/**
 * @fileoverview Health module: liveness/readiness probes over the Prisma
 * client.
 *
 * @layer module
 */
import { Module } from '@nestjs/common'

import { HealthController } from './health.controller.js'
import { PrismaModule } from '../prisma/prisma.module.js'

/** Wires the health probes. */
@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class HealthModule {}
