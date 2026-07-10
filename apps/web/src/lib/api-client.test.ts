/**
 * @fileoverview Unit tests for the typed api client: success mapping,
 * canonical-envelope parsing, error-code narrowing, the network-error path,
 * and every route method (fetch mocked; no network, no DOM).
 *
 * @layer lib
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, ApiError, isCode } from './api-client.js'

/** Builds a `Response`-shaped fetch resolution for the mock. */
function jsonResponse(status: number, body: unknown): Response {
  const text = body === undefined ? '' : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as Response
}

describe('ApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('maps a successful GET response to the parsed JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { nanoUsd: '1', credits: 1, formatted: '$1' }),
    )
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await expect(client.getBalance()).resolves.toEqual({
      nanoUsd: '1',
      credits: 1,
      formatted: '$1',
    })
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/usage/balance', expect.any(Object))
  })

  it('throws an invalid_response ApiError for a successful response with an empty body', async () => {
    // Every modeled endpoint returns JSON on success, so an empty 2xx body
    // is a broken response and must surface as the client's own error.
    fetchMock.mockResolvedValueOnce(jsonResponse(204, undefined))
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    const code = await client.getLiveness().then(
      () => 'resolved',
      (error: unknown) => (error as ApiError).code,
    )
    expect(code).toBe('invalid_response')
  })

  it('throws an invalid_response ApiError when a successful body is not JSON', async () => {
    // A proxy HTML page or truncated payload must never escape as a raw
    // SyntaxError from JSON.parse.
    fetchMock.mockResolvedValueOnce(
      new Response('<html>gateway</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await expect(
      client.getLiveness().catch((error: unknown) => (error as ApiError).code),
    ).resolves.toBe('invalid_response')
  })

  it('falls back to unknown_error when a non-2xx body is not JSON', async () => {
    // Parse failures on error responses keep the ApiError wrapping too.
    fetchMock.mockResolvedValueOnce(
      new Response('<html>bad gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    )
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await expect(
      client.getLiveness().catch((error: unknown) => (error as ApiError).code),
    ).resolves.toBe('unknown_error')
  })

  it('injects the identity headers from the header provider on every request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'up' }))
    const headerProvider = vi.fn(() => ({ 'x-demo-user': 'ada', 'x-tenant-id': 'acme' }))
    const client = new ApiClient({ baseUrl: 'http://api.test', headerProvider })
    await client.getReadiness()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toMatchObject({ 'x-demo-user': 'ada', 'x-tenant-id': 'acme' })
    expect(headerProvider).toHaveBeenCalledOnce()
  })

  it('sends no identity headers when the client is constructed without a header provider', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'up' }))
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await client.getLiveness()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
  })

  it('parses the canonical envelope and throws a matching ApiError on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(402, {
        error: {
          code: 'AI_TOKENS_INSUFFICIENT_CREDITS',
          message: 'Insufficient credits.',
          details: { balance: '0' },
        },
      }),
    )
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    const rejection = client.getBalance()
    await expect(rejection).rejects.toBeInstanceOf(ApiError)
    await rejection.catch((error: unknown) => {
      expect(isCode(error, 'AI_TOKENS_INSUFFICIENT_CREDITS')).toBe(true)
      expect((error as ApiError).status).toBe(402)
      expect((error as ApiError).details).toEqual({ balance: '0' })
    })
  })

  it('narrows on a host dot-namespaced code the same way as a library code', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: { code: 'provider.rate_limited', message: 'Rate limited.' } }),
    )
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await client.getBalance().catch((error: unknown) => {
      expect(isCode(error, 'provider.rate_limited')).toBe(true)
      expect(isCode(error, 'AI_TOKENS_QUOTA_EXCEEDED')).toBe(false)
    })
  })

  it('falls back to an unknown_error ApiError when a non-2xx body is not the canonical envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { unexpected: true }))
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await client.getBalance().catch((error: unknown) => {
      expect(isCode(error, 'unknown_error')).toBe(true)
      expect((error as ApiError).details).toBeUndefined()
    })
  })

  it('falls back to an unknown_error ApiError when the non-2xx body has no error.code/message strings', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { code: 1, message: 'x' } }))
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await expect(client.getBalance()).rejects.toSatisfy((error: unknown) =>
      isCode(error, 'unknown_error'),
    )
  })

  it('falls back to an unknown_error ApiError when a non-2xx body is not an object', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, 'plain text body'))
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await expect(client.getBalance()).rejects.toSatisfy((error: unknown) =>
      isCode(error, 'unknown_error'),
    )
  })

  it('falls back to an unknown_error ApiError when error.error is not an object', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'not an object' }))
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await expect(client.getBalance()).rejects.toSatisfy((error: unknown) =>
      isCode(error, 'unknown_error'),
    )
  })

  it('wraps a network/transport failure as a network_error ApiError with status 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await client.getBalance().catch((error: unknown) => {
      expect(isCode(error, 'network_error')).toBe(true)
      expect((error as ApiError).status).toBe(0)
    })
  })

  it('isCode returns false for a non-ApiError value', () => {
    expect(isCode(new Error('plain'), 'network_error')).toBe(false)
    expect(isCode('not an error', 'network_error')).toBe(false)
  })

  it('comma-joins array query params and stringifies booleans/numbers', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { items: [], total: 0, limit: 20, offset: 0 }),
    )
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await client.listTransactions({
      status: ['posted', 'reversed'],
      isSystemCost: true,
      limit: 5,
    })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe(
      'http://api.test/ledger/transactions?status=posted%2Creversed&isSystemCost=true&limit=5',
    )
  })

  it('drops an explicit undefined query value at runtime (TS forbids it statically; a spread-built query object may still carry one)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { items: [], total: 0, limit: 20, offset: 0 }),
    )
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    const runtimeOnlyQuery = { feature: undefined, limit: 5 } as unknown as Parameters<
      typeof client.listTransactions
    >[0]
    await client.listTransactions(runtimeOnlyQuery)
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('http://api.test/ledger/transactions?limit=5')
  })

  it('issues a plain GET with no query string when the endpoint takes none', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [] }))
    const client = new ApiClient({ baseUrl: 'http://api.test' })
    await client.getCurrentPricing()
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/pricing', expect.any(Object))
  })

  it('falls back to the configured NEXT_PUBLIC_API_URL default when no baseUrl is given', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'up' }))
    const client = new ApiClient()
    await client.getLiveness()
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toMatch(/\/health\/live$/)
  })

  describe('every route method issues the expected request', () => {
    const okBody = {}

    /** One {method, call} case per client route, covering every method body. */
    const cases: Array<{
      readonly name: string
      readonly call: (client: ApiClient) => Promise<unknown>
      readonly httpMethod: string
      readonly path: string
    }> = [
      {
        name: 'translate',
        call: (c) => c.translate({ text: 't', targetLanguages: ['es'], resourceId: 'r1' }),
        httpMethod: 'POST',
        path: '/workspace/translate',
      },
      {
        name: 'summarize',
        call: (c) => c.summarize({ text: 't', resourceId: 'r1' }),
        httpMethod: 'POST',
        path: '/workspace/summarize',
      },
      {
        name: 'rewrite',
        call: (c) => c.rewrite({ text: 't', resourceId: 'r1' }),
        httpMethod: 'POST',
        path: '/workspace/rewrite',
      },
      {
        name: 'analyze',
        call: (c) => c.analyze({ text: 't', resourceId: 'r1' }),
        httpMethod: 'POST',
        path: '/workspace/analyze',
      },
      {
        name: 'custom',
        call: (c) => c.custom({ userPrompt: 'p', resourceId: 'r1' }),
        httpMethod: 'POST',
        path: '/workspace/custom',
      },
      {
        name: 'embed',
        call: (c) => c.embed({ text: 't', resourceId: 'r1' }),
        httpMethod: 'POST',
        path: '/workspace/embed',
      },
      {
        name: 'embedBatch',
        call: (c) => c.embedBatch({ texts: ['t'], resourceId: 'r1' }),
        httpMethod: 'POST',
        path: '/workspace/embed/batch',
      },
      {
        name: 'getModels',
        call: (c) => c.getModels(),
        httpMethod: 'GET',
        path: '/workspace/models',
      },
      {
        name: 'listTransactions',
        call: (c) => c.listTransactions(),
        httpMethod: 'GET',
        path: '/ledger/transactions',
      },
      {
        name: 'getTransaction',
        call: (c) => c.getTransaction('tx-1'),
        httpMethod: 'GET',
        path: '/ledger/transactions/tx-1',
      },
      {
        name: 'credit',
        call: (c) => c.credit({ amountNanoUsd: '1000', type: 'purchase' }),
        httpMethod: 'POST',
        path: '/ledger/credits',
      },
      {
        name: 'refund',
        call: (c) => c.refund({ transactionId: 'tx-1' }),
        httpMethod: 'POST',
        path: '/ledger/refund',
      },
      {
        name: 'getCurrentPricing',
        call: (c) => c.getCurrentPricing(),
        httpMethod: 'GET',
        path: '/pricing',
      },
      {
        name: 'getPriceHistory',
        call: (c) => c.getPriceHistory('mock-chat-lite', { provider: 'mock' }),
        httpMethod: 'GET',
        path: '/pricing/mock-chat-lite/history',
      },
      {
        name: 'updatePricing',
        call: (c) => c.updatePricing('mock-chat-lite', { provider: 'mock', operation: 'chat' }),
        httpMethod: 'PUT',
        path: '/pricing/mock-chat-lite',
      },
      {
        name: 'getBalance',
        call: (c) => c.getBalance(),
        httpMethod: 'GET',
        path: '/usage/balance',
      },
      {
        name: 'getUsageByPeriod',
        call: (c) => c.getUsageByPeriod(),
        httpMethod: 'GET',
        path: '/usage/by-period',
      },
      {
        name: 'getUsageByType',
        call: (c) => c.getUsageByType(),
        httpMethod: 'GET',
        path: '/usage/by-type',
      },
      {
        name: 'getUsageByModel',
        call: (c) => c.getUsageByModel(),
        httpMethod: 'GET',
        path: '/usage/by-model',
      },
      {
        name: 'getTopConsumers',
        call: (c) => c.getTopConsumers(),
        httpMethod: 'GET',
        path: '/usage/top-consumers',
      },
      {
        name: 'getSystemCosts',
        call: (c) => c.getSystemCosts(),
        httpMethod: 'GET',
        path: '/usage/system-costs',
      },
      {
        name: 'runLabConstant',
        call: (c) => c.runLabConstant(),
        httpMethod: 'POST',
        path: '/quota/lab/constant',
      },
      {
        name: 'runLabModelBased',
        call: (c) => c.runLabModelBased(),
        httpMethod: 'POST',
        path: '/quota/lab/model-based',
      },
      {
        name: 'getQuotaStatus',
        call: (c) => c.getQuotaStatus(),
        httpMethod: 'GET',
        path: '/quota/status',
      },
      {
        name: 'upsertBudget',
        call: (c) => c.upsertBudget({ scopeType: 'user', scopeId: 'ada', limitNanoUsd: '1000' }),
        httpMethod: 'POST',
        path: '/quota/budgets',
      },
      {
        name: 'listBudgets',
        call: (c) => c.listBudgets(),
        httpMethod: 'GET',
        path: '/quota/budgets',
      },
      {
        name: 'getErrorCatalog',
        call: (c) => c.getErrorCatalog(),
        httpMethod: 'GET',
        path: '/errors-demo',
      },
      {
        name: 'getBackdatedCost',
        call: (c) =>
          c.getBackdatedCost({
            model: 'mock-chat-lite',
            promptTokens: 1,
            completionTokens: 1,
            date: '2026-01-01',
          }),
        httpMethod: 'POST',
        path: '/errors-demo/helpers/backdated-cost',
      },
      {
        name: 'triggerError',
        call: (c) => c.triggerError('AI_TOKENS_QUOTA_EXCEEDED'),
        httpMethod: 'POST',
        path: '/errors-demo/AI_TOKENS_QUOTA_EXCEEDED',
      },
      {
        name: 'runReindex',
        call: (c) => c.runReindex(),
        httpMethod: 'POST',
        path: '/system-jobs/reindex',
      },
      {
        name: 'recordAgentDecision',
        call: (c) =>
          c.recordAgentDecision({
            decisionId: 'd1',
            strategy: 's1',
            confidence: 0.5,
            reasoning: 'r',
          }),
        httpMethod: 'POST',
        path: '/system-jobs/agent-decision',
      },
      {
        name: 'getLiveness',
        call: (c) => c.getLiveness(),
        httpMethod: 'GET',
        path: '/health/live',
      },
      {
        name: 'getReadiness',
        call: (c) => c.getReadiness(),
        httpMethod: 'GET',
        path: '/health/ready',
      },
    ]

    for (const testCase of cases) {
      it(`${testCase.name} issues ${testCase.httpMethod} ${testCase.path}`, async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, okBody))
        const client = new ApiClient({ baseUrl: 'http://api.test' })
        await testCase.call(client)
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined]
        expect(url.startsWith(`http://api.test${testCase.path}`)).toBe(true)
        expect(init?.method ?? 'GET').toBe(testCase.httpMethod)
      })
    }
  })
})
