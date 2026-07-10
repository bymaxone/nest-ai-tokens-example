/**
 * @fileoverview Store module: provides the persistence adapter that
 * `BymaxAiTokensModule.forRootAsync` injects into its options factory
 * (a dynamic module can only inject from its own imports, so the store
 * travels in a small dedicated module). Swapping in the Prisma-backed store
 * later means swapping this one provider.
 *
 * @layer ai
 */
import { Module } from '@nestjs/common'

import { PlaceholderAiTokensStore } from './placeholder-ai-tokens.store.js'

/** Provides and exports the `IAiTokensStore` implementation. */
@Module({
  providers: [PlaceholderAiTokensStore],
  exports: [PlaceholderAiTokensStore],
})
export class AiStoreModule {}
