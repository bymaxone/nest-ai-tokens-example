/**
 * @fileoverview The typed fetch client for the apps/api REST surface: one
 * method per route across `/workspace`, `/ledger`, `/pricing`, `/usage`,
 * `/quota`, `/errors-demo`, `/system-jobs`, and `/health` (the real module
 * map, spec §10.1; see the phase Reconciliation note). Every app-raised
 * error, library `AiTokensException` and host `ApiException` alike,
 * serializes the same `{ error: { code, message, details? } }` envelope, so
 * `ApiError` parses one shape and `isCode` narrows on it regardless of
 * which layer raised the failure.
 *
 * @layer lib
 */
import { AI_TOKENS_ERROR_CODES } from '@bymax-one/nest-ai-tokens/shared'
import type { AiTokensErrorCode } from '@bymax-one/nest-ai-tokens/shared'

import type {
  AccessStatusView,
  AgentDecisionBody,
  AgentDecisionResponse,
  AnalyzeBody,
  AnalyzeResponse,
  BackdatedCostBody,
  BackdatedCostResponse,
  BalanceView,
  BudgetListView,
  BudgetView,
  ByPeriodQuery,
  CreditBody,
  CreditResponse,
  CurrentPricingView,
  CustomBody,
  CustomResponse,
  EmbedBatchBody,
  EmbedBatchResponse,
  EmbedBody,
  EmbedResponse,
  ErrorCatalogView,
  HealthStatusView,
  LabRunBody,
  LabRunResponse,
  ListTransactionsQuery,
  MockChatCompletionView,
  ModelsInfoView,
  PriceHistoryQuery,
  PriceHistoryView,
  PriceRowView,
  ReindexBody,
  ReindexResponse,
  RefundBody,
  RefundResponse,
  RewriteBody,
  RewriteResponse,
  SummarizeBody,
  SummarizeResponse,
  SystemCostsQuery,
  TopConsumersQuery,
  TransactionListPageView,
  TranslateBody,
  TranslateResponse,
  UpdatePriceBody,
  UpsertBudgetBody,
  UsageReportView,
  UsageRecordView,
  UsageWindowQuery,
} from './api-types.js'
import { getApiUrl } from './env.js'

/** A known library error code, or any other host dot-namespaced code. */
export type ErrorCode = AiTokensErrorCode | (string & {})

/** The canonical error envelope every app-raised failure serializes to. */
interface ErrorEnvelope {
  readonly error: {
    readonly code: string
    readonly message: string
    readonly details?: Record<string, unknown>
  }
}

/**
 * Narrows an unknown JSON body to the canonical error envelope shape,
 * without trusting `code` to be a member of the closed library union (host
 * codes travel the same envelope).
 *
 * @param body The parsed response body.
 * @returns The envelope's `error` fields, or `undefined` when `body` does not match.
 */
function parseErrorEnvelope(body: unknown): ErrorEnvelope['error'] | undefined {
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined
  const { error } = body
  if (typeof error !== 'object' || error === null) return undefined
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (typeof code !== 'string' || typeof message !== 'string') return undefined
  const details = (error as { details?: unknown }).details
  const hasDetails = typeof details === 'object' && details !== null
  return { code, message, ...(hasDetails ? { details: details as Record<string, unknown> } : {}) }
}

/**
 * A typed api failure: a non-2xx HTTP response (parsed canonical envelope)
 * or a network/transport failure (`code: 'network_error'`, `status: 0`).
 */
export class ApiError extends Error {
  /** The machine-readable error code from the canonical envelope. */
  readonly code: string
  /** The HTTP status Nest responded with (`0` for a network failure). */
  readonly status: number
  /** Optional structured context from the envelope; never raw server internals. */
  readonly details?: Record<string, unknown>

  /**
   * @param code The machine-readable error code.
   * @param status The HTTP status (`0` for a network failure).
   * @param message The human-readable description.
   * @param details Optional structured context from the envelope.
   */
  constructor(code: string, status: number, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    if (details !== undefined) this.details = details
  }
}

/**
 * Whether `error` is an {@link ApiError} carrying exactly `code`.
 *
 * @param error The caught value (typically from a rejected client call).
 * @param code The code to narrow on (a known library code or a host code).
 * @returns True when `error` is an `ApiError` with a matching `code`.
 */
export function isCode(error: unknown, code: ErrorCode): error is ApiError {
  return error instanceof ApiError && error.code === code
}

/** Supplies the demo-identity headers on every request (wired to the identity store). */
export type HeaderProvider = () => Record<string, string>

/** The default header provider: no demo identity selected. */
const NO_HEADERS: HeaderProvider = () => ({})

/** Constructor options for {@link ApiClient}. */
export interface ApiClientOptions {
  /** The api origin; defaults to the configured `NEXT_PUBLIC_API_URL`. */
  readonly baseUrl?: string
  /** Supplies `x-demo-user`/`x-tenant-id` on every request. */
  readonly headerProvider?: HeaderProvider
}

