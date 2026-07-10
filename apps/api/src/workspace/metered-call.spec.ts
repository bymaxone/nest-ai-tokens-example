/**
 * Unit tests for the hold -> run -> capture/release helper.
 *
 * Layer: unit.
 * Goal: prove the hold is reserved BEFORE the provider function runs (a
 * shortfall rejects without executing it), a provider failure releases the
 * hold and rethrows the ORIGINAL error, and the returned settle/abandon
 * pair drives capture/release with the exact hold, response, preset, and
 * reason.
 * Mocks: the library MeteringService (hold/capture/release double); the
 * provider function is a local stub.
 */
import { describe, expect, it, jest } from '@jest/globals'

import { PROVIDER_FAILURE_REASON, runWithHold } from './metered-call.js'
import { MOCK_CHAT_PRESET } from '../ai/mock-usage.presets.js'
import { holdWith, meteringWith } from '../../test/fixtures/metering.fixture.js'
import { recordWith } from '../../test/fixtures/usage-record.fixture.js'

/** A minimal metering context for the helper under test. */
const context = {
  tenantId: 'acme',
  scope: { type: 'user', id: 'ada' },
  feature: 'unit.test',
} as const

/** A minimal token estimate for the helper under test. */
const estimate = { tokens: 10 } as const

describe('runWithHold', () => {
  /**
   * Hold-first ordering.
   *
   * The reservation happens BEFORE the provider function runs, and the
   * function's result is exposed on the returned call.
   */
  it('reserves the hold, runs the function, and exposes the response', async () => {
    const { metering, holdFn } = meteringWith()
    const order: string[] = []
    holdFn.mockImplementationOnce(() => {
      order.push('hold')
      return Promise.resolve(holdWith())
    })

    const call = await runWithHold(metering, context, estimate, MOCK_CHAT_PRESET, () => {
      order.push('run')
      return Promise.resolve('response')
    })

    expect(call.response).toBe('response')
    expect(order).toEqual(['hold', 'run'])
  })

  /**
   * Shortfall short-circuit.
   *
   * A hold rejection (insufficient credits) propagates untouched and the
   * provider function NEVER runs: no work happens once enforcement says no.
   */
  it('rejects on a hold shortfall without running the function', async () => {
    const { metering, holdFn } = meteringWith()
    const shortfall = new Error('AI_TOKENS_INSUFFICIENT_CREDITS')
    holdFn.mockRejectedValueOnce(shortfall)
    const run = jest.fn(() => Promise.resolve('never'))

    await expect(runWithHold(metering, context, estimate, MOCK_CHAT_PRESET, run)).rejects.toBe(
      shortfall,
    )
    expect(run).not.toHaveBeenCalled()
  })

  /**
   * Provider failure compensation.
   *
   * When the provider function throws, the hold is released with the
   * documented reason and the ORIGINAL error is rethrown (never swallowed
   * or replaced).
   */
  it('releases the hold and rethrows when the function fails', async () => {
    const { metering, releaseFn, hold } = meteringWith()
    const failure = new Error('provider exploded')

    await expect(
      runWithHold(metering, context, estimate, MOCK_CHAT_PRESET, () => Promise.reject(failure)),
    ).rejects.toBe(failure)
    expect(releaseFn).toHaveBeenCalledWith(hold, PROVIDER_FAILURE_REASON)
  })

  /**
   * Settle delegates to capture.
   *
   * `settle()` captures the hold with the response and preset, returning
   * the posted record.
   */
  it('settle() captures the hold with the response and preset', async () => {
    const record = recordWith({ id: 'txn-settle' })
    const { metering, captureFn, hold } = meteringWith(record)

    const call = await runWithHold(metering, context, estimate, MOCK_CHAT_PRESET, () =>
      Promise.resolve('response'),
    )
    const settled = await call.settle()

    expect(settled).toBe(record)
    expect(captureFn).toHaveBeenCalledWith(hold, 'response', MOCK_CHAT_PRESET)
  })

  /**
   * Abandon delegates to release.
   *
   * `abandon(reason)` voids the hold with the caller's reason (the
   * never-bill path for worthless responses).
   */
  it('abandon() releases the hold with the given reason', async () => {
    const { metering, releaseFn, hold } = meteringWith()

    const call = await runWithHold(metering, context, estimate, MOCK_CHAT_PRESET, () =>
      Promise.resolve('response'),
    )
    await call.abandon('unparseable response content')

    expect(releaseFn).toHaveBeenCalledWith(hold, 'unparseable response content')
  })
})
