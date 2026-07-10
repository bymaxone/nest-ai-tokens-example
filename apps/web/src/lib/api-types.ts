/**
 * @fileoverview Wire types for the apps/api REST surface: the real module
 * map (workspace, ledger, pricing, usage, quota, errors-demo, system-jobs,
 * health per docs/TECHNICAL_SPECIFICATION.md §10.1), not the drafted spec
 * §11 catalogue (see the phase Reconciliation note). Built ON the library's
 * browser-safe shared subpath wherever its unions/interfaces apply
 * (`AiOperation`, `ServiceTier`, `ProviderId`, `UsageStatus`,
 * `MeteringScope`, `BudgetPolicy`, `BudgetWindowKind`); money (nano-USD
 * bigint) and `Date` fields are hand-declared as `string` because
 * `JsonSafe<T>` is a server-only utility type the shared subpath does not
 * export.
 *
 * @layer lib
 */
import type {
  AiOperation,
  BudgetPolicy,
  BudgetWindowKind,
  MeteringScope,
  ProviderId,
  ServiceTier,
  UsageStatus,
} from '@bymax-one/nest-ai-tokens/shared'

/** A nano-USD amount as it crosses the JSON boundary (decimal string; bigint-safe). */
export type NanoUsdString = string

/** An ISO-8601 instant as it crosses the JSON boundary. */
export type IsoDateString = string

/* ─────────────────────────── shared response fragments ─────────────────────────── */

/** The wallet balance view every balance-carrying response embeds. */
export interface BalanceView {
  readonly nanoUsd: NanoUsdString
  readonly credits: number
  readonly formatted: string
}

/** The metering summary every workspace command/embedding response embeds. */
export interface WorkspaceUsageView {
  readonly transactionId: string
  readonly model: string
  readonly tokensUsed: {
    readonly input: number
    readonly output: number
    readonly total: number
  }
  readonly cost: {
    readonly rawNanoUsd: NanoUsdString
    readonly billedNanoUsd: NanoUsdString
    readonly formatted: string
  }
}

/** The wire shape of the library's `UsageRecord` (one ledger row), JSON-safe. */
export interface UsageRecordView {
  readonly id: string
  readonly tenantId: string
  readonly scope: MeteringScope
  readonly beneficiary?: MeteringScope
  readonly requestedBy?: string
  readonly provider: ProviderId
  readonly model: string
  readonly requestedModel?: string
  readonly operation: AiOperation
  readonly serviceTier: ServiceTier
  readonly feature: string
  readonly tags: string[]
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWrite5mTokens: number
  readonly cacheWrite1hTokens: number
  readonly reasoningTokens: number
  readonly audioInTokens: number
  readonly audioOutTokens: number
  readonly imageInTokens: number
  readonly imageOutTokens: number
  readonly totalTokens: number
  readonly extraUnits?: Record<string, number>
  readonly priceVersionId: string | null
  readonly rawCostNanoUsd: NanoUsdString
  readonly surchargeNanoUsd: NanoUsdString
  readonly billedCostNanoUsd: NanoUsdString
  readonly markupMultiplier: number
  readonly currency: string
  readonly priceMissing: boolean
  readonly status: UsageStatus
  readonly reversedByRecordId?: string
  readonly reversesRecordId?: string
  readonly idempotencyKey: string
  readonly correlationId?: string
  readonly requestId?: string
  readonly isSystemCost: boolean
  readonly systemCostCategory?: string
  readonly enforced: boolean
  readonly prevHash?: string
  readonly hash?: string
  readonly occurredAt: IsoDateString
  readonly createdAt: IsoDateString
  readonly updatedAt: IsoDateString
}

/**
 * The wire shape of a price row: the library's `PriceVersion` (pricing
 * history/update responses) and the Prisma `AiModelPrice` open-window row
 * (`GET /pricing`) share this field set, field for field.
 */
export interface PriceRowView {
  readonly id: string
  readonly provider: string
  readonly model: string
  readonly operation: AiOperation
  readonly serviceTier: ServiceTier
  readonly inputNanoUsdPerMillion: NanoUsdString
  readonly outputNanoUsdPerMillion: NanoUsdString
  readonly cacheReadNanoUsdPerMillion: NanoUsdString
  readonly cacheWrite5mNanoUsdPerMillion: NanoUsdString
  readonly cacheWrite1hNanoUsdPerMillion: NanoUsdString
  readonly reasoningNanoUsdPerMillion: NanoUsdString
  readonly audioInNanoUsdPerMillion: NanoUsdString
  readonly audioOutNanoUsdPerMillion: NanoUsdString
  readonly imageInNanoUsdPerMillion: NanoUsdString
  readonly imageOutNanoUsdPerMillion: NanoUsdString
  readonly tierThresholdTokens?: number
  readonly tierInputNanoUsdPerMillion?: NanoUsdString
  readonly tierOutputNanoUsdPerMillion?: NanoUsdString
  readonly unitRates?: Record<string, NanoUsdString>
  readonly currency: string
  readonly effectiveFrom: IsoDateString
  readonly effectiveTo: IsoDateString | null
  readonly source: string
}

