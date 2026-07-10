/**
 * Unit tests for the health probes.
 *
 * Layer: unit.
 * Goal: prove liveness always answers up, readiness mirrors the database
 * ping, and the failure body is value-free.
 * Mocks: a DatabasePinger stub (resolving or rejecting).
 */
import { ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it } from '@jest/globals'

import { HealthController } from './health.controller.js'
import type { DatabasePinger } from './health.controller.js'

/** Pinger stub resolving successfully. */
const upPinger: DatabasePinger = {
  $queryRaw: () => Promise.resolve([{ '?column?': 1 }]),
}

/** Pinger stub rejecting with a driver-style error carrying secrets. */
const downPinger: DatabasePinger = {
  $queryRaw: () =>
    Promise.reject(new Error('connect ECONNREFUSED postgresql://user:SECRET@db:5432/x')),
}

describe('HealthController', () => {
  /**
   * Liveness contract.
   *
   * /health/live only proves the process serves requests; it must never
   * touch the database.
   */
  it('answers live with status up', () => {
    const controller = new HealthController(downPinger)

    expect(controller.getLive()).toEqual({ status: 'up' })
  })

  /**
   * Readiness happy path.
   *
   * A successful SELECT 1 means the app can do real work: status up.
   */
  it('answers ready with status up when the database responds', async () => {
    const controller = new HealthController(upPinger)

    await expect(controller.getReady()).resolves.toEqual({ status: 'up' })
  })

  /**
   * Readiness failure path (value-free body).
   *
   * An unreachable database yields 503 with { status: 'down', reason } and
   * must never surface the driver error, which can embed connection details.
   */
  it('answers ready with a value-free 503 when the database is unreachable', async () => {
    const controller = new HealthController(downPinger)
    expect.assertions(3)

    try {
      await controller.getReady()
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException)
      const body = (error as ServiceUnavailableException).getResponse()
      expect(body).toEqual({ status: 'down', reason: 'database unreachable' })
      expect(JSON.stringify(body)).not.toContain('SECRET')
    }
  })
})
