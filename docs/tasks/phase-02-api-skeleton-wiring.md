# Phase 02: API Skeleton & Module Wiring

> **Status**: ✅ Done · **Progress**: 5 / 5 tasks · **Last updated**: 2026-07-10
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#per-phase-detail) §Phase 02
> **Source spec**: [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md) §9.2 (canonical wiring), §10 (Backend Design), §3 (Architecture)

## Context

Phases 00-01 delivered tooling, data layer, and the linked library. This phase turns `apps/api`
into a booting NestJS 11 application with the library registered through the canonical
`BymaxAiTokensModule.forRootAsync` factory (see the reconciliation note below): the store binding
with a placeholder store (the Prisma-backed `IAiTokensStore` implementation replaces it in phase
03), demo identity, health endpoints, and the Testcontainers e2e harness. CI gains `build`,
`test`, and `e2e` jobs.

> **Reconciliation (2026-07-10):** the shipped library v0.1.0 supersedes the API drafted here and
> in spec §4/§9.2 (same rule as the phase 01 note). The real surface is: registration via
> `BymaxAiTokensModule.forRootAsync({ imports, inject, useFactory })` (no `registerAsync`, no
> `isGlobal` flag — the module is `@Global()` by construction); ONE required `store` object
> implementing `IAiTokensStore` (ledger + pricing ports, wallet/budget ports when those feature
> blocks are enabled) instead of two repository DI tokens; no provider port (`IAiProvider`),
> no `defaultModels`, no `quota`/`multiTenant` blocks — enforcement is the opt-in `wallets`/
> `budgets` blocks plus the host `scopeResolver`, and there is no estimation-tolerance option;
> no `AuthenticatedRequest` type (the host owns its request identity shape); the
> `BYMAX_AI_TOKENS_LOGGER` token is reserved (bound `null`, no consumer in v0.1.0), so no logger
> bridge is wireable yet. Tasks below were executed against the shipped dist/types; acceptance
> criteria were aligned in the same commits and every mapping is documented in the PR body.

> **Completion Protocol ("standard steps"):** task Status ✅ (block + index) -> checkboxes ->
> header Progress -> plan dashboard row + overall counter -> tasks README -> Completion log entry
> -> Conventional commit.

## Rules-of-phase

1. The options factory (`ai/ai-tokens.config.ts`) is the copy-paste artifact: every option it sets
   must come from typed env config, with JSDoc explaining each choice.
2. Explicit `@Inject` for every library token; the store binding lives beside `forRootAsync`
   exactly as the library documents.
3. No `process.env` outside the config layer.
4. The demo identity middleware is clearly labeled a simulation (JSDoc + README note).
5. `main.ts` uses a `createApp()` seam so e2e can boot the exact production wiring and coverage
   reaches the bootstrap.

## Reference docs

- Spec §9 (env + wiring), §10.1-10.2, §22 (e2e tier)
- Library: `BymaxAiTokensModuleOptions` (§4 of its spec) and the registration example (§4.3);
  verify against the published README/types

## Task index

| ID  | Task                                                                      | Status | Priority | Size | Depends on |
| --- | ------------------------------------------------------------------------- | ------ | -------- | ---- | ---------- |
| 2.1 | Branch + NestJS skeleton (`createApp` seam, Zod pipe, config module)      | ✅     | P0       | M    | none       |
| 2.2 | Demo identity middleware + user registry                                  | ✅     | P0       | S    | 2.1        |
| 2.3 | Library wiring: options factory + repository/logger placeholders bindings | ✅     | P0       | M    | 2.2        |
| 2.4 | Health module + Testcontainers e2e harness + CI build/test/e2e jobs       | ✅     | P0       | M    | 2.3        |
| 2.5 | Phase close: audit, dashboards, PR + Copilot review                       | ✅     | P0       | S    | 2.1..2.4   |

---

## Task 2.1: Branch + NestJS skeleton

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: none

#### Description

NestJS 11 app skeleton: `main.ts` split into `createApp()` (returns the configured
`INestApplication`) and `bootstrap()`; a typed env config module (Zod-validated at boot, single
read point); the global `ZodValidationPipe`; `app.module.ts` with placeholders for the feature
modules.

#### Acceptance criteria

