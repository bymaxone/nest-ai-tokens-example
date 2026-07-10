/**
 * @fileoverview Null-tolerant wrapper over the library's `BudgetGuard`. The
 * dynamic module registers `BudgetGuard` unconditionally but resolves it to
 * `null` when the `budgets` feature block is disabled (`QUOTA_ENABLED=false`),
 * so referencing the class directly in `@UseGuards` would crash on the
 * disabled path. This wrapper delegates when the guard exists and allows
 * everything when enforcement is off: the metered handlers keep ONE stable
 * decorator across both configurations.
 *
 * With enforcement on, the inner guard resolves the caller through the
 * module `scopeResolver` (401 without a demo identity), blocks pre-handler
 * on any exhausted hard budget (402 spend / 429 tokens-or-count, canonical
 * envelope), and enriches `request.aiTokens` for the interceptor path.
 *
 * @layer ai
 */
import { Inject, Injectable } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { BudgetGuard } from '@bymax-one/nest-ai-tokens'

/** Delegates to `BudgetGuard` when budgets are enabled; else allows. */
@Injectable()
export class EnforcementGuard implements CanActivate {
  /**
   * @param guard The library guard, or `null` when budgets are disabled.
   */
  constructor(@Inject(BudgetGuard) private readonly guard: BudgetGuard | null) {}

  /**
   * Run the library's pre-handler budget check, or allow when enforcement
   * is disabled.
   *
   * @param context The request execution context.
   * @returns `true` when the request may proceed.
   * @throws {AiTokensException} `AI_TOKENS_BUDGET_EXCEEDED` /
   *   `AI_TOKENS_QUOTA_EXCEEDED` when a hard budget is exhausted.
   */
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    return this.guard === null ? true : this.guard.canActivate(context)
  }
}
