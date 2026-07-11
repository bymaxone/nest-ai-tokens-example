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

The spine of the project, reconciled against the SHIPPED library v0.1.0 (the drafted rows this
section originally carried cited pre-release names; the per-phase Reconciliation notes in
[`docs/tasks/`](tasks/README.md) record every mapping). The audited truth is the installed
package's `exports` map and dist d.ts files across all five subpaths (`.`, `./shared`, `./prices`,
`./prisma`, `./redis`). `scripts/audit-library-exports.mjs` (CI gate: `pnpm audit:exports`)
enumerates those real exports, marks a name **demonstrated** when an app source imports it from
the library, and requires every remaining name to be ⛔-justified in §7.7; any export that is
neither fails CI. Names exported by both `.` and `./shared` are audited once per subpath and
satisfied by an import from either.

Status legend: ✅ demonstrated (imported by `apps/`; evidence beside) · ⛔ intentionally not
exercised (reason beside; enforced by the audit).

### 7.1 Module, registration & DI

| #   | Library surface                                                            | Demonstrated in                                                                             | Status |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| 1   | `BymaxAiTokensModule.forRootAsync` + `BymaxAiTokensModuleOptions`          | `apps/api/src/ai/ai.module.ts` + `ai/ai-tokens.config.ts` (primary wiring)                  | ✅     |
| 2   | `BymaxAiTokensModule.forRoot` (sync registration)                          | `apps/api/test/e2e/module-variants.e2e-spec.ts`                                             | ✅     |
| 3   | Global-by-construction module (no re-import per feature module)            | workspace/ledger/pricing/usage modules inject library services without importing the module | ✅     |
| 4   | `IAiTokensStore` (the single composed `store` binding)                     | `ai/ai-tokens.config.ts` binds the store over `PrismaService`                               | ✅     |
| 5   | `PrismaAiTokensStore` (`./prisma`, the shipped PostgreSQL adapter)         | `apps/api/src/ai/ai-store.module.ts`                                                        | ✅     |
| 6   | `BYMAX_AI_TOKENS_OPTIONS` (effective-options injection)                    | `apps/api/src/ai/wiring.service.ts` (`GET /health/wiring` report)                           | ✅     |
| 7   | `BYMAX_AI_TOKENS_LOGGER` (reserved in v0.1.0, bound `null`)                | `apps/api/src/ai/wiring.service.ts` reports the honest `loggerBound: false`                 | ✅     |
| 8   | `scopeResolver` (host identity to `MeteringContext`)                       | `ai/ai-tokens.config.ts` + `identity/identity.middleware.ts`                                | ✅     |
| 9   | Ledger-only variant (wallets/budgets off, `quota.disabled` 503)            | `module-variants.e2e-spec.ts` + `quota-status`/`quota-budgets` null-tolerant services       | ✅     |
| 10  | Invalid-config boots (`AI_TOKENS_INVALID_CONFIG`, `AI_TOKENS_FX_REQUIRED`) | `module-variants.e2e-spec.ts` boot-variant walk                                             | ✅     |

### 7.2 Metering lifecycle & decorators