- [x] Branch `feat/phase-02-api-skeleton-wiring` created with `git switch -c`.
- [x] NestJS 11 deps added (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`,
      `reflect-metadata`, `rxjs` at 11.1.x); versions verified against current docs.
- [x] Env config: Zod schema covering the spec §9.1 rows implemented so far; boot fails fast with
      an aggregated, value-free error report on invalid env.
- [x] `pnpm --filter api dev` boots (Nest CLI watch); `GET /` returns a JSON hello naming the
      example (verified against the compiled `dist/main.js` boot path).
- [x] Unit tests for the env schema and pipe; coverage 100% on files added.

#### Files to create / modify

- `apps/api/src/main.ts`, `src/app.module.ts`, `src/common/zod-validation.pipe.ts`,
  `src/config/env.ts`, `apps/api/package.json`

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example, reference app for @bymax-one/nest-ai-tokens (AI token ledger,
pricing, quota for NestJS 11). pnpm workspace; Postgres + Prisma from phase 01.

CURRENT PHASE: 02, Task 2.1 of 5 (FIRST).

PRECONDITIONS
- Phase 01 merged: apps/api exists with Prisma; library linked via file:.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §9.1 (env), §10.2 (house style)
- docs/DEVELOPMENT_PLAN.md §2 (Global Conventions)

TASK
Create the phase branch and the NestJS skeleton with a testable bootstrap seam.

DELIVERABLES
1. Branch: `git switch -c feat/phase-02-api-skeleton-wiring` (NEVER `git checkout -b`).
2. NestJS 11 dependencies (verify current minor against official docs before pinning).
3. src/config/env.ts: Zod schema (DATABASE_URL url, PORT coerce number default 3001,
   AI_PROVIDER_MODE enum ['mock','openai-optin'] default 'mock', QUOTA_ENABLED boolean default
   true, QUOTA_TOLERANCE number default 1.2, QUOTA_MINIMUM_BALANCE number default 0,
   TENANT_REQUIRED boolean default false, PRICING_CACHE_TTL_MS number default 300000); parse once
   at boot; on failure print variable NAMES and issues only (never values) and exit non-zero;
   export a typed accessor.
4. src/common/zod-validation.pipe.ts: global pipe validating DTOs declared as Zod schemas.
5. src/main.ts: `export async function createApp(): Promise<INestApplication>` wiring pipe +
   shutdown hooks; `bootstrap()` calls createApp + listen(PORT); guard so import does not listen
   (only direct execution does).
6. src/app.module.ts minimal; GET / hello route in a tiny AppController.
7. Unit tests: env schema happy/invalid paths, pipe behavior. 100% coverage on new files; every
   it() carries a scenario comment; jest maxWorkers '50%'.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- @fileoverview + @layer header per file; JSDoc on exports; strict TS no any; no suppressions;
  functions <= 50 lines; timeless comments; no em dashes; English only.

Verification:
- `pnpm --filter api dev` boots and GET / responds.
- `pnpm --filter api test:cov` 100% on implemented files.

Completion Protocol: standard steps; commit `feat(api): nest skeleton with createApp seam (2.1)`.
```

---

## Task 2.2: Demo identity middleware + user registry

- **Status**: ✅ Done · **Priority**: P0 · **Size**: S · **Depends on**: 2.1

#### Description

`identity/` module: a middleware that reads `x-demo-user` and `x-tenant-id`, resolves the user
from a static demo registry (the phase 01 seed users), and attaches
`req.user = { id, tenantId }` in the `AuthenticatedRequest` shape the library documents. Unknown
users get 401 with a helpful body. Clearly labeled simulation.

#### Acceptance criteria

- [x] Middleware applied globally except `/health/*`.
- [x] `req.user` is typed (no `any`) via the app-level `AuthenticatedRequest`/`DemoIdentity`
      shape the library's `scopeResolver` reads (v0.1.0 exports no `AuthenticatedRequest` type;
      see the phase Reconciliation note).
- [x] Unknown `x-demo-user` -> 401 JSON listing valid demo users (received value never echoed).
- [x] Missing header -> request proceeds unauthenticated (`req.user` undefined) so the
      enforcement no-user path stays demonstrable later.
- [x] Unit tests cover all branches (100%).

#### Files to create / modify

- `apps/api/src/identity/identity.middleware.ts`, `identity/demo-users.ts`,
  `identity/identity.module.ts`, `src/app.module.ts`

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 02, Task 2.2 of 5 (MIDDLE).

