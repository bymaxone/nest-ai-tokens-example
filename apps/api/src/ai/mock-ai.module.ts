/**
 * @fileoverview Mock inference module: provides the deterministic
 * {@link MockAiProvider} with its latency knob wired from the typed
 * environment (`MOCK_LATENCY_MS`, zero in tests and CI). Feature modules
 * that need inference import this module; swapping in a real SDK means
 * swapping this one binding.
 *
 * @layer ai
 */
import { Module } from '@nestjs/common'

import { MOCK_AI_PROVIDER_OPTIONS, MockAiProvider } from './mock-ai.provider.js'
import type { MockAiProviderOptions } from './mock-ai.provider.js'
import { ENV_CONFIG } from '../config/env.js'
import type { EnvConfig } from '../config/env.js'

/**
 * Build the provider options from the typed environment.
 *
 * @param env The typed environment configuration.
 * @returns The mock provider options.
 */
export function mockAiProviderOptionsFactory(env: EnvConfig): MockAiProviderOptions {
  return { latencyMs: env.MOCK_LATENCY_MS }
}

/** Provides and exports the deterministic mock inference layer. */
@Module({
  providers: [
    {
      provide: MOCK_AI_PROVIDER_OPTIONS,
      useFactory: mockAiProviderOptionsFactory,
      inject: [ENV_CONFIG],
    },
    MockAiProvider,
  ],
  exports: [MockAiProvider],
})
export class MockAiModule {}
