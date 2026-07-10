/**
 * @fileoverview Quota module: the enforcement demo surface. Contributes the
 * app-owned, null-tolerant `EnforcementGuard` (shared with the workspace),
 * the estimator lab, the access-status read, and the budget admin/read
 * endpoints. The library's wallet/budget services, guard, and interceptor
 * resolve from the global dynamic module; only the mock inference module is
 * imported.
 *
 * @layer quota
 */
import { Module } from '@nestjs/common'

import { EnforcementGuard } from './enforcement.guard.js'
import { QuotaBudgetsService } from './quota-budgets.service.js'
import { QuotaLabService } from './quota-lab.service.js'
import { QuotaStatusService } from './quota-status.service.js'
import { QuotaController } from './quota.controller.js'
import { MockAiModule } from '../ai/mock-ai.module.js'

/** Wires the quota lab, status, budgets, and enforcement primitives. */
@Module({
  imports: [MockAiModule],
  controllers: [QuotaController],
  providers: [EnforcementGuard, QuotaBudgetsService, QuotaLabService, QuotaStatusService],
  exports: [EnforcementGuard],
})
export class QuotaModule {}