PRECONDITIONS
- Task 2.1 done: skeleton boots.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §3 (decision 3), §18 (tenants) and NG2
- Library type `AuthenticatedRequest` from @bymax-one/nest-ai-tokens (import it; verify shape
  from the package types, not memory)

TASK
Implement the demo identity simulation.

DELIVERABLES
1. identity/demo-users.ts: registry matching the phase 01 seed (ada/acme, grace/acme,
   linus/globex, root/null-tenant) as a typed const.
2. identity/identity.middleware.ts: reads x-demo-user + x-tenant-id; known user -> attach
   req.user { id, tenantId: header ?? registry default }; unknown -> 401 with the valid list;
   absent header -> next() untouched. JSDoc states loudly this is a demo simulation and points to
   nest-auth for real authentication.
3. identity/identity.module.ts + registration in AppModule (exclude /health).
4. Unit tests: known/unknown/absent/tenant-override branches; 100% coverage; commented it().

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Strict TS, JSDoc + @fileoverview/@layer, timeless comments, no em dashes, no suppressions.

Verification:
- `pnpm --filter api test:cov` green at 100% on implemented files.

Completion Protocol: standard steps; commit `feat(api): demo identity middleware (2.2)`.
```

---

## Task 2.3: Library wiring: options factory + bindings

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: 2.2

#### Description

The canonical wiring. `ai/ai-tokens.config.ts` builds `BymaxAiTokensModuleOptions` from the typed
env (mock default models, `provider.strategy: 'custom'`, pricing seed flags, quota block with a
ledger-backed `balanceResolver` placeholder that phase 05 completes, `multiTenant` block with the
header resolver, logger level); `app.module.ts` calls `BymaxAiTokensModule.registerAsync` with the
factory plus providers: `BYMAX_AI_TOKENS_TRANSACTION_REPOSITORY`/`PRICING_REPOSITORY` bound to
thin placeholder classes throwing "arrives in phase 03" (typed to the ports), the provider token
bound to a minimal echo provider (replaced in phase 04), and `BYMAX_AI_TOKENS_LOGGER` bridged to
the Nest `Logger`.

#### Acceptance criteria

- [x] `forRootAsync` (the shipped registration API; the module is `@Global()` by construction,
      superseding the drafted `registerAsync`/`isGlobal`); boot succeeds with the placeholder
      store (`pricing.seedFromSnapshot: false` until persistence lands).
- [x] The required `store` option is bound to a full-surface placeholder typed to
      `IAiTokensStore` (v0.1.0 takes ONE store object instead of per-repository DI tokens);
      every consumed token/service is injected with explicit `@Inject`; imports come from the
      package root (no deep paths).
- [x] The factory reads ONLY the typed env accessor; JSDoc explains every option block.
- [x] An injectable smoke service resolves `LedgerService` and `PricingService` (the shipped
      service names) plus `BYMAX_AI_TOKENS_OPTIONS`/`BYMAX_AI_TOKENS_LOGGER` from the container
      behind `GET /health/wiring`; the logger token is surfaced as the reserved (null) v0.1.0
      extension point since no logger bridge is wireable yet.
- [x] Unit tests: factory output per env permutation (quota on/off, tenant required, overdraft
      mapping), scope-resolver branches, placeholder store contract, metadata shim. 100% on new
      files.

#### Files to create / modify

- `apps/api/src/ai/ai-tokens.config.ts`, `ai/ai.module.ts`, `ai/logger.bridge.ts`,
  `ai/repositories/*.placeholder.ts`, `ai/echo.provider.ts`, `src/app.module.ts`

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 02, Task 2.3 of 5 (MIDDLE).

PRECONDITIONS
- Tasks 2.1-2.2 done. Library linked; its exports available.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §9.2 (canonical wiring) and §4.1 (token inventory)
- The library's registration example and options interface from its README/types (verify the
  actual registerAsync signature and token names from the package, never memory)

TASK
Wire BymaxAiTokensModule through the canonical registerAsync factory.

DELIVERABLES
1. ai/ai-tokens.config.ts: `buildAiTokensOptions(env): BymaxAiTokensModuleOptions` covering
   defaultModels { command: 'mock-chat-pro', embedding: 'mock-embed' }, provider
   { strategy: 'custom' }, pricing { seedDefaults: true, customSeed: MOCK_MODEL_PRICING,
   cacheTtlMs: env }, quota { enabled: env, estimationTolerance: env, minimumBalance: env,
   balanceResolver: placeholder delegating to a QuotaBalancePort injectable (real impl phase 05) },
   multiTenant { required: env, tenantIdResolver: req => req.user?.tenantId }, logger
   { level: 'log', verbose: false }, isGlobal: true. Export MOCK_MODEL_PRICING (mock-chat-pro,
   mock-chat-lite, mock-embed with plausible USD-per-1M prices).
2. ai/logger.bridge.ts: adapter from the library logger contract to Nest Logger; JSDoc notes the
   nest-logger swap for production.
3. ai/repositories placeholders typed to ITokenTransactionRepository / IModelPricingRepository,
   each method throwing a clear NotImplemented error naming the arriving change.
4. ai/echo.provider.ts: minimal IAiProvider (name 'echo') returning fixed content and usage
   {promptTokens: 1, completionTokens: 1, totalTokens: 2}; replaced by MockAiProvider later.
5. ai/ai.module.ts assembling registerAsync + the four token bindings; imported by AppModule.
6. GET /health/wiring: resolves AiTokenTransactionService + PricingService from the container and
   returns { registered: true, defaultModels }.
7. Unit tests for the factory permutations and the bridge; 100% on new files.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Explicit @Inject everywhere; no process.env outside src/config; strict TS; JSDoc +
  @fileoverview/@layer; timeless comments; no em dashes.

Verification:
- App boots; GET /health/wiring returns registered: true.
- `pnpm --filter api test:cov` 100% on implemented files.

Completion Protocol: standard steps; commit `feat(api): canonical registerAsync wiring (2.3)`.
```

---

## Task 2.4: Health module + e2e harness + CI jobs

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: 2.3

#### Description

`/health/live` (process up) and `/health/ready` (Prisma `SELECT 1`); the e2e harness: Jest e2e
project booting `createApp()` against a Testcontainers `postgres:17-alpine` (migrations applied
programmatically), first e2e specs (boot, health, hello, identity 401); CI gains `build`, `test`,
`e2e` jobs extending the phase 00 chain.

#### Acceptance criteria

- [x] `GET /health/ready` returns 503 when the database is unreachable, 200 otherwise.
- [x] `pnpm --filter api test:e2e` spins the container, migrates, boots via `createApp()`,
      passes; no shared state between specs; workers bounded (single worker: one container
      stack per run).
- [x] CI: the reusable's `unit` job already gates coverage; its `e2e-api` job is switched on
      (`run-e2e-api: true` + `e2e-api-command`) and a repo-level `Build API` job compiles the
      app. The reusable's e2e job runs Testcontainers on the runner's Docker daemon, so no
      `services:` Postgres block exists in CI either (same mechanism locally and in CI; the
      drafted service-container difference does not apply to this pipeline).
- [x] Coverage remains 100% on implemented files.

#### Files to create / modify

- `apps/api/src/health/**`, `apps/api/test/e2e/**`, `apps/api/jest.config.ts`,
  `jest.e2e.config.ts`, `.github/workflows/ci.yml`

#### Agent prompt

```
You are a senior NestJS testing engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 02, Task 2.4 of 5 (MIDDLE).

PRECONDITIONS
- Tasks 2.1-2.3 done: app boots with wired module.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §22 (Testing Strategy), §21 (stack)
- docs/DEVELOPMENT_PLAN.md Appendix A

TASK
Health endpoints, the e2e harness, and the CI extension.

DELIVERABLES
1. health module: /health/live (200 always), /health/ready (Prisma SELECT 1 -> 200, failure ->
   503 with { status: 'down', reason }); excluded from identity middleware.
2. jest.config.ts (unit) + jest.e2e.config.ts: both coverageThreshold 100% all four metrics,
   maxWorkers '50%'; e2e project uses test/e2e/**.
3. test/e2e/setup: Testcontainers postgres:17-alpine, run prisma migrate deploy against the
   container URL, boot createApp(); teardown stops the container. ONE container per run.
4. e2e specs: boot + hello, health live/ready (ready failure path by stopping the container or a
   bad URL variant module), identity 401 unknown user, /health/wiring registered.
5. ci.yml: append jobs build (pnpm --filter api build), test (test:cov), e2e (services:
   postgres:17-alpine with health options; run test:e2e with DATABASE_URL to the service);
   sequential needs-chain; do not rename existing jobs.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Verify current Testcontainers-node and Prisma programmatic-migrate APIs against official docs
  before coding. One suite at a time; never run unit and e2e concurrently. Strict TS; timeless
  comments; no em dashes.

Verification:
- `pnpm --filter api test:e2e` green locally with Docker running.
- CI green on the branch with the new jobs.

Completion Protocol: standard steps; commit `feat(api): health endpoints and e2e harness (2.4)`.
```

---

## Task 2.5: Phase close: audit, dashboards, PR + Copilot review

- **Status**: ✅ Done · **Priority**: P0 · **Size**: S · **Depends on**: 2.1..2.4

#### Description

Standard phase close (see phase 00 task 0.5 for the full ritual): audit criteria, update
dashboards, `gh pr create`, request the GitHub Copilot review, address every finding, squash-merge
on green, delete the branch.

#### Acceptance criteria

- [x] Gate replay green: lint, typecheck, format:check, build, test:cov (100% on all four
      metrics), test:e2e (Testcontainers).
- [x] Dashboards synced (this file, plan, tasks README).
- [x] PR `feat(api): phase 2, api skeleton and module wiring` squash-merged; Copilot findings
      all addressed; branch deleted.

#### Files to create / modify

- This file, `docs/DEVELOPMENT_PLAN.md`, `docs/tasks/README.md`

#### Agent prompt

```
You are the phase-close auditor for nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 02, Task 2.5 of 5 (LAST, phase close).

PRECONDITIONS
- Tasks 2.1-2.4 report done on feat/phase-02-api-skeleton-wiring.

REQUIRED READING (only these)
- This phase file; docs/DEVELOPMENT_PLAN.md Progress Dashboard + Update Protocol.

TASK
Close Phase 02 with an audited, reviewed, merged PR.

DELIVERABLES
1. Replay: pnpm lint && pnpm typecheck && pnpm --filter api build && pnpm --filter api test:cov
   && pnpm --filter api test:e2e (sequentially; Docker running). Fix any failure.
2. Verify every 2.1..2.4 acceptance criterion against the tree.
3. Update dashboards (this file header/index/log; plan row + overall; tasks README row).
4. gh pr create title `feat(api): phase 02, api skeleton and module wiring`; request the GitHub
   Copilot code review; address EVERY finding; merge with CI green:
   gh pr merge --squash --delete-branch; verify branch removal.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Verify via git/gh, never narration.

Verification:
- PR MERGED; CI green on main.

Completion Protocol: append `- 2.5 ✅ YYYY-MM-DD: phase merged in PR #<n>`; commit
`docs(plan): mark phase 02 complete`.
```

---

## Completion log

<!-- append: - <id> ✅ YYYY-MM-DD: <one-line summary> -->

- 2.1 ✅ 2026-07-10: NestJS 11 skeleton with createApp seam, typed Zod env config (value-free failure report), global Zod validation pipe, JSON hello; 100% coverage on new files.
- 2.2 ✅ 2026-07-10: demo identity middleware (x-demo-user/x-tenant-id, simulation-labeled) + static registry incl. null-tenant admin; excluded from /health/*; README note; 100% coverage.
- 2.3 ✅ 2026-07-10: canonical forRootAsync wiring (options factory from typed env, placeholder IAiTokensStore, demo scopeResolver, wallets/budgets from QUOTA_*), host-side paramtypes shim for the esbuild-built dist, GET /health/wiring smoke; 100% coverage.
- 2.4 ✅ 2026-07-10: health live/ready (Prisma SELECT 1, value-free 503), Testcontainers e2e harness (postgres:17-alpine, prisma migrate deploy, createApp boot, 9 specs incl. bad-URL readiness variant), CI e2e-api on + Build API job; 100% coverage.
- 2.5 ✅ 2026-07-10: acceptance audit green (lint, typecheck, format, build, test:cov 100%, test:e2e); PR #8 opened with the Copilot review, 2 review rounds addressed (teardown guard, env schema mirror, report regex; the .env-path claim declined with runtime proof), squash-merged as `06e9e1b`, branch deleted, CI green including the API e2e stage.
