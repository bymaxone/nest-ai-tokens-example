/**
 * Unit tests for the store module factory.
 *
 * Layer: unit.
 * Goal: prove the factory builds the library's official Prisma adapter over
 * the injected application client (the binding `forRootAsync` consumes).
 * Mocks: none; PrismaService connects lazily, so no database is touched.
 */
import { describe, expect, it } from '@jest/globals'
import { PrismaAiTokensStore } from '@bymax-one/nest-ai-tokens/prisma'

import { createPrismaAiTokensStore } from './ai-store.module.js'
import { PrismaService } from '../prisma/prisma.service.js'

describe('createPrismaAiTokensStore', () => {
  /**
   * Factory wiring.
   *
   * The provider factory must hand `BymaxAiTokensModuleOptions.store` the
   * library's official PostgreSQL adapter, so every port the enabled
   * feature blocks validate at init is implemented by shipped code.
   */
  it('builds the official PrismaAiTokensStore over the app client', () => {
    const prisma = new PrismaService({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ai_tokens_example',
      PORT: 3001,
      AI_PROVIDER_MODE: 'mock',
      QUOTA_ENABLED: true,
      QUOTA_TOLERANCE: 1.2,
      QUOTA_MINIMUM_BALANCE: 0,
      TENANT_REQUIRED: false,
      PRICING_CACHE_TTL_MS: 300_000,
      MOCK_LATENCY_MS: 0,
    })

    expect(createPrismaAiTokensStore(prisma)).toBeInstanceOf(PrismaAiTokensStore)
  })
})
