# nest-ai-tokens-example: Technical Specification

> The canonical reference application for **`@bymax-one/nest-ai-tokens`**, the AI token accounting
> module for NestJS 11 (immutable ledger, historical pricing, provider-agnostic inference wrappers,
> quota enforcement, usage aggregations). A NestJS API plus a Next.js dashboard that exercises
> **every** public feature of the library in a runnable, realistic scenario, and makes the invisible
> parts (cost attribution, quota gating, pricing windows, tenant isolation, system costs) tangible
> on screen.
>
> Maintained by **Bymax One** · MIT · Part of the `@bymax-one/*` reference-app family
> (`nest-auth-example`, `nest-logger-example`, `nest-cache-example`, ...).

---

> 📄 **About this document.** This is the authoritative, forward-looking technical blueprint for
> `nest-ai-tokens-example`, authored **before implementation**. It is the source the phased
> `DEVELOPMENT_PLAN.md` and the per-phase `docs/tasks/phase-NN-*.md` files derive from. It describes
> the intended end state so that planning, task scaffolding, and review all share one contract.
> The API surface prescribed here mirrors the library's own technical specification at
> `@bymax-one/nest-ai-tokens@0.1.0`; any surface that ships differently is reconciled in this
> document (and flagged in the Coverage Matrix), never papered over. Where an item is ambiguous,
> verify against the published README before implementing.

> ⚠️ **Library status.** `@bymax-one/nest-ai-tokens` is **pre-1.0 (`0.1.0`)** and not yet published
> to npm. This example pins the library locally (see §8) until it is published, then tracks
> `^0.1.0`.

> 🔒 **No real AI keys, ever.** The example runs entirely against a deterministic
> **`MockAiProvider`** (strategy `'custom'`). The OpenAI path (`'openai-default'`) is wired,
> documented, and demonstrated **only** through its configuration-error surface (missing key) and
> an env-gated opt-in that is never exercised in CI. No secret is required to run or test anything
> in this repository.

---

## Table of Contents

