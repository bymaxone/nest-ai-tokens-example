/**
 * @fileoverview Application root module: composes the configuration layer and
 * the root controller. Feature modules (identity, ai wiring, health, and the
 * domain modules that follow) join this imports list as they land.
 *
 * @layer module
 */
import { Module } from '@nestjs/common'

import { AiModule } from './ai/ai.module.js'
import { AppController } from './app.controller.js'
import { AppConfigModule } from './config/app-config.module.js'
import { IdentityModule } from './identity/identity.module.js'

/** The composition root of the API. */
@Module({
  imports: [AppConfigModule, IdentityModule, AiModule],
  controllers: [AppController],
})
export class AppModule {}
