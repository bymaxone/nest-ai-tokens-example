/**
 * Unit tests for the system-jobs service.
 *
 * Layer: unit.
 * Goal: prove reindex is admin-gated (403 non-root), embeds ONE batch
 * over the deterministic corpus slice, and records it tenant-scoped under
 * the reserved system fields (isSystemCost + category + correlation
 * tags); prove agent-decision records the deterministic 25-token
 * normalized usage user-scoped with the decision id as correlationId and
 * the strategy/confidence tags, echoing (never persisting) the reasoning.
 * Mocks: a MeteringService record double; the provider is the REAL
 * zero-latency MockAiProvider.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { ForbiddenException } from '@nestjs/common'
import type { MeteringService } from '@bymax-one/nest-ai-tokens'

import { agentDecisionBodySchema, reindexBodySchema } from './dto/system-jobs.bodies.js'
import {
  AGENT_DECISION_TOKENS,
  REINDEX_DOCUMENTS,
  SystemJobsService,
} from './system-jobs.service.js'
import { MockAiProvider } from '../ai/mock-ai.provider.js'
import { MOCK_EMBEDDING_PRESET } from '../ai/mock-usage.presets.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import { recordWith } from '../../test/fixtures/usage-record.fixture.js'

const root: DemoIdentity = { id: 'root', tenantId: 'acme' }
const ada: DemoIdentity = { id: 'ada', tenantId: 'acme' }

/** The service under test with a real provider and a record double. */
function serviceWith() {
  const record = jest
    .fn<MeteringService['record']>()
    .mockResolvedValue(recordWith({ id: 'txn-job', totalTokens: 77 }))
  const double: Pick<MeteringService, 'record'> = { record }
  // Single widening assertion at the fixture boundary: the service consumes
  // exactly this member of the class type.
  const service = new SystemJobsService(new MockAiProvider({}), double as MeteringService)
  return { service, record }
}

describe('reindex', () => {
  /**
   * Admin gate.
   *
   * The reindex job is platform work: any non-root identity is rejected
   * 403 before the provider or ledger is touched.
   */
  it('rejects non-admin callers with 403', async () => {
    const { service, record } = serviceWith()

    await expect(service.reindex(ada, reindexBodySchema.parse({}))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(record).not.toHaveBeenCalled()
  })

  /**
   * ONE tenant-scoped system record per run (rows 71, 84).
   *
   * The batch embeds the corpus slice in one provider call and one
   * record() carrying the reserved fields: isSystemCost true, the reindex
   * category, the tenant payer scope, and the correlation tags.
   */
  it('records one tenant-scoped system cost with the reserved fields', async () => {
    const { service, record } = serviceWith()

    const result = await service.reindex(root, reindexBodySchema.parse({ count: 3 }))

    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith({
      usage: expect.objectContaining({ model: 'mock-embed' }),
      preset: MOCK_EMBEDDING_PRESET,
      context: {
        tenantId: 'acme',
        scope: { type: 'tenant', id: 'acme' },
        requestedBy: 'root',
        feature: 'system.reindex',
        isSystemCost: true,
        systemCostCategory: 'reindex',
        tags: ['resource:reindex-run', 'batch-size:3'],
      },
    })
    expect(result).toEqual({
      transactionId: 'txn-job',
      batchSize: 3,
      tokensUsed: 77,
      systemCostCategory: 'reindex',
    })
  })

  /**
   * Deterministic corpus.
   *
   * The fixture corpus is stable and long enough for the maximum count,
   * so every run of the same size embeds identical documents.
   */
  it('slices the stable fixture corpus', () => {
    expect(REINDEX_DOCUMENTS).toHaveLength(20)
    expect(REINDEX_DOCUMENTS[0]).toBe('reindex document 01: knowledge base page')
    expect(new Set(REINDEX_DOCUMENTS).size).toBe(20)
  })
})

describe('agentDecision', () => {
  /**
   * Reserved metadata mapping (rows 85, 13 reconciled).
   *
   * The assist records the deterministic 25-token normalized usage under
   * the user's payer scope with isSystemCost true, the agent-decision
   * category, the decision id as correlationId, and the strategy plus
   * confidence as tags; the reasoning is echoed and NEVER persisted.
   */
  it('records the deterministic assist with correlationId and tags', async () => {
    const { service, record } = serviceWith()
    const body = agentDecisionBodySchema.parse({
      decisionId: 'dec-001',
      strategy: 'rebalance.v2',
      confidence: 0.85,
      reasoning: 'portfolio drift beyond threshold',
    })

    const result = await service.agentDecision(ada, body)

    expect(record).toHaveBeenCalledWith({
      usage: expect.objectContaining({
        provider: 'mock',
        model: 'mock-chat-lite',
        operation: 'chat',
        inputTokens: AGENT_DECISION_TOKENS,
        outputTokens: 0,
      }),
      context: {
        tenantId: 'acme',
        scope: { type: 'user', id: 'ada' },
        feature: 'agent.decision-assist',
        isSystemCost: true,
        systemCostCategory: 'agent-decision',
        correlationId: 'dec-001',
        tags: ['strategy:rebalance.v2', 'confidence:0.85'],
      },
    })
    const context = record.mock.calls[0]?.[0].context
    expect(JSON.stringify(context)).not.toContain('portfolio drift')
    expect(result).toEqual({
      decisionId: 'dec-001',
      strategy: 'rebalance.v2',
      confidence: 0.85,
      reasoning: 'portfolio drift beyond threshold',
      transactionId: 'txn-job',
      tokensUsed: 77,
    })
  })
})
