/**
 * Unit tests for the application Prisma client.
 *
 * Layer: unit.
 * Goal: prove the client constructs against the typed env (lazy connection,
 * so no database is needed) and disconnects on module destroy.
 * Mocks: none; PrismaClient with the pg adapter connects lazily.
 */
import { describe, expect, it } from '@jest/globals'

import { PrismaService } from './prisma.service.js'
import type { EnvConfig } from '../config/env.js'

const env: EnvConfig = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ai_tokens_example',
  PORT: 3001,
  AI_PROVIDER_MODE: 'mock',
  QUOTA_ENABLED: true,
  QUOTA_TOLERANCE: 1.2,
  QUOTA_MINIMUM_BALANCE: 0,
  TENANT_REQUIRED: false,
  PRICING_CACHE_TTL_MS: 300_000,
}

describe('PrismaService', () => {
  /**
   * Construction from the typed env.
   *
   * The service is a PrismaClient wired through the pg adapter; connections
   * are lazy so construction succeeds without a reachable database. The
   * assertion is structural (client methods present) because jest's ESM VM
   * can load a second copy of @prisma/client, defeating instanceof.
   */
  it('constructs a PrismaClient from the typed environment', () => {
    const service = new PrismaService(env)

    expect(typeof service.$queryRaw).toBe('function')
    expect(typeof service.$disconnect).toBe('function')
  })

  /**
   * Shutdown hygiene.
   *
   * onModuleDestroy disconnects; on a never-connected client this resolves
   * without error, leaving no open handles behind.
   */
  it('disconnects cleanly on module destroy', async () => {
    const service = new PrismaService(env)

    await expect(service.onModuleDestroy()).resolves.toBeUndefined()
  })
})
