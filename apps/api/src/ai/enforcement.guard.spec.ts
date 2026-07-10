/**
 * Unit tests for the null-tolerant enforcement guard.
 *
 * Layer: unit.
 * Goal: prove the wrapper delegates to the library's BudgetGuard when the
 * budgets feature is enabled (passing the execution context through and
 * surfacing its verdicts and errors untouched) and allows every request
 * when the library bound the guard to null (QUOTA_ENABLED=false).
 * Mocks: a BudgetGuard double (canActivate only) and a bare execution
 * context sentinel; the wrapper reads nothing else.
 */
import { describe, expect, it, jest } from '@jest/globals'
import type { ExecutionContext } from '@nestjs/common'
import type { BudgetGuard } from '@bymax-one/nest-ai-tokens'

import { EnforcementGuard } from './enforcement.guard.js'

/** A sentinel execution context; the wrapper only forwards it. */
const executionContext = { getHandler: () => undefined } as unknown as ExecutionContext

/** A BudgetGuard double exposing only the delegated method. */
function guardWith(canActivate: jest.Mock<BudgetGuard['canActivate']>): BudgetGuard {
  const double: Pick<BudgetGuard, 'canActivate'> = { canActivate }
  // Single widening assertion at the fixture boundary: the wrapper consumes
  // exactly this method of the class type.
  return double as BudgetGuard
}

describe('EnforcementGuard', () => {
  /**
   * Enabled path: full delegation.
   *
   * With budgets enabled, the wrapper forwards the execution context to
   * the library guard and returns its verdict, so enforcement semantics
   * are exactly the library's.
   */
  it('delegates to the library guard when budgets are enabled', async () => {
    const canActivate = jest.fn<BudgetGuard['canActivate']>().mockResolvedValue(true)
    const guard = new EnforcementGuard(guardWith(canActivate))

    await expect(guard.canActivate(executionContext)).resolves.toBe(true)
    expect(canActivate).toHaveBeenCalledWith(executionContext)
  })

  /**
   * Enabled path: rejections surface untouched.
   *
   * A guard rejection (exhausted hard budget, missing identity) propagates
   * as-is: the wrapper adds no handling that could mask the canonical error.
   */
  it('surfaces the library guard rejection untouched', async () => {
    const blocked = new Error('AI_TOKENS_BUDGET_EXCEEDED')
    const canActivate = jest.fn<BudgetGuard['canActivate']>().mockRejectedValue(blocked)
    const guard = new EnforcementGuard(guardWith(canActivate))

    await expect(guard.canActivate(executionContext)).rejects.toBe(blocked)
  })

  /**
   * Disabled path: allow everything.
   *
   * The library binds BudgetGuard to null when the budgets block is off
   * (QUOTA_ENABLED=false); the wrapper then allows the request so the
   * metered routes stay reachable in the observe-only configuration.
   */
  it('allows the request when the library guard resolved to null', () => {
    const guard = new EnforcementGuard(null)

    expect(guard.canActivate(executionContext)).toBe(true)
  })
})
