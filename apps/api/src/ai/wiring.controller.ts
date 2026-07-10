/**
 * @fileoverview Debug route `GET /health/wiring`: returns the wiring smoke
 * report. Lives under `/health` so it stays reachable without a demo
 * identity (the identity middleware excludes the health tree).
 *
 * @layer controller
 */
import { Controller, Get, Inject } from '@nestjs/common'

import { WiringService } from './wiring.service.js'
import type { WiringReport, WiringReporter } from './wiring.service.js'

/** Serves the wiring smoke report. */
@Controller('health')
export class WiringController {
  /**
   * @param wiring The wiring smoke service (interface-typed so the emitted
   *   decorator metadata stays free of unreachable `typeof` guards; the
   *   explicit `@Inject` carries resolution).
   */
  constructor(@Inject(WiringService) private readonly wiring: WiringReporter) {}

  /**
   * Report the library registration and the effective options.
   *
   * @returns The wiring report.
   */
  @Get('wiring')
  getWiring(): WiringReport {
    return this.wiring.describeWiring()
  }
}
