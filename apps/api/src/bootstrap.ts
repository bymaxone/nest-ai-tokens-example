/**
 * @fileoverview Application factory and boot sequence. `createApp()` is the
 * seam shared by production boot and the e2e harness, so end-to-end tests
 * exercise the exact wiring that ships: same module graph, same global pipe,
 * same shutdown hooks. `bootstrap()` adds the listener and the fail-fast
 * environment report; importing this file never opens a port.
 *
 * @layer bootstrap
 */
import { Logger } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module.js'
import { ZodValidationPipe } from './common/zod-validation.pipe.js'
import { ENV_CONFIG, EnvValidationError } from './config/env.js'
import type { EnvConfig } from './config/env.js'

const logger = new Logger('Bootstrap')

/**
 * Create the fully configured application without listening. This is the
 * production wiring; the e2e harness boots through this same function.
 *
 * @returns The configured, initialized application.
 * @throws {EnvValidationError} when the environment fails validation.
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { abortOnError: false })
  app.useGlobalPipes(new ZodValidationPipe())
  // The dashboard is served from a different origin than the API (web on one
  // port, API on another), so the browser's client-side fetches are
  // cross-origin. Grant CORS only to the configured origin allow-list;
  // identity travels in plain custom headers, never cookies, so credentials
  // are not reflected and only the demo identity headers are allowed.
  const env = app.get<EnvConfig>(ENV_CONFIG)
  app.enableCors({
    origin: env.WEB_ORIGIN,
    allowedHeaders: ['content-type', 'x-demo-user', 'x-tenant-id'],
  })
  app.enableShutdownHooks()
  // Initialize explicitly: listen() would do it lazily, but the e2e harness
  // drives the HTTP server without listening on a port.
  await app.init()
  return app
}

/**
 * Report a boot failure without ever printing configuration values: an
 * environment failure prints its value-free report (variable names and issue
 * descriptions), anything else prints its message only.
 *
 * @param error The boot failure.
 */
export function reportBootFailure(error: unknown): void {
  if (error instanceof EnvValidationError) {
    logger.error('Invalid environment configuration:')
    for (const line of error.report) logger.error(`  - ${line}`)
    return
  }
  logger.error(error instanceof Error ? error.message : 'Unknown boot failure')
}

/**
 * Boot the API: create the app and listen on the configured port. On any
 * failure the error is reported value-free, the process exit code is set to
 * a non-zero value, and the error is rethrown for the entry point.
 *
 * @returns The listening application.
 * @throws The original boot failure, after reporting it.
 */
export async function bootstrap(): Promise<INestApplication> {
  try {
    const app = await createApp()
    const env = app.get<EnvConfig>(ENV_CONFIG)
    await app.listen(env.PORT)
    logger.log(`API listening on port ${env.PORT}`)
    return app
  } catch (error) {
    reportBootFailure(error)
    process.exitCode = 1
    throw error
  }
}
