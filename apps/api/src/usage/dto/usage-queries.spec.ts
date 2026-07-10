/**
 * Unit tests for the usage analytics query DTOs.
 *
 * Layer: unit.
 * Goal: prove the window validation (inverted and over-cap windows
 * rejected, half-open windows allowed), the whitelisted granularities and
 * scope switch, the topN bounds, the category bounds, and the pure
 * default-window resolver.
 * Mocks: none (schemas + a fixed clock).
 */
import { describe, expect, it } from '@jest/globals'

import {
  DEFAULT_TOP_N,
  DEFAULT_WINDOW_DAYS,
  MAX_TOP_N,
  MAX_WINDOW_DAYS,
  MS_PER_DAY,
  byPeriodQuerySchema,
  resolveWindow,
  systemCostsQuerySchema,
  topConsumersQuerySchema,
  usageWindowQuerySchema,
} from './usage-queries.js'

describe('usageWindowQuerySchema', () => {
  /**
   * Defaults and coercion.
   *
   * An empty query defaults to the caller scope with no explicit bounds;
   * ISO strings coerce to dates.
   */
  it('defaults to caller scope and coerces ISO bounds', () => {
    expect(usageWindowQuerySchema.parse({})).toEqual({ scope: 'me' })
    const parsed = usageWindowQuerySchema.parse({
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-07-01T00:00:00.000Z',
      scope: 'tenant',
    })
    expect(parsed.from).toBeInstanceOf(Date)
    expect(parsed.scope).toBe('tenant')
  })

  /**
   * Bounded-window enforcement.
   *
   * Inverted windows and windows wider than the cap are rejected; unknown
   * scope values equally fail the whitelist.
   */
  it('rejects inverted, over-cap, and unknown-scope queries', () => {
    expect(usageWindowQuerySchema.safeParse({ from: '2026-07-02', to: '2026-07-01' }).success).toBe(
      false,
    )
    const to = new Date('2026-07-01T00:00:00.000Z')
    const from = new Date(to.getTime() - (MAX_WINDOW_DAYS + 1) * MS_PER_DAY)
    expect(
      usageWindowQuerySchema.safeParse({ from: from.toISOString(), to: to.toISOString() }).success,
    ).toBe(false)
    expect(usageWindowQuerySchema.safeParse({ scope: 'everyone' }).success).toBe(false)
  })
})

describe('byPeriodQuerySchema', () => {
  /**
   * Granularity whitelist.
   *
   * day/week/month pass (day the default); anything else is a 400 before
   * the aggregator runs.
   */
  it('whitelists the granularities', () => {
    expect(byPeriodQuerySchema.parse({}).granularity).toBe('day')
    expect(byPeriodQuerySchema.parse({ granularity: 'month' }).granularity).toBe('month')
    expect(byPeriodQuerySchema.safeParse({ granularity: 'year' }).success).toBe(false)
  })
})

describe('topConsumersQuerySchema', () => {
  /**
   * topN bounds.
   *
   * The count is a bounded integer with the documented default; zero,
   * negatives, fractions, and over-cap values are rejected.
   */
  it('bounds topN with the documented default', () => {
    expect(topConsumersQuerySchema.parse({}).topN).toBe(DEFAULT_TOP_N)
    expect(topConsumersQuerySchema.parse({ topN: '25' }).topN).toBe(25)
    for (const bad of ['0', '-1', '1.5', String(MAX_TOP_N + 1)]) {
      expect(topConsumersQuerySchema.safeParse({ topN: bad }).success).toBe(false)
    }
  })
})

describe('systemCostsQuerySchema', () => {
  /**
   * Category bounds.
   *
   * The optional category filter is a bounded, non-empty string.
   */
  it('bounds the optional category', () => {
    expect(systemCostsQuerySchema.parse({ category: 'reindex' }).category).toBe('reindex')
    expect(systemCostsQuerySchema.safeParse({ category: '' }).success).toBe(false)
    expect(systemCostsQuerySchema.safeParse({ category: 'x'.repeat(101) }).success).toBe(false)
  })
})

describe('resolveWindow', () => {
  const now = () => new Date('2026-07-10T00:00:00.000Z')

  /**
   * Explicit bounds pass through.
   *
   * A fully specified window is used verbatim.
   */
  it('keeps explicit bounds verbatim', () => {
    const from = new Date('2026-06-01T00:00:00.000Z')
    const to = new Date('2026-07-01T00:00:00.000Z')

    expect(resolveWindow({ from, to }, now)).toEqual({ from, to })
  })

  /**
   * Default-window resolution.
   *
   * A missing `to` defaults to now; a missing `from` defaults to the
   * documented window before the effective `to` (deterministic given the
   * injected clock).
   */
  it('defaults to the documented trailing window', () => {
    const window = resolveWindow({}, now)

    expect(window.to).toEqual(now())
    expect(window.from).toEqual(new Date(now().getTime() - DEFAULT_WINDOW_DAYS * MS_PER_DAY))
  })

  /**
   * Real-clock default.
   *
   * Without an injected clock the resolver anchors to the actual current
   * time (the production call shape).
   */
  it('uses the real clock when none is injected', () => {
    const before = Date.now()
    const window = resolveWindow({})
    const after = Date.now()

    expect(window.to.getTime()).toBeGreaterThanOrEqual(before)
    expect(window.to.getTime()).toBeLessThanOrEqual(after)
  })

  /**
   * Half-open input.
   *
   * An explicit `to` with no `from` anchors the default window to that
   * `to`, not to the clock.
   */
  it('anchors the default from to the explicit to', () => {
    const to = new Date('2026-05-01T00:00:00.000Z')

    const window = resolveWindow({ to }, now)

    expect(window.to).toEqual(to)
    expect(window.from).toEqual(new Date(to.getTime() - DEFAULT_WINDOW_DAYS * MS_PER_DAY))
  })
})