1. [Purpose & Audience](#1--purpose--audience)
2. [Goals & Non-Goals](#2--goals--non-goals)
3. [Architecture at a Glance](#3--architecture-at-a-glance)
4. [The Library Under Test: `@bymax-one/nest-ai-tokens`](#4--the-library-under-test-bymax-onenest-ai-tokens)
5. [Tech Stack](#5--tech-stack)
6. [Repository Layout](#6--repository-layout)
7. [Feature Coverage Matrix](#7--feature-coverage-matrix)
8. [Library Consumption](#8--library-consumption)
9. [Configuration & Environment](#9--configuration--environment)
10. [Backend Design: `apps/api`](#10--backend-design-appsapi)
11. [Demo Domain & REST API](#11--demo-domain--rest-api)
12. [The Mock Provider](#12--the-mock-provider)
13. [Demonstration Scenarios](#13--demonstration-scenarios)
14. [Frontend Design: `apps/web`](#14--frontend-design-appsweb)
15. [Design System](#15--design-system)
16. [Persistence: Prisma Repositories](#16--persistence-prisma-repositories)
17. [Quota Enforcement](#17--quota-enforcement)
18. [Multi-Tenant Model](#18--multi-tenant-model)
19. [Error Handling](#19--error-handling)
20. [Observability](#20--observability)
21. [Local Stack & Docker](#21--local-stack--docker)
22. [Testing Strategy](#22--testing-strategy)
23. [Tooling & Conventions](#23--tooling--conventions)
24. [Security & Safety](#24--security--safety)
25. [What This Project Intentionally Excludes](#25--what-this-project-intentionally-excludes)
26. [References](#26--references)
27. [Document Status](#27--document-status)

---

## 1 · Purpose & Audience

`nest-ai-tokens-example` exists to do three things, in order of importance:

1. **Demonstrate every public feature** of `@bymax-one/nest-ai-tokens` in one runnable, realistic
   application: not isolated snippets, but a coherent multi-tenant AI workspace where every ledger,
   pricing, quota, and aggregation capability earns its place.
2. **Make the invisible visible.** Token attribution, historical pricing windows, quota gating,
   tenant isolation, and system-cost segregation are hard to appreciate from a README. A live
   dashboard renders them in real time so a reader _sees_ a command debit the ledger, _sees_ the
   cost split into input and output portions, _sees_ a request blocked with `402` when the balance
   runs out, and _sees_ a pricing update take effect without rewriting history.
3. **Serve as the canonical integration reference** for any project adopting the library: the
   copy-paste-grade `registerAsync` wiring, the Prisma implementations of both repository ports,
   the custom `IAiProvider` adapter pattern, the quota estimators, and the dual-subpath shared-types
   pattern.

It doubles as the library's **dogfooding harness**: building the example against the published API
surfaces ergonomics and gaps a unit-test suite cannot.

**Audience:** backend engineers evaluating or adopting the library; frontend engineers wiring a
usage dashboard; reviewers auditing the library's API; and AI agents executing the phased plan.

---

## 2 · Goals & Non-Goals

### Goals

- **G1: Total surface coverage.** Every export of `@bymax-one/nest-ai-tokens` (both subpaths) is
  demonstrated and tracked in the [Feature Coverage Matrix](#7--feature-coverage-matrix) (§7),
  including every error code in the catalog.
- **G2: Honest semantics.** No demo misrepresents what the library does. Where the library has a
  boundary (billing is the consumer's job, pricing is shared across tenants, streaming is out of
  scope), the example demonstrates the boundary and the documented escape hatch.
- **G3: Production-grade wiring.** The `registerAsync` factory, the Prisma repositories with
  SQL-level aggregation, the balance resolver, and the exception surface are written the way a real
  service should write them.
- **G4: One visual product.** The dashboard is visually indistinguishable from the other Bymax
  example apps: same design system (§15), same shell, same brand.
- **G5: Deterministic by default.** The `MockAiProvider` produces reproducible token counts and
  costs from the input alone, so every scenario (including all provider failures) is testable
  without a network call or an API key.
- **G6: Authoritative documentation.** This spec, a phased plan, per-phase task files, a polished
  README, and JSDoc-rich code that reads like a tutorial.

### Non-Goals

- **NG1: Not a production deployment template.** Local dev reference only; no Kubernetes/CD.
- **NG2: No real authentication.** That is `@bymax-one/nest-auth`'s job. The example uses a demo
  user/tenant switcher (headers set by the dashboard) so quota and multi-tenant flows are
  exercisable without an auth stack.
- **NG3: No real billing.** The ledger records consumption and credits; charging a card (Stripe et
  al.) is explicitly out of the library's scope and out of this example's scope. A "purchase token
  pack" button simulates the webhook by calling `recordCredit`.
- **NG4: No real LLM calls in CI.** The OpenAI adapter path is env-gated for local, manual
  exploration only. CI and the test suites run exclusively against `MockAiProvider` and
  `NoOpAiProvider`.
- **NG5: Not an AI product.** The "assistant" responses are canned/deterministic; the product being
  demonstrated is the **accounting** around AI calls, not the AI itself.

---

## 3 · Architecture at a Glance

```
┌──────────────────────────────── nest-ai-tokens-example ─────────────────────────────────┐
│                                                                                          │
│  apps/web (Next.js 16)                     apps/api (NestJS 11)                          │
│  ┌──────────────────────────┐   HTTP       ┌─────────────────────────────────────────┐  │
│  │ Overview  · Playground   │ ───────────▶ │ Controllers (Zod DTOs, thin)            │  │
│  │ Ledger    · Pricing      │              │   │                                     │  │
│  │ Usage     · Quota Lab    │              │   ▼                                     │  │
│  │ Tenants   · Errors       │              │ @bymax-one/nest-ai-tokens               │  │
│  └──────────────────────────┘              │   AiCommandService   EmbeddingService   │  │
│        │  imports types from               │   AiTokenTransactionService             │  │
│        │  @bymax-one/nest-ai-tokens/shared │   PricingService     UsageAggregator    │  │
│        ▼                                   │   TokenQuotaGuard ◀─ @ConsumeTokens()   │  │
│  (zero-dep browser bundle)                 │   │            │                        │  │
│                                            │   ▼            ▼                        │  │
│                                            │ MockAiProvider  Prisma repositories     │  │
│                                            │ (IAiProvider,   (ITokenTransaction/     │  │
│                                            │  deterministic,  IModelPricing ports)   │  │
│                                            │  failure inject) │                      │  │
│                                            └──────────────────┼──────────────────────┘  │
│                                                               ▼                          │
│                                                        postgres:17 (docker)              │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Three load-bearing decisions:

1. **`strategy: 'custom'` with `MockAiProvider` is the default wiring.** It proves the library's
   headline claim (works without the OpenAI SDK) and gives the example deterministic costs and a
   switchable failure-injection surface that reaches every `provider.*` error code.
2. **Postgres + Prisma implement the two repository ports.** The library is ORM-agnostic; the
   example shows the reference Prisma implementation, including database-level `SUM`/`GROUP BY`
   (the library explicitly requires aggregation in the database, not in memory).
3. **Demo identity via headers.** The dashboard sends `x-demo-user` and `x-tenant-id`; a middleware
   materializes `req.user` the way `nest-auth` would. This keeps quota and tenant flows honest
   without dragging a full auth stack into a ledger example.

---

## 4 · The Library Under Test: `@bymax-one/nest-ai-tokens`

### 4.1 Public API inventory (server subpath `.`)

| Group              | Exports                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Module             | `BymaxAiTokensModule` (`registerAsync`, sync registration)                                                                                                                                                   |
| Injection tokens   | `BYMAX_AI_TOKENS_OPTIONS`, `BYMAX_AI_TOKENS_TRANSACTION_REPOSITORY`, `BYMAX_AI_TOKENS_PRICING_REPOSITORY`, `BYMAX_AI_TOKENS_PROVIDER`, `BYMAX_AI_TOKENS_LOGGER`, `BYMAX_AI_TOKENS_QUOTA_POLICY`              |
| Services           | `AiTokenTransactionService`, `PricingService`, `EmbeddingService`, `AiCommandService`, `UsageAggregatorService`                                                                                              |
| Providers          | `OpenAiProvider` (built-in adapter), `NoOpAiProvider` (stub)                                                                                                                                                 |
| Guard & decorators | `TokenQuotaGuard`, `ConsumeTokens`, `SkipQuota`                                                                                                                                                              |
| Errors             | `AiTokensException`, `AI_TOKENS_ERROR_CODES`                                                                                                                                                                 |
| DTOs               | `TranslateCommandDto`, `SummarizeCommandDto`, `RewriteCommandDto`, `AnalyzeCommandDto`, `UpdatePricingDto`                                                                                                   |
| Interfaces (types) | `BymaxAiTokensModuleOptions`, `ITokenTransactionRepository`, `IModelPricingRepository`, `IAiProvider`, `IQuotaPolicy`, `ChatCompletionRequest/Response`, `EmbeddingRequest/Response`, `AuthenticatedRequest` |

### 4.2 Public API inventory (shared subpath `./shared`)

| Group             | Exports                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Ledger types      | `TokenTransaction`, `TokenTransactionMetadata`, `CreateTokenTransactionInput`, `TokenTransactionFilter`, `TokenTransactionType` |
| Pricing types     | `ModelPricing`, `CostCalculation`, `CreateModelPricingInput`                                                                    |
| Inference types   | `ChatCompletionRequest/Response`, `ChatMessage`, `UsageInfo`, `EmbeddingRequest/Response`                                       |
| Aggregation types | `UsageByPeriod`, `UsageByType`, `UsageByModel`, `UsageByCategory`                                                               |
| Constants         | `AI_TOKEN_TRANSACTION_TYPES`, `DEFAULT_OPENAI_PRICING_2026`, `AI_TOKENS_ERROR_CODES`                                            |

### 4.3 Behavioral contracts the example must prove

These are the library's documented guarantees; each maps to at least one scenario and one test:

1. **One ledger transaction per command/embedding call** (never one per message; batch embeddings
   record ONE aggregate transaction with `metadata.batchSize`).
2. **Immutable ledger:** corrections happen via new `refund` transactions, never UPDATE/DELETE.
3. **`amount: 0` is rejected**; fractional amounts are rounded to integers; `tokensUsed` keeps the
   as-provided value in metadata.
4. **Historical pricing:** an old transaction's cost uses the pricing effective at its date;
   `updatePricing` closes the open window and inserts a successor atomically, then invalidates the
   in-memory cache (TTL `pricing.cacheTtlMs`, default 5 min).
5. **Truncated-but-real responses still debit** (`finishReason: 'length'` records the transaction
   before propagating `provider.response_truncated`); schema-invalid responses do **not** debit.
6. **Quota guard order of checks:** disabled -> skip -> unmarked handler -> missing user (401) ->
   below minimum (402) -> insufficient for `estimated * tolerance` (402).
7. **Conditional registration:** without `provider`, `EmbeddingService`/`AiCommandService` are not
   in the container; without `quota.enabled`, the guard admits everything.
8. **Multi-tenant:** `multiTenant.required: true` makes `tenantId` mandatory
   (`ledger.tenant_required`); aggregations and queries filter by tenant.
9. **Seeding is idempotent:** `pricing.seedDefaults` + `customSeed` never overwrite existing rows
   (`upsertIfMissing`).
10. **Metadata hygiene:** full metadata is never logged (may carry PII in custom keys).

---

## 5 · Tech Stack

| Layer       | Choice                                                                                 | Notes                                                                                             |
| ----------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Backend     | NestJS 11, TypeScript 5.9 strict, ESM                                                  | Same baseline as the library                                                                      |
| Persistence | Postgres 17 (docker) + Prisma                                                          | Implements both repository ports; `Decimal(10,6)` for prices, `Int` for amounts, `Jsonb` metadata |
| Frontend    | Next.js 16 (App Router) + React 19                                                     | Design-system shell shared with the sibling examples                                              |
| Charts      | Recharts v3 via shadcn primitives                                                      | Usage-by-period/type/model, top consumers                                                         |
| Validation  | Zod DTOs via a `ZodValidationPipe`                                                     | No Swagger; controllers documented with JSDoc (family convention)                                 |
| Tests       | Jest (api) + Vitest (web) + supertest + Testcontainers Postgres                        | 100% unit coverage on all four metrics; E2E of every flow                                         |
| Tooling     | pnpm workspaces, ESLint 9 flat, Prettier 3, husky + commitlint + lint-staged, Renovate | Mirrors `nest-cache-example`                                                                      |
| Runtime     | Node `>=24`                                                                            | `.nvmrc`, `engines`, CI `node-version: '24'`                                                      |

---

## 6 · Repository Layout

```
nest-ai-tokens-example/
├── apps/
│   ├── api/                          # NestJS 11 backend
│   │   ├── src/
│   │   │   ├── main.ts               # bootstrap seam (createApp/bootstrap)
│   │   │   ├── app.module.ts         # BymaxAiTokensModule.registerAsync wiring
│   │   │   ├── ai/
│   │   │   │   ├── ai-tokens.config.ts        # options factory (the canonical wiring)
│   │   │   │   ├── mock-ai.provider.ts        # deterministic IAiProvider + failure injection
│   │   │   │   ├── openai-optin.provider.ts   # env-gated real adapter passthrough (never in CI)
│   │   │   │   └── repositories/
│   │   │   │       ├── prisma-token-transaction.repository.ts
│   │   │   │       └── prisma-model-pricing.repository.ts
│   │   │   ├── identity/             # x-demo-user / x-tenant-id middleware -> req.user
│   │   │   ├── workspace/            # commands + embeddings endpoints (Playground backend)
│   │   │   ├── ledger/               # transactions list/detail, credits top-up
│   │   │   ├── pricing/              # current/history/update endpoints
│   │   │   ├── usage/                # aggregations + balance + top consumers + system costs
│   │   │   ├── quota/                # quota lab endpoints (estimator variants)
│   │   │   ├── system-jobs/          # simulated maintenance jobs (isSystemCost)
│   │   │   ├── errors-demo/          # deterministic triggers for the full error catalog
│   │   │   ├── health/               # liveness/readiness (db reachable)
│   │   │   └── common/               # Zod pipe, demo constants, exception mapping notes
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # AiTokenTransaction + ModelPricing (+ demo seed)
│   │   │   └── seed.ts
│   │   └── test/                     # e2e (Testcontainers postgres:17-alpine)
│   └── web/                          # Next.js 16 dashboard
│       └── src/app/(dashboard)/      # overview · playground · ledger · pricing · usage
│                                     # quota · tenants · errors
├── docs/
│   ├── TECHNICAL_SPECIFICATION.md    # this file
│   ├── DEVELOPMENT_PLAN.md
│   ├── design_system.html            # shared Bymax design system (copied verbatim)
│   └── tasks/                        # one file per phase
├── docker-compose.yml                # postgres:17 (+ named volume)
├── .github/workflows/ci.yml          # from phase 00; codeql/scorecard conditional while private
└── package.json                      # pnpm workspaces: apps/*
```

---

## 7 · Feature Coverage Matrix

The spine of the project. **Every** public export and every documented behavior is demonstrated and
tracked here; `DEVELOPMENT_PLAN.md` phases reference these rows, and an export-audit script
(phase 09) diffs the library's actual exports against this matrix. Status legend: ✅ planned-covered
· ⛔ intentionally not exercised (with reason).

### 7.1 Module, registration & DI

| #   | Library surface                                                           | Demonstrated in                                                             | Status |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------ |
| 1   | `BymaxAiTokensModule.registerAsync`                                       | `app.module.ts` + `ai/ai-tokens.config.ts` (primary wiring)                 | ✅     |
| 2   | Sync registration path                                                    | E2E test module (minimal options)                                           | ✅     |
| 3   | `isGlobal: true`                                                          | primary wiring (services injected across feature modules without re-import) | ✅     |
| 4   | `BYMAX_AI_TOKENS_TRANSACTION_REPOSITORY`                                  | `PrismaTokenTransactionRepository` provider binding                         | ✅     |
| 5   | `BYMAX_AI_TOKENS_PRICING_REPOSITORY`                                      | `PrismaModelPricingRepository` provider binding                             | ✅     |
| 6   | `BYMAX_AI_TOKENS_PROVIDER` (strategy `'custom'`)                          | `MockAiProvider` binding (default run mode)                                 | ✅     |
| 7   | `BYMAX_AI_TOKENS_LOGGER`                                                  | Nest `Logger` bridge provider                                               | ✅     |
| 8   | `BYMAX_AI_TOKENS_QUOTA_POLICY`                                            | Quota Lab: class-based policy variant beside the inline resolver            | ✅     |
| 9   | `BYMAX_AI_TOKENS_OPTIONS`                                                 | `usage` module reads effective options (tolerance, models) for display      | ✅     |
| 10  | `config.invalid_provider_strategy`                                        | errors-demo boot-variant e2e (invalid strategy rejected at init)            | ✅     |
| 11  | `config.missing_repository`                                               | errors-demo boot-variant e2e (module without repository binding)            | ✅     |
| 12  | Conditional registration (no `provider` -> no command/embedding services) | e2e: ledger-only module variant proves absence from the container           | ✅     |

### 7.2 Ledger: `AiTokenTransactionService`

| #   | Surface                                          | Demonstrated in                                                                                        | Status |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------ |
| 13  | `record()` (generic)                             | `system-jobs` (custom typed transaction)                                                               | ✅     |
| 14  | `recordGeneration()`                             | every Playground command (via `AiCommandService`) + direct in `ledger` tests                           | ✅     |
| 15  | `recordEmbeddingGeneration()`                    | embeddings panel (via `EmbeddingService`)                                                              | ✅     |
| 16  | `recordCredit()` (all four credit types)         | Quota Lab top-up (`purchase`), seed (`monthly_allocation`, `trial_allocation`), refund flow (`refund`) | ✅     |
| 17  | `getUserTransactions()` (filters, pagination)    | `GET /ledger/transactions` (type/date filters, limit/offset)                                           | ✅     |
| 18  | `getTotalTokensConsumed()`                       | Overview page stat card                                                                                | ✅     |
| 19  | `getTotalCostUSD()`                              | Overview page stat card                                                                                | ✅     |
| 20  | `amount: 0` rejection (`ledger.zero_amount`)     | errors-demo                                                                                            | ✅     |
| 21  | Rounding of fractional amounts                   | unit test on ledger endpoint + metadata `tokensUsed` preserved                                         | ✅     |
| 22  | `ledger.invalid_input`, `ledger.tenant_required` | errors-demo + tenants-required e2e variant                                                             | ✅     |
| 23  | Immutability convention (refund, never edit)     | Ledger page "refund" action creates a compensating transaction                                         | ✅     |

### 7.3 Pricing: `PricingService`

| #   | Surface                                                           | Demonstrated in                                                              | Status |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| 24  | `getCurrentPricing()`                                             | Pricing page (per model)                                                     | ✅     |
| 25  | `calculateCost()` (input+output split)                            | Playground result panel (cost breakdown)                                     | ✅     |
| 26  | Embedding cost path (`outputPrice: null`)                         | embeddings panel cost display                                                | ✅     |
| 27  | Null-outputPrice fallback warning path                            | unit test (completionTokens > 0 on embedding model)                          | ✅     |
| 28  | `updatePricing()` (window close + successor + cache invalidation) | Pricing page update form + history timeline                                  | ✅     |
| 29  | `getAllCurrentPricing()`                                          | Pricing page table                                                           | ✅     |
| 30  | `getPricingHistory()`                                             | Pricing page per-model history                                               | ✅     |
| 31  | `invalidateCache()`                                               | Pricing admin "flush cache" action                                           | ✅     |
| 32  | Historical resolution (old date -> old price)                     | scenario §13.4 (backdated cost calculation)                                  | ✅     |
| 33  | Pricing cache TTL (`pricing.cacheTtlMs`)                          | e2e: repository call count stable within TTL                                 | ✅     |
| 34  | `pricing.not_found`, `pricing.invalid_date`, `pricing.overlap`    | errors-demo                                                                  | ✅     |
| 35  | `pricing.seedDefaults` + `DEFAULT_OPENAI_PRICING_2026`            | boot seed (idempotency proven by double boot in e2e)                         | ✅     |
| 36  | `pricing.customSeed`                                              | mock model prices (`mock-chat-pro`, `mock-embed`) seeded beside the defaults | ✅     |

### 7.4 Inference wrappers: `AiCommandService` & `EmbeddingService`

| #   | Surface                                                                     | Demonstrated in                                                              | Status |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| 37  | `translate()` (multi-target)                                                | Playground: Translate card                                                   | ✅     |
| 38  | `command.missing_translations`                                              | errors-demo (mock returns partial languages)                                 | ✅     |
| 39  | `summarize()` (`bullet`/`paragraph`/`tldr`)                                 | Playground: Summarize card (style picker)                                    | ✅     |
| 40  | `rewrite()`                                                                 | Playground: Rewrite card                                                     | ✅     |
| 41  | `analyze<T>()` (JSON schema output)                                         | Playground: Analyze card (sentiment + entities schema)                       | ✅     |
| 42  | `custom()` (escape hatch)                                                   | Playground: Custom card (system+user prompt)                                 | ✅     |
| 43  | One-transaction-per-call guarantee                                          | e2e asserts ledger delta == 1 per command                                    | ✅     |
| 44  | Truncated response still debits                                             | errors-demo (`finishReason: 'length'`) + ledger assertion                    | ✅     |
| 45  | Invalid JSON does not debit                                                 | errors-demo (`provider.invalid_json`) + ledger assertion                     | ✅     |
| 46  | `EmbeddingService.generate()`                                               | embeddings panel (single text)                                               | ✅     |
| 47  | `EmbeddingService.generateBatch()` (ONE aggregate transaction, `batchSize`) | embeddings panel (batch mode)                                                | ✅     |
| 48  | `embedding.empty_text`                                                      | errors-demo                                                                  | ✅     |
| 49  | `getDefaultModel()` / `getCurrentPricing()` (both services)                 | Playground header (model + live price badge)                                 | ✅     |
| 50  | `command.missing_parameters`                                                | errors-demo (incomplete DTO)                                                 | ✅     |
| 51  | Per-call `model` override                                                   | Playground model picker (mock models)                                        | ✅     |
| 52  | `resourceId` correlation                                                    | every command sends `resourceId: 'doc-<n>'`; Ledger filters by it (metadata) | ✅     |

### 7.5 Quota: guard, decorators, policy

| #   | Surface                                               | Demonstrated in                                      | Status |
| --- | ----------------------------------------------------- | ---------------------------------------------------- | ------ |
| 53  | `TokenQuotaGuard` (controller-scoped)                 | `workspace` controller                               | ✅     |
| 54  | `@ConsumeTokens` constant estimator                   | Quota Lab endpoint A                                 | ✅     |
| 55  | `@ConsumeTokens` body-size estimator                  | Playground commands (chars/4 heuristic)              | ✅     |
| 56  | `@ConsumeTokens` model-based estimator                | Quota Lab endpoint B                                 | ✅     |
| 57  | `userIdResolver` / `tenantIdResolver` overrides       | Quota Lab endpoint C (header-based)                  | ✅     |
| 58  | `@SkipQuota`                                          | balance + read endpoints                             | ✅     |
| 59  | Unmarked handler passes (guard inert)                 | `GET /workspace/models` under the guarded controller | ✅     |
| 60  | `quota.no_user` (401)                                 | e2e without `x-demo-user`                            | ✅     |
| 61  | `quota.below_minimum` (402)                           | Quota Lab (minimumBalance variant)                   | ✅     |
| 62  | `quota.insufficient_balance` (402, tolerance applied) | scenario §13.5 (drain then blocked)                  | ✅     |
| 63  | `quota.balanceResolver` (inline)                      | primary wiring (ledger-backed balance)               | ✅     |
| 64  | `IQuotaPolicy` via token (class-based)                | e2e variant module                                   | ✅     |
| 65  | `quota.estimationTolerance`                           | Quota Lab tolerance display + e2e boundary test      | ✅     |
| 66  | `quota.enabled: false` path                           | e2e variant (guard admits without resolver)          | ✅     |

### 7.6 Aggregations: `UsageAggregatorService`

| #   | Surface                                     | Demonstrated in                                      | Status |
| --- | ------------------------------------------- | ---------------------------------------------------- | ------ |
| 67  | `getBalance()`                              | Overview balance card + guard resolver               | ✅     |
| 68  | `getUsageByPeriod()` (`day`/`week`/`month`) | Usage page time-series chart (granularity switch)    | ✅     |
| 69  | `getUsageByType()`                          | Usage page donut                                     | ✅     |
| 70  | `getUsageByModel()`                         | Usage page bar chart                                 | ✅     |
| 71  | `getSystemCosts()` (byCategory, byType)     | Usage page "system costs" panel (fed by system-jobs) | ✅     |
| 72  | `getTopConsumers()`                         | Usage page leaderboard (multi-user seed)             | ✅     |

### 7.7 Providers, errors, multi-tenant & shared subpath

| #   | Surface                                                                                                                           | Demonstrated in                                                                      | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------ |
| 73  | `IAiProvider` custom implementation                                                                                               | `MockAiProvider` (§12)                                                               | ✅     |
| 74  | `NoOpAiProvider`                                                                                                                  | unit-test suites (stub wiring)                                                       | ✅     |
| 75  | `OpenAiProvider` (`'openai-default'`)                                                                                             | env-gated opt-in config + `provider.api_key_missing` boot error demo; never in CI    | ✅     |
| 76  | Retry/backoff surface (`rate_limited`, `timeout`)                                                                                 | MockAiProvider failure injection (deterministic, no sleeps in tests via fake timers) | ✅     |
| 77  | `provider.empty_response`, `provider.content_filter`, `provider.unknown_error`, `provider.api_key_invalid`                        | errors-demo (failure-injection markers)                                              | ✅     |
| 78  | `AiTokensException` response shape (`error.code/message/details`)                                                                 | errors page renders the canonical envelope for each trigger                          | ✅     |
| 79  | `AI_TOKENS_ERROR_CODES` constants                                                                                                 | typed error handling in `apps/web` api client                                        | ✅     |
| 80  | `multiTenant.required: false` (default, null = global)                                                                            | primary wiring                                                                       | ✅     |
| 81  | `multiTenant.required: true`                                                                                                      | e2e variant module + tenants page callout                                            | ✅     |
| 82  | `multiTenant.tenantIdResolver`                                                                                                    | header resolver (`x-tenant-id`)                                                      | ✅     |
| 83  | Tenant isolation (A cannot see B)                                                                                                 | Tenants page switcher + e2e proof                                                    | ✅     |
| 84  | `metadata` reserved keys (`isSystemCost`, `systemCostCategory`, `decisionId`, `strategy`, `confidence`, `reasoning`, `batchSize`) | system-jobs + agent-assist demo + embeddings batch                                   | ✅     |
| 85  | `agent_decision_assist` transaction type                                                                                          | system-jobs "agent decision" simulation                                              | ✅     |
| 86  | `AI_TOKEN_TRANSACTION_TYPES` (shared)                                                                                             | Ledger page type filter chips (imported in the browser bundle)                       | ✅     |
| 87  | Shared subpath in both apps                                                                                                       | `apps/api` + `apps/web` import `./shared` types                                      | ✅     |
| 88  | Exported DTOs (`TranslateCommandDto`, ...)                                                                                        | workspace controller reuses the library DTOs                                         | ✅     |
| 89  | `AuthenticatedRequest` type                                                                                                       | identity middleware + estimators typing                                              | ✅     |
| 90  | Streaming                                                                                                                         | ⛔ documented as out of scope in v1 (library §13); noted on the Playground           | ⛔     |

---

## 8 · Library Consumption

The example consumes `@bymax-one/nest-ai-tokens` as a versioned external package, **not** a
workspace member, so it validates the published API surface.

### 8.1 Linking modes (in order, per project phase)

```bash
# (a) Before the library is on npm: local file link (default for early phases)
#     apps/api/package.json -> "@bymax-one/nest-ai-tokens": "file:../../../nest-ai-tokens"

# (b) After publish: the real thing
#     "@bymax-one/nest-ai-tokens": "^0.1.0"

# (c) Iterative library development: global link + watch rebuild on the library side
pnpm --dir ../nest-ai-tokens build --watch &
pnpm link ../nest-ai-tokens
```

### 8.2 Subpath imports

- `apps/api` imports the server subpath (`@bymax-one/nest-ai-tokens`) and shared types.
- `apps/web` imports **only** `@bymax-one/nest-ai-tokens/shared` (zero-dep, browser-safe): types
  for the api client, `AI_TOKEN_TRANSACTION_TYPES` for filter chips, `AI_TOKENS_ERROR_CODES` for
  typed error handling. A CI grep proves the server subpath never reaches the web bundle.
- `openai` is **not installed** in this repository (strategy `'custom'`), proving the optional-peer
  claim. The env-gated OpenAI mode documents the extra install step instead of shipping it.

---

## 9 · Configuration & Environment

### 9.1 Environment variables (`apps/api`)

| Variable                | Default                                                           | Purpose                                                   |
| ----------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`          | `postgresql://postgres:postgres@localhost:5432/ai_tokens_example` | Prisma connection                                         |
| `PORT`                  | `3001`                                                            | API port                                                  |
| `AI_PROVIDER_MODE`      | `mock`                                                            | `mock` (default) or `openai-optin` (local only, never CI) |
| `OPENAI_API_KEY`        | unset                                                             | Only read when `AI_PROVIDER_MODE=openai-optin`            |
| `QUOTA_ENABLED`         | `true`                                                            | Toggles `quota.enabled`                                   |
| `QUOTA_TOLERANCE`       | `1.2`                                                             | `quota.estimationTolerance`                               |
| `QUOTA_MINIMUM_BALANCE` | `0`                                                               | `quota.minimumBalance`                                    |
| `TENANT_REQUIRED`       | `false`                                                           | `multiTenant.required`                                    |
| `PRICING_CACHE_TTL_MS`  | `300000`                                                          | `pricing.cacheTtlMs`                                      |
| `DEMO_SEED_USERS`       | `ada,grace,linus`                                                 | Users created by the seed with allocations                |

`.env.example` documents every row; no secret has a real value anywhere in the repo.

### 9.2 The canonical wiring: `ai/ai-tokens.config.ts`

The options factory is the copy-paste artifact of the whole example. It wires: mock models as
`defaultModels`, `provider.strategy: 'custom'`, `pricing.seedDefaults: true` plus a `customSeed`
for the mock models, the ledger-backed `balanceResolver` (delegating to
`UsageAggregatorService.getBalance` semantics via the repository), quota tolerance/minimum from
env, the header-based `tenantIdResolver`, and the Nest `Logger` bridge. Every option key from the
library's options table appears here or in an e2e variant module, per the Coverage Matrix.

---

## 10 · Backend Design: `apps/api`

### 10.1 Module map & responsibilities

| Module         | Responsibility                                                | Library surface exercised               |
| -------------- | ------------------------------------------------------------- | --------------------------------------- |
| `ai/`          | Options factory, mock provider, repositories, logger bridge   | Module, tokens, provider port, repos    |
| `identity/`    | `x-demo-user`/`x-tenant-id` -> `req.user`; demo user registry | `AuthenticatedRequest`                  |
| `workspace/`   | Commands + embeddings endpoints (Playground backend), guarded | Command/Embedding services, guard, DTOs |
| `ledger/`      | Transactions list/detail, credit top-up, refund               | Ledger service, filters, credit types   |
| `pricing/`     | Current, history, update, flush-cache                         | PricingService end to end               |
| `usage/`       | Balance, aggregations, top consumers, system costs            | UsageAggregatorService                  |
| `quota/`       | Quota Lab endpoints (estimator variants, policy class)        | Decorators, guard, policy token         |
| `system-jobs/` | Simulated maintenance + agent-assist (system costs)           | `record`, metadata reserved keys        |
| `errors-demo/` | Deterministic trigger per error code                          | `AiTokensException`, full catalog       |
| `health/`      | Liveness/readiness (db ping)                                  | none (app infra)                        |

### 10.2 House style

Thin controllers (validate via Zod pipe, delegate, return), JSDoc on every public symbol,
`@fileoverview` + `@layer` header per file, services own the library calls, no `process.env`
outside the config layer, explicit `@Inject` for every library token.

---

## 11 · Demo Domain & REST API

The demo domain is a **multi-tenant AI writing workspace**: users on tenants `acme` and `globex`
run text commands against documents, the platform meters every call, sells token packs, enforces
quotas, and audits costs. Endpoint catalogue (all JSON, all Zod-validated):

| Route                                                                     | Method | Purpose                                                            |
| ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `/workspace/translate`                                                    | POST   | `AiCommandService.translate` (guarded, body estimator)             |
| `/workspace/summarize`                                                    | POST   | `summarize` with style picker                                      |
| `/workspace/rewrite`                                                      | POST   | `rewrite`                                                          |
| `/workspace/analyze`                                                      | POST   | `analyze<T>` with a fixed sentiment/entities schema                |
| `/workspace/custom`                                                       | POST   | `custom` escape hatch                                              |
| `/workspace/embed`                                                        | POST   | `EmbeddingService.generate`                                        |
| `/workspace/embed/batch`                                                  | POST   | `generateBatch` (ONE aggregate transaction)                        |
| `/workspace/models`                                                       | GET    | default models + current pricing badges (unmarked handler)         |
| `/ledger/transactions`                                                    | GET    | filtered, paginated ledger (`@SkipQuota`)                          |
| `/ledger/transactions/:id`                                                | GET    | single transaction + metadata inspector                            |
| `/ledger/credits`                                                         | POST   | top-up (`purchase`) / allocations (seed types)                     |
| `/ledger/refund`                                                          | POST   | compensating `refund` transaction                                  |
| `/pricing`                                                                | GET    | all current pricing                                                |
| `/pricing/:model/history`                                                 | GET    | pricing windows timeline                                           |
| `/pricing/:model`                                                         | PUT    | `updatePricing` (closes window, inserts successor)                 |
| `/pricing/cache/flush`                                                    | POST   | `invalidateCache`                                                  |
| `/usage/balance`                                                          | GET    | `getBalance` (`@SkipQuota`)                                        |
| `/usage/by-period`                                                        | GET    | granularity switch day/week/month                                  |
| `/usage/by-type` · `/usage/by-model`                                      | GET    | donut/bar data                                                     |
| `/usage/top-consumers`                                                    | GET    | leaderboard                                                        |
| `/usage/system-costs`                                                     | GET    | system-cost panel data                                             |
| `/quota/lab/constant` · `/quota/lab/model-based` · `/quota/lab/resolvers` | POST   | estimator variants                                                 |
| `/system-jobs/reindex`                                                    | POST   | bulk embedding as `isSystemCost` (`systemCostCategory: 'reindex'`) |
| `/system-jobs/agent-decision`                                             | POST   | `agent_decision_assist` with decision metadata                     |
| `/errors-demo/:code`                                                      | POST   | deterministic trigger for each catalog code                        |
| `/health/live` · `/health/ready`                                          | GET    | app health                                                         |

---

## 12 · The Mock Provider

`MockAiProvider implements IAiProvider` is the deterministic heart of the example.

- **`name`**: `'mock'`.
- **Token math**: `promptTokens = ceil(totalPromptChars / 4)`, `completionTokens` derived from the
  requested command (translate: proportional to targets, summarize: `min(input/3, maxTokens)`),
  embeddings: `promptTokens` only. Deterministic for a given input.
- **Content**: canned transformations (uppercase "translations" tagged per language, first-N-words
  summaries, JSON built from the analyze schema) so responses are assertable in tests.
- **Failure injection**: a magic marker in the input (`@@fail:rate_limited@@`, `@@fail:timeout@@`,
  `@@fail:empty@@`, `@@fail:content_filter@@`, `@@fail:truncate@@`, `@@fail:bad_json@@`,
  `@@fail:partial_translations@@`) makes the provider throw the corresponding normalized
  `AiTokensException` or return the corresponding degraded response. This is how the example
  reaches **every** `provider.*` and `command.*` error path deterministically.
- **Latency**: small configurable delay so the dashboard shows a believable spinner; zero in tests.
- The provider lives in the example (it is app code, not library code) and doubles as
  documentation for writing an Anthropic/Gemini adapter.

---

## 13 · Demonstration Scenarios

1. **Meter a command end to end.** Run Translate in the Playground: response, token split, USD
   cost breakdown, and the new ledger row appear together; the Overview balance drops.
2. **Batch embeddings, one transaction.** Embed 5 texts in batch mode; the Ledger shows ONE
   transaction with `metadata.batchSize: 5`.
3. **Buy a token pack.** Quota Lab top-up posts a `purchase` credit; balance rises; the ledger is
   append-only (the earlier debits remain untouched).
4. **Change a price without rewriting history.** Update `mock-chat-pro` pricing on the Pricing
   page; the history timeline shows the closed window + successor; a backdated cost calculation
   still uses the old window (assertable via the errors-demo "backdate" helper endpoint).
5. **Hit the quota wall.** Drain the balance in the Playground until the guard returns the
   canonical `402 quota.insufficient_balance` envelope with `{ balance, estimated, tolerance }`;
   top up; retry succeeds.
6. **Tenant isolation.** Switch tenant in the header; the Ledger, Usage, and balance all change;
   an e2e proves tenant A queries never return tenant B rows.
7. **System costs stay off user bills.** Run the reindex job; user reports exclude it; the Usage
   system-costs panel groups it under `reindex`.
8. **Every error, on demand.** The Errors page fires each catalog code and renders the normalized
   envelope, HTTP status, and details payload.

---

## 14 · Frontend Design: `apps/web`

Next.js 16 App Router under the shared dashboard shell. Pages: **Overview** (balance, tokens
consumed, cost USD, usage sparkline), **Playground** (five command cards + embeddings panel + model
picker + live cost breakdown + failure-marker helper), **Ledger** (filterable/paginated table, row
inspector with metadata JSON, refund + top-up actions), **Pricing** (current table, per-model
history timeline, update form, flush cache), **Usage** (by-period chart with granularity switch,
by-type donut, by-model bars, top consumers, system costs), **Quota Lab** (tolerance/minimum
visualization, estimator variants, drain/top-up), **Tenants** (user/tenant switcher, isolation
walkthrough), **Errors** (catalog triggers). The switcher sets `x-demo-user`/`x-tenant-id` on the
typed api client; all shared types come from `@bymax-one/nest-ai-tokens/shared`.

---

## 15 · Design System

`apps/web` reuses the shared Bymax design system **verbatim**: [`design_system.html`](design_system.html)
(copied from the sibling examples) is the single source for tokens, fonts, the glass shell, and
component recipes. Drop a screenshot beside `nest-auth-example` or `nest-cache-example` and the
chrome must be indistinguishable; only the navigation entries and the accent iconography differ.

---

## 16 · Persistence: Prisma Repositories

Prisma models follow the library's reference schemas exactly (`AiTokenTransaction` with `Int`
amount + `Jsonb` metadata + the six documented indexes; `ModelPricing` with `Decimal(10,6)` prices
and window indexes). Implementation rules the tasks enforce:

- `sumAmount`, `groupByType`, `groupByUser` run **in the database** (`aggregate`/`groupBy`), never
  in memory; a test guards against regression by asserting query shape.
- `findActive` implements the documented window predicate; `upsertIfMissing` is race-safe for the
  boot seed; `closeCurrentWindow` returns the updated row count.
- Repositories map Prisma rows to the library's interfaces (Decimal -> number at the boundary).
- Migrations + a deterministic seed (`DEMO_SEED_USERS` with `monthly_allocation`/
  `trial_allocation` credits, both tenants, a spread of historical debits for charts).

---

## 17 · Quota Enforcement

The guard is applied at the `workspace` and `quota` controllers (not globally), demonstrating the
documented placement. The primary `balanceResolver` derives the lifetime balance from the ledger
(`sumAmount` per user/tenant). Quota Lab exposes the three estimator families, the resolver
overrides, `@SkipQuota`, the unmarked-handler passthrough, and renders the guard decision inputs
(`balance`, `estimated`, `tolerance`, `minimumBalance`) so the 402 envelopes are explainable.

---

## 18 · Multi-Tenant Model

Two seeded tenants (`acme`, `globex`) plus a global (null-tenant) admin user. Default mode is
`required: false` (null = global); an e2e variant boots with `required: true` and proves
`ledger.tenant_required`. The `tenantIdResolver` reads the demo header, mirroring the JWT-claim
pattern documented by the library. Pricing is intentionally shared across tenants; the Tenants page
states this boundary honestly.

---

## 19 · Error Handling

The library throws `AiTokensException` with the canonical `{ error: { code, message, details } }`
body and correct HTTP status; the example does **not** wrap or re-map it (that is the point). The
errors-demo module triggers all 24 catalog codes: ledger (3), pricing (3), provider (9 via mock
markers and boot variants), embedding/command (4), quota (3), config (2, via boot-variant e2e).
The web api client narrows on `AI_TOKENS_ERROR_CODES` and surfaces `details` verbatim.

---

## 20 · Observability

The `BYMAX_AI_TOKENS_LOGGER` token is bound to a thin bridge over the Nest `Logger` so every
transaction logs the documented structured line (`transactionId`, `userId`, `tenantId`, `amount`,
`type`, `model`) and **never** the full metadata (PII rule). The bridge notes, in JSDoc, how a real
service swaps in `@bymax-one/nest-logger`. `logger.verbose` stays `false` outside local dev.

---

## 21 · Local Stack & Docker

`docker-compose.yml` runs `postgres:17-alpine` with a named volume and a healthcheck;
`pnpm infra:up`/`infra:down`/`infra:nuke` wrap it. `pnpm dev` boots api (3001) + web (3000).
First-run path: `pnpm install && pnpm infra:up && pnpm --filter api prisma:migrate:dev && pnpm dev`.
No Redis, no message broker: the library needs only its repositories.

---

## 22 · Testing Strategy

| Tier       | Tooling                                                      | Bar                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (api) | Jest, `NoOpAiProvider`/`MockAiProvider`, `maxWorkers: '50%'` | 100% line/branch/function/statement                                                                                                                                           |
| Unit (web) | Vitest + Testing Library                                     | 100% on `lib/**` and components                                                                                                                                               |
| E2E (api)  | Jest + supertest + Testcontainers `postgres:17-alpine`       | every route, every error code, every guard path, tenant isolation, seed idempotency, module variants (sync, ledger-only, tenant-required, quota-policy, invalid-config boots) |
| Web smoke  | Playwright                                                   | shell renders, one command round-trip against a live api                                                                                                                      |
| Audit      | `scripts/audit-library-exports.mjs`                          | every library export appears in the repo or is ⛔-justified in §7                                                                                                             |

Suites run sequentially (one package at a time, bounded workers); e2e uses fake timers for retry
paths so no test sleeps.

---

## 23 · Tooling & Conventions

Mirrors the family: pnpm workspaces (`apps/*`), TS 5.9 strict + `noUncheckedIndexedAccess` +
`exactOptionalPropertyTypes`, ESLint 9 flat + Prettier 3, husky + commitlint (Conventional
Commits) + lint-staged, Renovate, `.nvmrc` 24, English-only identifiers/comments/docs, JSDoc with
`@fileoverview` + `@layer` on every file, no Swagger (Zod + JSDoc), no `@ts-ignore`/
`eslint-disable`, no `.gitkeep`, timeless comments (no plan/phase references in committed code).

**CI (from phase 00):** `ci.yml` runs install, lint, typecheck, build, unit, e2e (Postgres service
container) sequentially. **CodeQL and OpenSSF Scorecard workflows are included but conditional**:
they activate when the repository becomes public (visibility guard), so the pipeline is
public-ready while the repo is private.

---

## 24 · Security & Safety

- **No real credentials anywhere**: no OpenAI key in code, fixtures, or CI; `.env.example` ships
  placeholder-free names only; secret scanning stays clean.
- **PII rule**: metadata is never logged in full; prompts are never stored in metadata (the
  workspace stores a `resourceId` reference instead).
- **Demo identity is not auth**: the identity middleware is clearly labeled a simulation; the
  README points to `nest-auth-example` for the real pattern.
- **Least-privilege CI**: SHA-pinned actions, explicit `permissions:` blocks, dependency review.

---

## 25 · What This Project Intentionally Excludes

| Excluded                              | Reason                                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| Real LLM calls in CI / real API keys  | Determinism + safety; mock provider covers every path            |
| Real billing (Stripe, invoices)       | Library boundary; simulated via `recordCredit`                   |
| Real authentication                   | `nest-auth`'s job; demo headers simulate identity                |
| Response streaming                    | Library v1 boundary (documented ⛔ in §7)                        |
| Local tokenizer estimation (tiktoken) | Consumer concern; estimators use the documented char/4 heuristic |
| Kubernetes / production deploy        | Local reference only                                             |

---

## 26 · References

- Library docs: `@bymax-one/nest-ai-tokens` technical specification & README (repository
  `bymaxone/nest-ai-tokens`)
- Sibling reference apps: `nest-auth-example`, `nest-logger-example`, `nest-cache-example`
- NestJS 11 documentation (dynamic modules, guards, `SetMetadata`/`Reflector`)
- Prisma documentation (aggregations, `Decimal`, `Jsonb`, migrations, seeding)
- Next.js 16 App Router documentation

---

## 27 · Document Status

**Status:** Draft for implementation (v1.0.0, 2026-07-06). This document is normative for the
`DEVELOPMENT_PLAN.md` phases and the `docs/tasks/` files. Reconciliation rule: if the published
library surface differs from §4/§7, update this spec and the matrix in the same PR that adapts the
code; never adapt silently.