/** The wire shape of the library's `AccessStatus` (wallet + budgets), JSON-safe. */
export interface AccessStatusView {
  readonly hasAccess: boolean
  readonly blockedBy?: 'wallet' | 'budget'
  readonly wallet?: {
    readonly balanceNanoUsd: NanoUsdString
    readonly credits: number
    readonly overdraftRemainingNanoUsd: NanoUsdString
  }
  readonly budgets: BudgetStatusView[]
}

/** The wire shape of one budget's live window status, JSON-safe. */
export interface BudgetStatusView {
  readonly budgetId: string
  readonly features?: string[]
  readonly window: BudgetWindowKind
  readonly windowStart: IsoDateString
  readonly resetsAt: IsoDateString | null
  readonly policy: BudgetPolicy
  readonly limit: {
    readonly nanoUsd?: NanoUsdString
    readonly tokens?: number
    readonly count?: number
  }
  readonly spent: {
    readonly nanoUsd: NanoUsdString
    readonly tokens: number
    readonly count: number
  }
  readonly remaining: {
    readonly nanoUsd?: NanoUsdString
    readonly tokens?: number
    readonly count?: number
  }
  readonly usedFraction: number
}

/** The wire shape of the library's `Budget` definition, JSON-safe. */
export interface BudgetView {
  readonly id: string
  readonly tenantId: string
  readonly scope: MeteringScope
  readonly features?: string[]
  readonly limitNanoUsd?: NanoUsdString
  readonly limitTokens?: number
  readonly limitCount?: number
  readonly window: BudgetWindowKind
  readonly anchorAt?: IsoDateString
  readonly expiresAt?: IsoDateString
  readonly softThresholds: number[]
  readonly policy: BudgetPolicy
  readonly createdAt: IsoDateString
}

/** The demo's fixed analyze-command output shape (app-owned, not a library type). */
export interface AnalysisView {
  readonly sentiment: 'negative' | 'neutral' | 'positive'
  readonly entities: string[]
}

/** One aggregation window a `/usage/*` report responds with. */
export interface ReportWindow {
  readonly from: IsoDateString
  readonly to: IsoDateString
}

/** One aggregated row of the library's `UsageSummary`, JSON-safe. */
export interface UsageSummaryView {
  readonly group: Record<string, string>
  readonly records: number
  readonly totalTokens: number
  readonly tokens: Record<string, number>
  readonly rawCostNanoUsd: NanoUsdString
  readonly surchargeNanoUsd: NanoUsdString
  readonly billedCostNanoUsd: NanoUsdString
  readonly cacheSavingsNanoUsd: NanoUsdString
}

/** The response of every `/usage/*` aggregation endpoint. */
export interface UsageReportView {
  readonly window: ReportWindow
  readonly items: UsageSummaryView[]
}

/* ─────────────────────────────────── workspace ─────────────────────────────────── */

/** Fields shared by the five workspace command bodies. */
interface WorkspaceCommandBodyBase {
  readonly model?: string
  readonly resourceId: string
}

/** `POST /workspace/translate` request body. */
export interface TranslateBody extends WorkspaceCommandBodyBase {
  readonly text: string
  readonly sourceLanguage?: string
  readonly targetLanguages: string[]
}

/** `POST /workspace/summarize` request body. */
export interface SummarizeBody extends WorkspaceCommandBodyBase {
  readonly text: string
  readonly maxLength?: number
  readonly style?: 'bullet' | 'paragraph' | 'tldr'
}

/** `POST /workspace/rewrite` request body. */
export interface RewriteBody extends WorkspaceCommandBodyBase {
  readonly text: string
  readonly style?: string
  readonly language?: string
}

/** `POST /workspace/analyze` request body. */
export interface AnalyzeBody extends WorkspaceCommandBodyBase {
  readonly text: string
}

/** `POST /workspace/custom` request body. */
export interface CustomBody extends WorkspaceCommandBodyBase {
  readonly systemPrompt?: string
  readonly userPrompt: string
  readonly responseFormat?: 'text' | 'json_object'
  readonly temperature?: number
  readonly maxTokens?: number
}

/** `POST /workspace/embed` request body. */
export interface EmbedBody {
  readonly text: string
  readonly model?: string
  readonly dimensions?: number
  readonly resourceId: string
}

/** `POST /workspace/embed/batch` request body. */
export interface EmbedBatchBody {
  readonly texts: string[]
  readonly model?: string
  readonly resourceId: string
}

