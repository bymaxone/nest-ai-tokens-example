/**
 * @fileoverview Global configuration module: validates the environment once
 * at boot and exposes the typed result under the {@link ENV_CONFIG} token.
 * A validation failure rejects application creation, so the process fails
 * fast before any listener opens.
 *
 * @layer config
 */
import { Global, Module } from '@nestjs/common'

import { ENV_CONFIG, loadEnvFromProcess } from './env.js'

/**
 * Provides the parsed {@link EnvConfig} app-wide. Global so feature modules
 * inject `ENV_CONFIG` without importing this module explicitly.
 */
@Global()
@Module({
  providers: [{ provide: ENV_CONFIG, useFactory: loadEnvFromProcess }],
  exports: [ENV_CONFIG],
})
export class AppConfigModule {}
