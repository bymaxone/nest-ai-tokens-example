/**
 * @fileoverview Shared test fixtures for the enforcement lifecycle: a
 * `MeteringService` double exposing the hold/capture/release trio the
 * workspace services drive, a canonical `Hold`, and a fully-parsed
 * `EnvConfig` built through the real schema so defaults stay authoritative.
 *
 * @layer test
 */
import { jest } from '@jest/globals'
import type { Hold, MeteringService, UsageRecord } from '@bymax-one/nest-ai-tokens'

import { recordWith } from './usage-record.fixture.js'
import { parseEnv } from '../../src/config/env.js'
import type { EnvConfig } from '../../src/config/env.js'

/** The lifecycle subset of `MeteringService` the workspace services drive. */
type MeteringLifecycle = Pick<MeteringService, 'hold' | 'capture' | 'release'>

/**
 * Build a canonical hold with overrides.
 *
 * @param overrides Fields to replace on the fixture hold.
 * @returns The fixture hold.
 */
export function holdWith(overrides: Partial<Hold> = {}): Hold {
  return {
    id: 'hold-1',
    tenantId: 'acme',
    scope: { type: 'user', id: 'ada' },
    estimatedTokens: 12,
    estimatedCostNanoUsd: 100_000n,
    expiresAt: new Date('2026-06-01T01:00:00.000Z'),
    ...overrides,
  }
}

/** The metering double plus its observable hold/capture/release functions. */
export interface MeteringDouble {
  /** The double to inject where `MeteringService` is expected. */
  metering: MeteringService
  /** The stubbed `hold` (resolves the fixture hold). */
  holdFn: jest.Mock<MeteringService['hold']>
  /** The stubbed `capture` (resolves the given record). */
  captureFn: jest.Mock<MeteringService['capture']>
  /** The stubbed `release` (resolves void). */
  releaseFn: jest.Mock<MeteringService['release']>
  /** The hold every `holdFn` call resolves. */
  hold: Hold
}

/**
 * Build a `MeteringService` double for the hold -> capture/release path.
 *
 * @param record The record `capture` settles to.
 * @param hold The hold `hold` resolves.
 * @returns The double and its observable functions.
 */
export function meteringWith(
  record: UsageRecord = recordWith({ id: 'txn-1' }),
  hold: Hold = holdWith(),
): MeteringDouble {
  const holdFn = jest.fn<MeteringService['hold']>().mockResolvedValue(hold)
  const captureFn = jest.fn<MeteringService['capture']>().mockResolvedValue(record)
  const releaseFn = jest.fn<MeteringService['release']>().mockResolvedValue(undefined)
  const lifecycle: MeteringLifecycle = { hold: holdFn, capture: captureFn, release: releaseFn }
  // Single widening assertion at the fixture boundary: the services under
  // test consume exactly this lifecycle subset of the class type.
  const metering = lifecycle as MeteringService
  return { metering, holdFn, captureFn, releaseFn, hold }
}

/**
 * Build a complete `EnvConfig` through the REAL schema (defaults included),
 * so specs consume exactly what production parsing produces.
 *
 * @param overrides Raw environment-string overrides.
 * @returns The parsed configuration.
 */
export function envWith(overrides: Record<string, string> = {}): EnvConfig {
  return parseEnv({
    DATABASE_URL: 'postgresql://localhost:5499/ai_tokens_example',
    ...overrides,
  })
}