/** Fields shared by every workspace command response. */
interface WorkspaceCommandResponseBase {
  readonly resourceId: string
  readonly usage: WorkspaceUsageView
}

/** `POST /workspace/translate` response. */
export interface TranslateResponse extends WorkspaceCommandResponseBase {
  readonly translations: Record<string, string>
}

/** `POST /workspace/summarize` response. */
export interface SummarizeResponse extends WorkspaceCommandResponseBase {
  readonly summary: string
}

/** `POST /workspace/rewrite` response. */
export interface RewriteResponse extends WorkspaceCommandResponseBase {
  readonly rewritten: string
}

/** `POST /workspace/analyze` response. */
export interface AnalyzeResponse extends WorkspaceCommandResponseBase {
  readonly analysis: AnalysisView
}

/** `POST /workspace/custom` response. */
export interface CustomResponse extends WorkspaceCommandResponseBase {
  readonly content: string
}

/** `POST /workspace/embed` response. */
export interface EmbedResponse {
  readonly resourceId: string
  readonly vector: number[]
  readonly usage: WorkspaceUsageView
}

/** `POST /workspace/embed/batch` response. */
export interface EmbedBatchResponse {
  readonly resourceId: string
  readonly embeddings: number[][]
  readonly batchSize: number
  readonly usage: WorkspaceUsageView
}

/** One command/embedding model's default id and current pricing. */
export interface ModelInfoView {
  readonly model: string
  readonly pricing: PriceRowView
}

/** `GET /workspace/models` response. */
export interface ModelsInfoView {
  readonly command: ModelInfoView & { readonly models: string[] }
  readonly embedding: ModelInfoView
}

/* ───────────────────────────────────── ledger ───────────────────────────────────── */

/** `GET /ledger/transactions` query filters. */
export interface ListTransactionsQuery {
  readonly feature?: string
  readonly features?: string[]
  readonly provider?: string
  readonly model?: string
  readonly operation?: AiOperation
  readonly serviceTier?: ServiceTier
  readonly status?: UsageStatus[]
  readonly isSystemCost?: boolean
  readonly systemCostCategory?: string
  readonly from?: IsoDateString
  readonly to?: IsoDateString
  readonly limit?: number
  readonly offset?: number
}

/** `GET /ledger/transactions` response. */
export interface TransactionListPageView {
  readonly items: UsageRecordView[]
  readonly total: number
  readonly limit: number
  readonly offset: number
}

/** `POST /ledger/credits` request body. */
export interface CreditBody {
  readonly amountNanoUsd: NanoUsdString
  readonly type: 'purchase' | 'monthly_allocation' | 'trial_allocation'
  readonly description?: string
  readonly idempotencyKey?: string
}

/** `POST /ledger/credits` response. */
export interface CreditResponse {
  readonly entryId: string
  readonly type: 'purchase' | 'monthly_allocation' | 'trial_allocation'
  readonly amountNanoUsd: NanoUsdString
  readonly balance: BalanceView
}

/** `POST /ledger/refund` request body. */
export interface RefundBody {
  readonly transactionId: string
  readonly reason?: string
}

/** `POST /ledger/refund` response. */
export interface RefundResponse {
  readonly originalTransactionId: string
  readonly reversalTransactionId: string
  readonly walletRefunded: boolean
  readonly reversal: UsageRecordView
}

/* ───────────────────────────────────── pricing ──────────────────────────────────── */

/** `GET /pricing` response. */
export interface CurrentPricingView {
  readonly items: PriceRowView[]
}

/** `GET /pricing/:model/history` query filters. */
export interface PriceHistoryQuery {
  readonly provider: string
  readonly operation?: AiOperation
  readonly serviceTier?: ServiceTier
}

/** `GET /pricing/:model/history` response. */
export interface PriceHistoryView {
  readonly items: PriceRowView[]
}

/** `PUT /pricing/:model` request body: at least one rate field is required. */
export interface UpdatePriceBody {
  readonly provider: string
  readonly operation: AiOperation
  readonly serviceTier?: ServiceTier
  readonly tierThresholdTokens?: number
  readonly unitRates?: Record<string, NanoUsdString>
  readonly inputNanoUsdPerMillion?: NanoUsdString
  readonly outputNanoUsdPerMillion?: NanoUsdString
  readonly cacheReadNanoUsdPerMillion?: NanoUsdString
  readonly cacheWrite5mNanoUsdPerMillion?: NanoUsdString
  readonly cacheWrite1hNanoUsdPerMillion?: NanoUsdString
  readonly reasoningNanoUsdPerMillion?: NanoUsdString
  readonly audioInNanoUsdPerMillion?: NanoUsdString
  readonly audioOutNanoUsdPerMillion?: NanoUsdString
  readonly imageInNanoUsdPerMillion?: NanoUsdString
  readonly imageOutNanoUsdPerMillion?: NanoUsdString
  readonly tierInputNanoUsdPerMillion?: NanoUsdString
  readonly tierOutputNanoUsdPerMillion?: NanoUsdString
}

