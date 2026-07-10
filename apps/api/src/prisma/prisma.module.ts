/**
 * @fileoverview Prisma module: provides the application Prisma client to the
 * modules that persist or probe the database.
 *
 * @layer prisma
 */
import { Module } from '@nestjs/common'

import { PrismaService } from './prisma.service.js'

/** Provides and exports the application Prisma client. */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
