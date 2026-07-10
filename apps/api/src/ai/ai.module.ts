/**
 * @fileoverview AI module: registers `@bymax-one/nest-ai-tokens` through the
 * canonical `forRootAsync` factory (the resulting dynamic module is
 * `@Global()` by construction, so its services and tokens are injectable
 * app-wide) and exposes the wiring smoke route. The constructor-metadata
 * shim runs before registration; see `library-metadata.shim.ts`.
 *
 * @layer ai
 */
import { Module } from '@nestjs/common'
import { BymaxAiTokensModule } from '@bymax-one/nest-ai-tokens'

import { aiTokensOptionsFactory } from './ai-tokens.config.js'
import { AI_TOKENS_STORE, AiStoreModule } from './ai-store.module.js'
import { applyLibraryParamtypesShim } from './library-metadata.shim.js'
import { ENV_CONFIG } from '../config/env.js'
import { WiringController } from './wiring.controller.js'
import { WiringService } from './wiring.service.js'

applyLibraryParamtypesShim()

/** Registers the library and the wiring smoke surface. */
@Module({
  imports: [
    BymaxAiTokensModule.forRootAsync({
      imports: [AiStoreModule],
      inject: [ENV_CONFIG, AI_TOKENS_STORE],
      useFactory: aiTokensOptionsFactory,
    }),
  ],
  controllers: [WiringController],
  providers: [WiringService],
})
export class AiModule {}