/* ────────────────────────────────────── usage ───────────────────────────────────── */

/** Shared window fields for the `/usage/*` aggregation queries. */
interface UsageWindowQueryBase {
  readonly from?: IsoDateString
  readonly to?: IsoDateString
  readonly scope?: 'me' | 'tenant'
}

/** `GET /usage/by-type` and `GET /usage/by-model` query filters. */
export type UsageWindowQuery = UsageWindowQueryBase

/** `GET /usage/by-period` query filters. */
export interface ByPeriodQuery extends UsageWindowQueryBase {
  readonly granularity?: 'day' | 'week' | 'month'
}

/** `GET /usage/top-consumers` query filters. */
export interface TopConsumersQuery {
  readonly from?: IsoDateString
  readonly to?: IsoDateString
  readonly topN?: number
}

/** `GET /usage/system-costs` query filters. */
export interface SystemCostsQuery {
  readonly from?: IsoDateString
  readonly to?: IsoDateString
  readonly category?: string
}

/* ────────────────────────────────────── quota ───────────────────────────────────── */

/** `POST /quota/lab/constant` and `POST /quota/lab/model-based` request body. */
export interface LabRunBody {
  readonly model?: string
  readonly prompt?: string
}

/** The raw mock chat-completion response `POST /quota/lab/constant` returns verbatim. */
export interface MockChatCompletionView {
  readonly id: string
  readonly model: string
  readonly choices: [
    {
      readonly index: number
      readonly message: { readonly role: 'assistant'; readonly content: string }
      readonly finish_reason: 'stop' | 'length'
    },
  ]
  readonly usage: {
    readonly prompt_tokens: number
    readonly completion_tokens: number
    readonly total_tokens: number
  }
}

/** `POST /quota/lab/model-based` response. */
export interface LabRunResponse {
  readonly model: string
  readonly content: string
  readonly transactionId: string
  readonly billedNanoUsd: NanoUsdString
  readonly totalTokens: number
}

/** `POST /quota/budgets` request body. */
export interface UpsertBudgetBody {
  readonly scopeType: 'user' | 'tenant'
  readonly scopeId: string
  readonly limitNanoUsd?: NanoUsdString
  readonly limitTokens?: number
  readonly limitCount?: number
  readonly window?: BudgetWindowKind
  readonly policy?: BudgetPolicy
  readonly features?: string[]
}

/** `GET /quota/budgets` response. */
export interface BudgetListView {
  readonly budgets: BudgetView[]
  readonly status: BudgetStatusView[]
}

/* ─────────────────────────────────── errors-demo ────────────────────────────────── */

/** One row of the `GET /errors-demo` catalog listing. */
export interface ErrorCatalogEntryView {
  readonly code: string
  readonly source: 'library' | 'app'
  readonly status: number
  readonly availability: 'trigger' | 'boot-variant' | 'not-triggerable'
  readonly note?: string
}

/** `GET /errors-demo` response. */
export interface ErrorCatalogView {
  readonly entries: ErrorCatalogEntryView[]
  readonly triggerable: string[]
}

/** `POST /errors-demo/helpers/backdated-cost` request body. */
export interface BackdatedCostBody {
  readonly provider?: string
  readonly model: string
  readonly promptTokens: number
  readonly completionTokens: number
  readonly date: IsoDateString
}

/** `POST /errors-demo/helpers/backdated-cost` response. */
export interface BackdatedCostResponse {
  readonly pricing: PriceRowView
  readonly cost: {
    readonly totalNanoUsd: NanoUsdString
    readonly tokenNanoUsd: NanoUsdString
    readonly surchargeNanoUsd: NanoUsdString
  }
}

/* ──────────────────────────────────── system-jobs ───────────────────────────────── */

/** `POST /system-jobs/reindex` request body. */
export interface ReindexBody {
  readonly count?: number
}

/** `POST /system-jobs/reindex` response. */
export interface ReindexResponse {
  readonly transactionId: string
  readonly batchSize: number
  readonly tokensUsed: number
  readonly systemCostCategory: string
}

/** `POST /system-jobs/agent-decision` request body. */
export interface AgentDecisionBody {
  readonly decisionId: string
  readonly strategy: string
  readonly confidence: number
  readonly reasoning: string
}

/** `POST /system-jobs/agent-decision` response. */
export interface AgentDecisionResponse {
  readonly decisionId: string
  readonly strategy: string
  readonly confidence: number
  readonly reasoning: string
  readonly transactionId: string
  readonly tokensUsed: number
}

/* ───────────────────────────────────── health ───────────────────────────────────── */

/** `GET /health/live` and `GET /health/ready` response. */
export interface HealthStatusView {
  readonly status: 'up'
}
