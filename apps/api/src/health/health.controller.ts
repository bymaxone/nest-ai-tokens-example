/**
 * @fileoverview Health endpoints: `/health/live` (process up) and
 * `/health/ready` (database reachable via `SELECT 1`). Excluded from the
 * identity middleware so orchestrators can probe without headers. The
 * readiness failure body is value-free: it names the condition, never the
 * underlying driver error (which could carry connection details).
 *
 * @layer controller
 */
import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service.js'

/** The health payload for both probes. */
export interface HealthStatus {
  /** 'up' when the probe passed. */
  readonly status: 'up'
}

/**
 * The narrow database contract the readiness probe needs (interface-typed so
 * the emitted decorator metadata stays free of unreachable guards; the
 * explicit `@Inject` carries resolution).
 */
export interface DatabasePinger {
  /** Prisma's tagged-template raw query. */
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
}

/** Serves the liveness and readiness probes. */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  /**
   * @param prisma The application Prisma client (readiness ping).
   */
  constructor(@Inject(PrismaService) private readonly prisma: DatabasePinger) {}

  /**
   * Liveness: the process is up and serving.
   *
   * @returns Always `{ status: 'up' }`.
   */
  @Get('live')
  getLive(): HealthStatus {
    return { status: 'up' }
  }

  /**
   * Readiness: the database answers `SELECT 1`.
   *
   * @returns `{ status: 'up' }` when the database is reachable.
   * @throws {ServiceUnavailableException} 503 `{ status: 'down', reason }`
   *   when it is not (value-free reason; the driver error is not surfaced).
   */
  @Get('ready')
  async getReady(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { status: 'up' }
    } catch {
      // Deliberately value-free: driver errors can embed connection details.
      this.logger.warn('readiness probe failed: database unreachable')
      throw new ServiceUnavailableException({ status: 'down', reason: 'database unreachable' })
    }
  }
}