| #   | Library surface                                                         | Demonstrated in                                                                   | Status |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| 11  | `MeteringService.record` (post-hoc metering)                            | every workspace command via `apps/api/src/ai/metered-call.ts`                     | ✅     |
| 12  | `MeteringService.hold` / `capture` / `release` (enforced lifecycle)     | `ai/metered-call.ts` (`runWithHold`) + `quota/quota-lab.service.ts`               | ✅     |
| 13  | `MeteringService.reverse` (compensating refund)                         | `ledger` refund flow (`POST /ledger/refund`)                                      | ✅     |
| 14  | `MeteringService.estimateCost` + `CostEstimate`                         | `errors-demo/errors-demo.service.ts` (backdated-cost helper, §13.4)               | ✅     |
| 15  | `Meter` + `MeterConfig` + `METER_METADATA`                              | `quota/quota.controller.ts` (declarative constant-lab route)                      | ✅     |
| 16  | `RequireBudget` + `RequireBudgetConfig` + `REQUIRE_BUDGET_METADATA`     | `quota/quota.controller.ts` (static pre-handler hold)                             | ✅     |
| 17  | `MeteringInterceptor` (settlement + `x-ai-tokens-*` headers)            | `quota/quota.controller.ts` + `quota-lab.e2e-spec.ts` header assertions           | ✅     |
| 18  | `BudgetGuard` (wrapped by the app's null-tolerant `EnforcementGuard`)   | `apps/api/src/ai/enforcement.guard.ts`                                            | ✅     |
| 19  | `Hold` + `HoldEstimate` (typed reservations)                            | `ai/metered-call.ts` + `errors-demo/trigger-registry.ts` (hold-code proofs)       | ✅     |
| 20  | `MeteringContext` + `MeteringScope`                                     | `apps/api/src/ai/metering-context.ts` + `apps/web/src/lib/api-types.ts`           | ✅     |
| 21  | `ProviderPreset` + `NormalizedUsage` + `normalizeOpenAiCompatibleUsage` | `apps/api/src/ai/mock-usage.presets.ts` (chat + embedding presets)                | ✅     |
| 22  | `providerPresets` (shipped preset catalog)                              | `errors-demo/trigger-registry.ts` (`AI_TOKENS_UNKNOWN_PROVIDER` proof)            | ✅     |
| 23  | `StreamUsageCollector`                                                  | `errors-demo/trigger-registry.ts` (`AI_TOKENS_STREAM_USAGE_MISSING` proof)        | ✅     |
| 24  | `UsageRecord` + `UsageStatus` (ledger row shape + lifecycle union)      | `ai/metered-call.ts`, `ledger/dto/list-transactions.query.ts`, web `api-types.ts` | ✅     |
| 25  | `JsonSafe` + `toJsonSafe` (wire-safe serialization of bigint money)     | `errors-demo/errors-demo.service.ts` + `quota/quota-status.service.ts`            | ✅     |

### 7.3 Ledger & usage reports

| #   | Library surface                                                  | Demonstrated in                                                             | Status |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ------ |
| 26  | `LedgerService.query` + `LedgerFilter`                           | `apps/api/src/ledger/ledger-read.service.ts` (`GET /ledger/transactions`)   | ✅     |
| 27  | `LedgerService.sumCost` + `LedgerCostSummary`                    | `ledger/ledger-read.service.ts` (list totals + overview stat cards)         | ✅     |
| 28  | `LedgerService.findById`                                         | `ledger/ledger-read.service.ts` (`GET /ledger/transactions/:id`)            | ✅     |
| 29  | `UsageReportService.summarize` + `UsageSummary` + `ReportFilter` | `apps/api/src/usage/usage-analytics.service.ts` (every `/usage/*` grouping) | ✅     |
| 30  | `TOKEN_CATEGORIES` (per-category token breakdown)                | `usage/usage-analytics.service.spec.ts` (exact category reconciliation)     | ✅     |

### 7.4 Pricing

| #   | Library surface                                   | Demonstrated in                                                                | Status |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| 31  | `PricingService.resolveRate`                      | `workspace/workspace-models.service.ts` + `errors-demo` backdated-cost helper  | ✅     |
| 32  | `PricingService.upsertPrice` + `NewPriceVersion`  | `pricing/pricing-catalog.service.ts` (`PUT /pricing/:model`, window close)     | ✅     |
| 33  | `PriceVersion` (effective-dated window shape)     | `pricing` views + web pricing timeline (`apps/web/src/lib/api-types.ts`)       | ✅     |
| 34  | `MODEL_PRICES_SEED` + `SeedPriceRow` (`./prices`) | `pricing/pricing-seed.service.ts` + `pricing/mock-model-prices.ts` (boot seed) | ✅     |

### 7.5 Wallets & budgets

| #   | Library surface                                                 | Demonstrated in                                                               | Status |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| 35  | `WalletService.getBalance` / `grant` / `debit` + `WalletRef`    | `usage` balance read, `ledger` credits, seed grants, drain shortcuts          | ✅     |
| 36  | `WalletEntry` (append-only wallet ledger rows)                  | `ledger` credit views + `errors-demo/trigger-registry.ts`                     | ✅     |
| 37  | `BudgetService` + `UpsertBudgetInput`                           | `quota/quota-budgets.service.ts` (`POST/GET /quota/budgets`)                  | ✅     |
| 38  | `Budget` + `BudgetStatus` + `BudgetPolicy` + `BudgetWindowKind` | `quota` budget surface + `apps/web/src/lib/api-types.ts`                      | ✅     |
| 39  | `AccessStatus` (combined wallet + budget verdict)               | `quota/quota-status.service.ts` (`GET /quota/status`) + web guard inputs card | ✅     |

### 7.6 Errors, catalogs & money helpers

| #   | Library surface                                                         | Demonstrated in                                                                      | Status |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------ |
| 40  | `AiTokensException` (canonical `{ error: { code, message, details } }`) | `errors-demo` end-to-end envelope walk (26-code catalog)                             | ✅     |
| 41  | `AI_TOKENS_ERROR_CODES` + `AiTokensErrorCode`                           | `errors-demo/error-catalog.ts` + typed narrowing in `apps/web/src/lib/api-client.ts` | ✅     |
| 42  | `AI_OPERATIONS` + `AiOperation`                                         | `ledger/dto/list-transactions.query.ts` + web ledger filter chips                    | ✅     |
| 43  | `SERVICE_TIERS` + `ServiceTier`                                         | `ledger/dto/list-transactions.query.ts` + `apps/web/src/lib/api-types.ts`            | ✅     |
| 44  | `ProviderId`                                                            | `apps/web/src/lib/api-types.ts` (typed wire shapes)                                  | ✅     |
| 45  | `formatNanoUsd` + `floatUsdToNanoUsd` + `computeCostNanoUsd`            | `ledger/ledger-credit.service.ts`, web `money.ts`, `ledger-pricing` e2e math         | ✅     |
| 46  | Shared subpath as the ONLY browser import (`./shared`)                  | `apps/web` imports + the CI `web-import-guard` job                                   | ✅     |

### 7.7 Intentionally not exercised (audited ⛔ justifications)

Every name below is a real export of the shipped dist that the example deliberately does not
import; the audit fails if a name is neither imported nor listed here with a reason.

| #   | Library surface                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Why not exercised                                                                                                                                                                                                                                                                                                              | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 47  | `BYMAX_AI_TOKENS_LEDGER_STORE`, `BYMAX_AI_TOKENS_PRICING_STORE`, `BYMAX_AI_TOKENS_WALLET_STORE`, `BYMAX_AI_TOKENS_BUDGET_STORE`, `BYMAX_AI_TOKENS_BUDGET_COUNTER`, `BYMAX_AI_TOKENS_CONTENT_STORE`, `BYMAX_AI_TOKENS_EVENT_SINK`, `BYMAX_AI_TOKENS_TELEMETRY`, `BYMAX_AI_TOKENS_TOKENIZER`, `ILedgerStore`, `IPricingStore`, `IWalletStore`, `IBudgetStore`, `IBudgetCounterStore`, `IContentStore`, `IEventSink`, `ITelemetrySink`, `ITokenizer`, `IMarkupPolicy` | The example binds the ONE composed `store` object (`IAiTokensStore` via the shipped `PrismaAiTokensStore`); the granular per-port tokens and interfaces are the advanced composition path for hosts assembling a store from parts or adding optional sinks, which a single-adapter reference app cannot honestly duplicate.    | ⛔     |
| 48  | `AiTokensEvent`, `AiTokensEventType`, `AuditEventData`, `UsageRecordedEventData`, `UsageReversedEventData`, `HoldReleasedEventData`, `PriceMissingEventData`, `WalletGrantedEventData`, `WalletDepletedEventData`, `WalletLowBalanceEventData`, `BudgetExceededEventData`, `BudgetProjectedExceededEventData`, `BudgetThresholdCrossedEventData`                                                                                                                   | Payload types of the optional event sink; meaningless without an `IEventSink` binding (row 47), which the example does not register.                                                                                                                                                                                           | ⛔     |
| 49  | `RecordInput`, `AdjustInput`, `DebitInput`, `GrantInput`, `RefundInput`, `EstimateCostInput`, `ResolveRateInput`, `LedgerAppendInput`, `NewUsageRecord`, `NewWalletEntry`, `SummarizeInput`, `UsageReportOptions`                                                                                                                                                                                                                                                  | Structural method-input types: the app passes object literals that TypeScript checks against the service signatures, so importing the names would add aliases without demonstrating anything new.                                                                                                                              | ⛔     |
| 50  | `OpenGrant`, `Wallet`, `WalletBalance`, `WalletEntryFilter`, `WalletEntryPage`, `WalletEntryType`, `BudgetDelta`, `BudgetDimensionSnapshot`, `BudgetLimits`, `BudgetWindowSpend`, `PricedModel`, `CostBreakdown`, `MeterResult`                                                                                                                                                                                                                                    | Structural return/view types consumed through inference from the demonstrated service calls (`getBalance`, `status`, `resolveRate`, the interceptor result); never re-declared, never needed by name.                                                                                                                          | ⛔     |
| 51  | `BymaxAiTokensModuleAsyncOptions`, `BymaxAiTokensModuleOptionsFactory`, `RequestAiTokens`, `WalletServiceOptions`, `BudgetServiceOptions`, `StreamUsageCollectorOptions`, `FormatNanoUsdOptions`, `ReportExportFormat`, `ReportGroupBy`                                                                                                                                                                                                                            | Option/factory types for registration and call styles the app does not use: the async options are inferred at the `forRootAsync` call site, the `useClass` factory path duplicates the demonstrated `useFactory`, and the optional knobs keep their defaults.                                                                  | ⛔     |
| 52  | `KnownProviderId`, `PROVIDER_IDS`, `RatingMode`, `ScopeType`, `TokenCategory`, `UsageNormalizer`, `WALLET_ENTRY_TYPES`, `AiTokensErrorResponse`                                                                                                                                                                                                                                                                                                                    | Catalog aliases whose values already flow through the demonstrated unions (`ProviderId`, `MeteringScope`, `TOKEN_CATEGORIES`, `AiTokensErrorCode`); the app types against the narrower demonstrated names.                                                                                                                     | ⛔     |
| 53  | `normalizeAnthropicUsage`, `normalizeBedrockConverseUsage`, `normalizeGeminiUsage`, `normalizeMistralUsage`, `normalizeOpenAiChatUsage`, `normalizeOpenAiResponsesUsage`, `normalizeOpenRouterUsage`, `normalizeVercelAiSdkUsage`                                                                                                                                                                                                                                  | Each normalizer maps its vendor SDK's real payload shape; the deterministic mock provider emits OpenAI-compatible responses, so the normalizer contract is demonstrated through `normalizeOpenAiCompatibleUsage` and the app's own presets. Exercising the other vendors would require their SDKs and keys (spec §2 non-goal). | ⛔     |
| 54  | `AMOUNT_FIELDS`, `RELEASE_FIELDS`, `SETTLEMENT_FIELDS`, `SETTLEMENT_PATCH_KEYS`, `REVERSAL_LINKAGE_FIELD`, `isLegalLedgerTransition`, `isLegalTransitionPatchKey`, `applyMarkup`, `perMillion`, `resolveMultiplier4dp`, `deriveIdempotencyKey`                                                                                                                                                                                                                     | Adapter-authoring helpers (field lists, transition guards, rating math) for hosts writing a CUSTOM store; the example consumes the shipped Prisma adapter, which applies them internally.                                                                                                                                      | ⛔     |
| 55  | `AiFeature`, `AI_FEATURE_METADATA`                                                                                                                                                                                                                                                                                                                                                                                                                                 | The standalone feature-labeling decorator; the app declares features through the demonstrated `@Meter({ feature })` config, the composed path.                                                                                                                                                                                 | ⛔     |
| 56  | `RedisBudgetCounterStore`, `RedisBudgetCounterStoreOptions`, `CounterValueOutOfRangeError` (`./redis`)                                                                                                                                                                                                                                                                                                                                                             | Distributed budget counters need Redis infrastructure; this example is deliberately Postgres-only (one compose service) and demonstrates the default in-store counter path.                                                                                                                                                    | ⛔     |

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