/** Serializable query parameter values (arrays join comma-separated). */
type QueryValue = string | number | boolean | readonly string[] | undefined

/**
 * Builds a `?`-prefixed query string, dropping `undefined` entries and
 * comma-joining arrays (matching the api's CSV list-parameter convention).
 * Accepts `Record<string, unknown>` (rather than `Record<string, QueryValue>`)
 * so the concrete `*Query` interfaces, which declare no index signature of
 * their own, remain assignable at every call site.
 *
 * @param params The query parameters.
 * @returns The query string, or an empty string when every value is `undefined`.
 */
function buildQuery(params: Readonly<Record<string, unknown>>): string {
  const search = new URLSearchParams()
  for (const [key, raw] of Object.entries(params)) {
    const value = raw as QueryValue
    if (value === undefined) continue
    search.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  const query = search.toString()
  return query.length > 0 ? `?${query}` : ''
}

/** The typed fetch client over the apps/api REST surface. */
export class ApiClient {
  private readonly baseUrl: string
  private readonly headerProvider: HeaderProvider

  /**
   * @param options Base URL and identity header provider overrides.
   */
  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? getApiUrl()
    this.headerProvider = options.headerProvider ?? NO_HEADERS
  }

  /**
   * Issues one request and parses its JSON body, throwing {@link ApiError}
   * on a network failure or a non-2xx response.
   *
   * @param path The request path (including any query string).
   * @param init Method, body, and extra headers.
   * @returns The parsed JSON response body.
   * @throws {ApiError} On a network failure or a non-2xx response.
   */
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...this.headerProvider(),
          ...init.headers,
        },
      })
    } catch {
      throw new ApiError('network_error', 0, 'Could not reach the api.')
    }
    const text = await response.text()
    const body: unknown = text.length > 0 ? (JSON.parse(text) as unknown) : undefined
    if (!response.ok) {
      const envelope = parseErrorEnvelope(body)
      throw envelope !== undefined
        ? new ApiError(envelope.code, response.status, envelope.message, envelope.details)
        : new ApiError('unknown_error', response.status, 'The api returned an unexpected error.')
    }
    return body as T
  }

  /**
   * A GET request with an optional query string.
   *
   * @param path The request path.
   * @param query Optional query parameters.
   * @returns The parsed JSON response body.
   */
  private get<T>(path: string, query?: object): Promise<T> {
    return this.request<T>(
      `${path}${query !== undefined ? buildQuery(query as Readonly<Record<string, unknown>>) : ''}`,
    )
  }

  /**
   * A POST request with a JSON body.
   *
   * @param path The request path.
   * @param body The request payload.
   * @returns The parsed JSON response body.
   */
  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
  }

  /**
   * A PUT request with a JSON body.
   *
   * @param path The request path.
   * @param body The request payload.
   * @returns The parsed JSON response body.
   */
  private put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
  }

  /* ─────────────────────────────── workspace ─────────────────────────────── */

  /** `POST /workspace/translate`. */
  translate(body: TranslateBody): Promise<TranslateResponse> {
    return this.post('/workspace/translate', body)
  }

  /** `POST /workspace/summarize`. */
  summarize(body: SummarizeBody): Promise<SummarizeResponse> {
    return this.post('/workspace/summarize', body)
  }

  /** `POST /workspace/rewrite`. */
  rewrite(body: RewriteBody): Promise<RewriteResponse> {
    return this.post('/workspace/rewrite', body)
  }

  /** `POST /workspace/analyze`. */
  analyze(body: AnalyzeBody): Promise<AnalyzeResponse> {
    return this.post('/workspace/analyze', body)
  }

  /** `POST /workspace/custom`. */
  custom(body: CustomBody): Promise<CustomResponse> {
    return this.post('/workspace/custom', body)
  }

  /** `POST /workspace/embed`. */
  embed(body: EmbedBody): Promise<EmbedResponse> {
    return this.post('/workspace/embed', body)
  }

  /** `POST /workspace/embed/batch`. */
  embedBatch(body: EmbedBatchBody): Promise<EmbedBatchResponse> {
    return this.post('/workspace/embed/batch', body)
  }

  /** `GET /workspace/models`. */
  getModels(): Promise<ModelsInfoView> {
    return this.get('/workspace/models')
  }

  /* ──────────────────────────────── ledger ───────────────────────────────── */

  /** `GET /ledger/transactions`. */
  listTransactions(query: ListTransactionsQuery = {}): Promise<TransactionListPageView> {
    return this.get('/ledger/transactions', query)
  }

  /** `GET /ledger/transactions/:id`. */
  getTransaction(id: string): Promise<UsageRecordView> {
    return this.get(`/ledger/transactions/${encodeURIComponent(id)}`)
  }

  /** `POST /ledger/credits`. */
  credit(body: CreditBody): Promise<CreditResponse> {
    return this.post('/ledger/credits', body)
  }

  /** `POST /ledger/refund`. */
  refund(body: RefundBody): Promise<RefundResponse> {
    return this.post('/ledger/refund', body)
  }

  /* ──────────────────────────────── pricing ──────────────────────────────── */

  /** `GET /pricing`. */
  getCurrentPricing(): Promise<CurrentPricingView> {
    return this.get('/pricing')
  }

  /** `GET /pricing/:model/history`. */
  getPriceHistory(model: string, query: PriceHistoryQuery): Promise<PriceHistoryView> {
    return this.get(`/pricing/${encodeURIComponent(model)}/history`, query)
  }

  /** `PUT /pricing/:model`. */
  updatePricing(model: string, body: UpdatePriceBody): Promise<PriceRowView> {
    return this.put(`/pricing/${encodeURIComponent(model)}`, body)
  }

  /* ───────────────────────────────── usage ───────────────────────────────── */

  /** `GET /usage/balance`. */
  getBalance(): Promise<BalanceView> {
    return this.get('/usage/balance')
  }

  /** `GET /usage/by-period`. */
  getUsageByPeriod(query: ByPeriodQuery = {}): Promise<UsageReportView> {
    return this.get('/usage/by-period', query)
  }

  /** `GET /usage/by-type`. */
  getUsageByType(query: UsageWindowQuery = {}): Promise<UsageReportView> {
    return this.get('/usage/by-type', query)
  }

  /** `GET /usage/by-model`. */
  getUsageByModel(query: UsageWindowQuery = {}): Promise<UsageReportView> {
    return this.get('/usage/by-model', query)
  }

  /** `GET /usage/top-consumers`. */
  getTopConsumers(query: TopConsumersQuery = {}): Promise<UsageReportView> {
    return this.get('/usage/top-consumers', query)
  }

  /** `GET /usage/system-costs`. */
  getSystemCosts(query: SystemCostsQuery = {}): Promise<UsageReportView> {
    return this.get('/usage/system-costs', query)
  }

  /* ───────────────────────────────── quota ───────────────────────────────── */

  /** `POST /quota/lab/constant`: the raw mock completion the interceptor meters. */
  runLabConstant(body: LabRunBody = {}): Promise<MockChatCompletionView> {
    return this.post('/quota/lab/constant', body)
  }

  /** `POST /quota/lab/model-based`. */
  runLabModelBased(body: LabRunBody = {}): Promise<LabRunResponse> {
    return this.post('/quota/lab/model-based', body)
  }

  /** `GET /quota/status`. */
  getQuotaStatus(): Promise<AccessStatusView> {
    return this.get('/quota/status')
  }

  /** `POST /quota/budgets`. */
  upsertBudget(body: UpsertBudgetBody): Promise<BudgetView> {
    return this.post('/quota/budgets', body)
  }

  /** `GET /quota/budgets`. */
  listBudgets(): Promise<BudgetListView> {
    return this.get('/quota/budgets')
  }

  /* ─────────────────────────────── errors-demo ───────────────────────────── */

  /** `GET /errors-demo`. */
  getErrorCatalog(): Promise<ErrorCatalogView> {
    return this.get('/errors-demo')
  }

  /** `POST /errors-demo/helpers/backdated-cost`. */
  getBackdatedCost(body: BackdatedCostBody): Promise<BackdatedCostResponse> {
    return this.post('/errors-demo/helpers/backdated-cost', body)
  }

  /**
   * `POST /errors-demo/:code`: deterministically raises the given catalog
   * code. Always rejects with {@link ApiError}; the return type is `never`
   * so callers do not need to branch on a success case that cannot occur.
   *
   * @param code The catalog code to trigger.
   * @returns Never resolves.
   */
  triggerError(code: string): Promise<never> {
    return this.post(`/errors-demo/${encodeURIComponent(code)}`)
  }

  /* ─────────────────────────────── system-jobs ───────────────────────────── */

  /** `POST /system-jobs/reindex`. */
  runReindex(body: ReindexBody = {}): Promise<ReindexResponse> {
    return this.post('/system-jobs/reindex', body)
  }

  /** `POST /system-jobs/agent-decision`. */
  recordAgentDecision(body: AgentDecisionBody): Promise<AgentDecisionResponse> {
    return this.post('/system-jobs/agent-decision', body)
  }

  /* ───────────────────────────────── health ──────────────────────────────── */

  /** `GET /health/live`. */
  getLiveness(): Promise<HealthStatusView> {
    return this.get('/health/live')
  }

  /** `GET /health/ready`. */
  getReadiness(): Promise<HealthStatusView> {
    return this.get('/health/ready')
  }
}

/** The AI_TOKENS_ERROR_CODES re-export, so consumers narrow without a second import. */
export { AI_TOKENS_ERROR_CODES }
