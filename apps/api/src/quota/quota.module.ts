/**
 * @fileoverview Quota module: the enforcement demo surface: the estimator
 * lab, the access-status read, and the budget admin/read endpoints. The
 * library's wallet/budget services, guard, and interceptor resolve from
 * the global dynamic module; the shared ai layer contributes the
 * null-tolerant `EnforcementGuard`.
 *
 * @layer quota
 */
import { Module } from '@nestjs/common'

import { QuotaBudgetsService } from './quota-budgets.service.js'
import { QuotaLabService } from './quota-lab.service.js'
import { QuotaStatusService } from './quota-status.service.js'
import { QuotaController } from './quota.controller.js'
import { EnforcementGuard } from '../ai/enforcement.guard.js'
import { MockAiModule } from '../ai/mock-ai.module.js'

/** Wires the quota lab, status, budgets, and enforcement primitives. */
@Module({
  imports: [MockAiModule],
  controllers: [QuotaController],
  providers: [EnforcementGuard, QuotaBudgetsService, QuotaLabService, QuotaStatusService],
})
export class QuotaModule {}
