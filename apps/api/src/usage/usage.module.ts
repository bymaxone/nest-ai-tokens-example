/**
 * @fileoverview Usage module: the chart-ready analytics surface over the
 * library's report service. The library's report and wallet services
 * resolve from the global dynamic module, so no imports are needed here.
 *
 * @layer usage
 */
import { Module } from '@nestjs/common'

import { UsageAnalyticsService } from './usage-analytics.service.js'
import { UsageController } from './usage.controller.js'

/** Wires the usage analytics endpoints. */
@Module({
  controllers: [UsageController],
  providers: [UsageAnalyticsService],
})
export class UsageModule {}
