/**
 * @fileoverview Store module: provides the persistence adapter that
 * `BymaxAiTokensModule.forRootAsync` injects into its options factory
 * (a dynamic module can only inject from its own imports, so the store
 * travels in a small dedicated module). The adapter is the library's own
 * `PrismaAiTokensStore` (the official PostgreSQL implementation of
 * `IAiTokensStore`, shipped under `@bymax-one/nest-ai-tokens/prisma`),
 * constructed with the application's Prisma client so it talks to the same
 * database, pool, and schema as the rest of the app.
 *
 * @layer ai
 */
import { Module } from '@nestjs/common'
import { PrismaAiTokensStore } from '@bymax-one/nest-ai-tokens/prisma'

import { PrismaModule } from '../prisma/prisma.module.js'
import { PrismaService } from '../prisma/prisma.service.js'

/** DI token under which the `IAiTokensStore` implementation is provided. */
export const AI_TOKENS_STORE = Symbol('AI_TOKENS_STORE')

/**
 * Construct the official Prisma-backed store over the application client.
 *
 * The default grant burn order (`'expiry'`) is kept: it must match the
 * module's `wallets.burnOrder`, which this app also leaves at its default.
 *
 * @param prisma The application Prisma client.
 * @returns The store handed to `BymaxAiTokensModuleOptions.store`.
 */
export function createPrismaAiTokensStore(prisma: PrismaService): PrismaAiTokensStore {
  return new PrismaAiTokensStore(prisma)
}

/** Provides and exports the `IAiTokensStore` implementation. */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: AI_TOKENS_STORE,
      useFactory: createPrismaAiTokensStore,
      inject: [PrismaService],
    },
  ],
  exports: [AI_TOKENS_STORE],
})
export class AiStoreModule {}
