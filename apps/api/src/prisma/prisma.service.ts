/**
 * @fileoverview Application Prisma client: a `PrismaClient` connected through
 * the pg driver adapter with the URL from the typed environment (the runtime
 * client never reads a schema URL; see `prisma.config.ts` for the CLI side).
 * Connections are lazy; the client disconnects on module destroy so shutdown
 * hooks and test teardowns leave no open handles.
 *
 * @layer prisma
 */
import { Inject, Injectable } from '@nestjs/common'
import type { OnModuleDestroy } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

import { ENV_CONFIG } from '../config/env.js'
import type { EnvConfig } from '../config/env.js'

/** The Prisma client provided to the rest of the application. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  /**
   * @param env The typed environment carrying the datasource URL.
   */
  constructor(@Inject(ENV_CONFIG) env: EnvConfig) {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) })
  }

  /** Disconnect on shutdown so no pool handle outlives the application. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
