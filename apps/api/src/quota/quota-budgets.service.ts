/**
 * @fileoverview Budget administration and listing over the library's
 * `BudgetService`. Upserts are ADMIN PLANE per the library's docs: the demo
 * restricts them to the fixed global admin (`root`), standing in for real
 * role-based access, and the admin targets a tenant by sending
 * `x-tenant-id`. Listing is caller-scoped: a user sees the budgets that
 * apply to them (their exact scope plus tenant-wide rows) with live window
 * status. The library binds `BudgetService` to `null` when the budgets
 * block is disabled; these endpoints then answer 503 with the app's
 * canonical envelope instead of crashing.
 *
 * @layer quota
 */
import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { BudgetService, toJsonSafe } from '@bymax-one/nest-ai-tokens'
import type { Budget, BudgetStatus, JsonSafe, UpsertBudgetInput } from '@bymax-one/nest-ai-tokens'

import type { UpsertBudgetBody } from './dto/upsert-budget.body.js'
import { tenantIdOf } from '../ai/metering-context.js'
import { ApiException } from '../common/api-exception.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

/**
 * The only identity allowed to mutate budgets. Demo convention: `root`
 * stands in for real role-based access with its fixed global admin.
 */
export const BUDGET_ADMIN_USER_ID = 'root'

/** The caller-scoped budget listing. */
export interface BudgetListResult {
  /** The budgets applying to the caller (exact scope + tenant-wide). */
  readonly budgets: JsonSafe<Budget>[]
  /** One live window status per applying budget. */
  readonly status: JsonSafe<BudgetStatus>[]
}

/** Serves the `/quota/budgets` admin and read surface. */
@Injectable()
export class QuotaBudgetsService {
  /**
   * @param budgets The library budget service, or `null` when disabled.
   */
  constructor(@Inject(BudgetService) private readonly budgets: BudgetService | null) {}

  /**
   * Create or replace a budget for a subject in the admin's target tenant.
   *
   * @param identity The caller (must be the demo admin; the effective
   *   tenant comes from `x-tenant-id` or the admin's own tenant mapping).
   * @param body The validated budget definition.
   * @returns The stored, JSON-safe budget.
   * @throws {ForbiddenException} when the caller is not the demo admin.
   * @throws {ApiException} `quota.disabled` (503) when budgets are off.
   * @throws {AiTokensException} the library's validation verdicts.
   */
  async upsert(identity: DemoIdentity, body: UpsertBudgetBody): Promise<JsonSafe<Budget>> {
    if (identity.id !== BUDGET_ADMIN_USER_ID) {
      throw new ForbiddenException('Budget administration is restricted to the demo admin (root)')
    }
    const input: UpsertBudgetInput = {
      tenantId: tenantIdOf(identity),
      scope: { type: body.scopeType, id: body.scopeId },
      window: body.window,
      ...(body.limitNanoUsd === undefined ? {} : { limitNanoUsd: body.limitNanoUsd }),
      ...(body.limitTokens === undefined ? {} : { limitTokens: body.limitTokens }),
      ...(body.limitCount === undefined ? {} : { limitCount: body.limitCount }),
      ...(body.policy === undefined ? {} : { policy: body.policy }),
      ...(body.features === undefined ? {} : { features: body.features }),
    }
    const budget = await this.require().upsertBudget(input)
    return toJsonSafe(budget)
  }

  /**
   * The budgets that apply to the caller, with live window status.
   *
   * @param identity The request identity (the listed scope).
   * @returns The applying budgets and their status rows.
   * @throws {ApiException} `quota.disabled` (503) when budgets are off.
   */
  async list(identity: DemoIdentity): Promise<BudgetListResult> {
    const budgets = this.require()
    const tenantId = tenantIdOf(identity)
    const scope = { type: 'user', id: identity.id } as const
    const [rows, status] = await Promise.all([
      budgets.list(tenantId, scope),
      budgets.status(tenantId, scope),
    ])
    return { budgets: toJsonSafe(rows), status: toJsonSafe(status) }
  }

  /** The budget service, or the documented 503 when the block is off. */
  private require(): BudgetService {
    if (this.budgets === null) {
      throw new ApiException(
        'quota.disabled',
        503,
        'Budget endpoints require the budgets feature block (set QUOTA_ENABLED=true).',
      )
    }
    return this.budgets
  }
}
