/**
 * @fileoverview Identity module: registers the demo identity middleware on
 * every route except the health endpoints (liveness, readiness, and the
 * wiring smoke route stay reachable without an identity).
 *
 * @layer identity
 */
import { Module } from '@nestjs/common'
import type { MiddlewareConsumer, NestModule } from '@nestjs/common'

import { IdentityMiddleware } from './identity.middleware.js'

/** Wires the simulated identity resolution into the request pipeline. */
@Module({ providers: [IdentityMiddleware] })
export class IdentityModule implements NestModule {
  /**
   * Apply the demo identity middleware globally, excluding `/health/*`.
   *
   * @param consumer The middleware consumer for route binding.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(IdentityMiddleware).exclude('health/{*splat}').forRoutes('{*splat}')
  }
}
