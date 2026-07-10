# nest-ai-tokens-example: Development Plan

> Phased execution plan for the canonical reference application of
> **`@bymax-one/nest-ai-tokens`**. Derives from
> [`TECHNICAL_SPECIFICATION.md`](TECHNICAL_SPECIFICATION.md) (the normative blueprint); per-phase
> task files live under [`docs/tasks/`](tasks/).
>
> **Last updated:** 2026-07-10 · **Source spec:** v1.0.0

**Status legend:** 📋 ToDo · 🔄 In Progress · 👀 Review · ✅ Done · ⛔ Blocked · 🟡 Partial

---

## Table of Contents

1. [Progress Dashboard](#progress-dashboard)
2. [Guiding Principles](#0-guiding-principles)
3. [Phase Map & Dependencies](#1-phase-map--dependencies)
4. [Global Conventions](#2-global-conventions)
5. [Per-Phase Detail](#per-phase-detail)
6. [Update Protocol](#update-protocol)
7. [Appendix A: Quality Gates](#appendix-a-quality-gates)

---

## Progress Dashboard

> **Canonical status for the whole repo.** The [`docs/tasks/README.md`](tasks/README.md) index and
> every phase file mirror this table; when they disagree, this table wins and must be fixed in the
> same commit.
>
> **Overall progress: 27 / 55 tasks (49%) · 5 / 10 phases done**
> **Active phase:** none · **Blockers:** none

| #   | Phase                                | Tasks file                                | Size | Done / Total | %    | Status |
| --- | ------------------------------------ | ----------------------------------------- | ---- | ------------ | ---- | ------ |
| 00  | Repository Foundation & CI           | `phase-00-repo-foundation.md`             | M    | 5 / 5        | 100% | ✅     |
| 01  | Postgres, Prisma & Library Link      | `phase-01-database-library-link.md`       | M    | 5 / 5        | 100% | ✅     |
| 02  | API Skeleton & Module Wiring         | `phase-02-api-skeleton-wiring.md`         | L    | 5 / 5        | 100% | ✅     |
| 03  | Repositories, Ledger & Pricing API   | `phase-03-repositories-ledger-pricing.md` | L    | 6 / 6        | 100% | ✅     |
| 04  | Mock Provider, Commands & Embeddings | `phase-04-mock-provider-commands.md`      | L    | 6 / 6        | 100% | ✅     |
| 05  | Quota, Credits & Aggregations        | `phase-05-quota-aggregations.md`          | L    | 0 / 6        | 0%   | 📋     |
| 06  | Multi-Tenant & Error Catalog         | `phase-06-tenants-errors.md`              | M    | 0 / 5        | 0%   | 📋     |
| 07  | Web Skeleton & Design System         | `phase-07-web-skeleton-design.md`         | M    | 0 / 5        | 0%   | 📋     |
| 08  | Dashboard Pages                      | `phase-08-dashboard-pages.md`             | L    | 0 / 6        | 0%   | 📋     |
| 09  | Quality, Docs & Export Audit         | `phase-09-quality-docs-audit.md`          | L    | 0 / 6        | 0%   | 📋     |

---

## 0. Guiding Principles

1. **Library-faithful.** Every public export of `@bymax-one/nest-ai-tokens` (`.` + `./shared`) and
   every documented behavior is demonstrated; traceability runs through the spec's
   [§7 Feature Coverage Matrix](TECHNICAL_SPECIFICATION.md#7--feature-coverage-matrix) (each phase
   lists the rows it covers) and the phase 09 export audit enforces it.
2. **Deterministic by default.** All flows run against `MockAiProvider`; failure paths are reached
   via injection markers, never real provider outages. No API key exists anywhere in the repo.
3. **Honest semantics.** Boundaries (no billing, shared pricing across tenants, no streaming) are
   demonstrated as boundaries, with the documented escape hatch beside them.
4. **Copy-paste friendly.** `ai/ai-tokens.config.ts`, both Prisma repositories, the mock provider,
   and the quota estimators are written generically so a real consumer lifts them directly.
5. **Design parity.** `apps/web` reuses the shared Bymax design system **verbatim**
   ([`design_system.html`](design_system.html)); the shell must be indistinguishable from the
   sibling examples.
6. **CI from day one, public-ready.** `ci.yml` gates every PR from phase 00. CodeQL and Scorecard
   workflows ship early but are **conditional on repository visibility**: they activate the moment
   the repo goes public, with zero pipeline edits.
7. **One PR per phase, reviewed.** Every phase branches with `git switch -c feat/phase-NN-<slug>`,
   closes with a PR, requests a GitHub Copilot code review, addresses every finding, and merges
   only with CI green.
8. **Full library-grade test bar.** 100% unit coverage on all four metrics (api + web `lib/**`),
   E2E of every route/error/guard path, and the export audit: this is the reference other projects
   copy.
9. **No shortcuts.** No `@ts-ignore`, no `eslint-disable`, no `--no-verify`, no lowered thresholds,
   no `.gitkeep`, timeless comments only.
10. **English-only** identifiers, comments, docs, and commits (Conventional Commits, husky-enforced).

---

## 1. Phase Map & Dependencies

```
00 ──▶ 01 ──▶ 02 ──▶ 03 ──▶ 04 ──▶ 05 ──▶ 06 ──┐
                │                              ├──▶ 09
                └──▶ 07 ─────────▶ 08 ─────────┘
                     (skeleton     (pages need the
                      needs 02)     03..06 endpoints)
```

**Critical path:** `00 → 01 → 02 → 03 → 04 → 05 → 06 → 09`.

**Parallelization.**

- The **frontend track** (07) can start as soon as phase 02 gives it a booting API and the typed
  client contract (mocked responses allowed); its pages (08) need the real endpoints from 03..06.
- Inside the backend track the order is strict: repositories (03) precede the inference wrappers
  (04), which precede quota/aggregations (05), because each layer's e2e reuses the previous seams.
- **Test execution is never parallel across packages**: one suite at a time, Jest/Vitest
  `maxWorkers: '50%'` baked into the configs. Parallelization above refers to code work only.

---

## 2. Global Conventions

| Concern            | Convention                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager    | `pnpm` (pinned via `packageManager`), workspaces `apps/*`                                                                                               |
| Runtime            | Node `>=24` (`.nvmrc`, `engines`, CI `node-version: '24'`)                                                                                              |
| Language           | TypeScript 5.9 strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; ESM                                                                  |
| Lint / format      | ESLint 9 flat (`recommendedTypeChecked`) + Prettier 3; zero suppressions                                                                                |
| Commits & hooks    | Conventional Commits; husky `pre-commit` -> lint-staged, `commit-msg` -> commitlint; no AI-attribution trailers, ever                                   |
| Branching          | `git switch -c feat/phase-NN-<slug>` (never `git checkout -b`); one PR per phase; squash merge; delete branch                                           |
| Reviews            | GitHub Copilot code review requested on every phase PR; all findings addressed before merge                                                             |
| API docs           | No Swagger; JSDoc + Zod DTOs (family convention)                                                                                                        |
| Datastore          | Postgres 17 via docker compose; Prisma; no Redis                                                                                                        |
| Library dependency | `@bymax-one/nest-ai-tokens` via `file:../../../nest-ai-tokens` until published, then `^0.1.0`                                                           |
| Subpaths           | `.` (server) only in `apps/api`; `./shared` in **both** apps (browser-safe)                                                                             |
| Identity           | Demo headers `x-demo-user` / `x-tenant-id` (simulation, clearly labeled)                                                                                |
| Test bar           | 100% unit coverage (api Jest, web Vitest `lib/**` + components); E2E every flow (Testcontainers `postgres:17-alpine`); export audit                     |
| Memory safety      | One suite at a time; `maxWorkers: '50%'`; never fan out parallel test agents                                                                            |
| CI                 | From phase 00: install, lint, typecheck, build, unit, e2e (Postgres service container), sequential. CodeQL + Scorecard conditional on public visibility |

---

## Per-Phase Detail

### Phase 00: Repository Foundation & CI

- **Goal:** a buildable pnpm workspace with the full Bymax toolchain and a CI pipeline gating the
  very first PR.
- **Scope (in):** root `package.json` (workspaces, scripts), `pnpm-workspace.yaml`, `.nvmrc`,
  `tsconfig.base.json` strict, ESLint flat + Prettier, husky + commitlint + lint-staged,
  `.gitmessage`, `.editorconfig`, `.gitignore`, `LICENSE` (MIT), `README.md` stub linking the
  docs, `CHANGELOG.md`, `renovate.json`, `.github/workflows/ci.yml` (install, lint, typecheck;
  test/build jobs join as the apps appear), CodeQL + Scorecard workflows with the
  public-visibility condition.
- **Scope (out):** application code, docker.
- **Definition of Done:** `pnpm install && pnpm lint && pnpm typecheck && pnpm format:check` green
  on a clean clone; CI green on the phase PR; commit-msg hook rejects a non-conventional message.
- **Covers matrix rows:** none (tooling). **Size:** M · **Tasks:** 5

### Phase 01: Postgres, Prisma & Library Link

- **Goal:** the data layer and the library dependency exist and are provably consumable.
- **Scope (in):** `docker-compose.yml` (`postgres:17-alpine`, healthcheck, volume) + `infra:*`
  scripts; `apps/api` package init; Prisma schema (`AiTokenTransaction`, `ModelPricing`, exact
  reference shapes + indexes), first migration, deterministic seed (users `ada/grace/linus`,
  tenants `acme/globex`, allocations + historical debits); `file:` link of the library; a subpath
  probe script proving `.` and `./shared` resolve (ESM + types).
- **Definition of Done:** `pnpm infra:up` healthy; `prisma migrate dev` + `prisma db seed` green;
  probe script passes in CI (link mode documented).
- **Covers:** rows 86-87 (shared subpath groundwork). **Size:** M · **Tasks:** 5

### Phase 02: API Skeleton & Module Wiring

- **Goal:** a booting NestJS 11 app with the library registered through the canonical
  `registerAsync` factory.
- **Scope (in):** Nest skeleton (`main.ts` with `createApp` seam, Zod pipe, health module);
  `identity/` middleware (`x-demo-user`/`x-tenant-id` -> `req.user`, demo registry); `ai/`
  module: options factory (`ai-tokens.config.ts`) wiring `strategy: 'custom'` +
  placeholder provider, both repository bindings, logger bridge, quota + tenant options from env;
  e2e harness (Testcontainers) booting the real module; CI gains build/test/e2e jobs.
- **Definition of Done:** `pnpm dev:api` boots with `GET /health/ready` green; e2e boot test
  passes; effective options readable via the options token.
- **Covers:** rows 1, 3-9, 89. **Size:** L · **Tasks:** 5

### Phase 03: Repositories, Ledger & Pricing API

- **Goal:** both repository ports implemented on Prisma with database-level aggregation, plus the
  ledger and pricing REST surface.
- **Scope (in):** `PrismaTokenTransactionRepository` (8 methods; `aggregate`/`groupBy` in SQL);
  `PrismaModelPricingRepository` (6 methods; window predicate, race-safe `upsertIfMissing`,
  `closeCurrentWindow`); boot seeding (`seedDefaults` + `customSeed` mock models, idempotency
  e2e); `ledger/` endpoints (list/detail/filters/pagination); `pricing/` endpoints
  (current/history/update/flush); unit tests to 100% on everything implemented.
- **Definition of Done:** all repository unit + e2e tests green; double-boot seed proves
  idempotency; pricing update closes windows atomically and invalidates the cache.
- **Covers:** rows 4-5, 17, 24-36. **Size:** L · **Tasks:** 6

### Phase 04: Mock Provider, Commands & Embeddings

- **Goal:** the deterministic `MockAiProvider` and the full inference-wrapper surface.
- **Scope (in):** `MockAiProvider` (token math, canned content, failure-injection markers,
  latency knob); provider binding replaces the phase 02 placeholder; `workspace/` endpoints for
  translate/summarize/rewrite/analyze/custom + embed + embed/batch + models; library DTO reuse;
  transaction guarantees proven (one per call, batch aggregate + `batchSize`, truncated debits,
  invalid-JSON does not debit); `resourceId` correlation.
- **Definition of Done:** every command returns content + cost breakdown + `transactionId`; e2e
  asserts the ledger deltas; failure markers reach their error codes deterministically.
- **Covers:** rows 6, 13-15, 37-52, 73-74, 76. **Size:** L · **Tasks:** 6

### Phase 05: Quota, Credits & Aggregations

- **Goal:** quota enforcement end to end plus the analytics surface.
- **Scope (in):** guard on the workspace/quota controllers; ledger-backed `balanceResolver`;
  estimator variants (constant, body-size, model-based) + resolver overrides + `@SkipQuota` +
  unmarked handler; `IQuotaPolicy` class variant (e2e module); `ledger/credits` + `ledger/refund`;
  `usage/` endpoints (balance, by-period/type/model, top consumers, system costs); `system-jobs/`
  (reindex as system cost, agent-decision metadata).
- **Definition of Done:** drain-then-402 scenario green with the canonical envelope; tolerance
  boundary unit-tested; aggregations return chart-ready shapes for the seeded data.
- **Covers:** rows 8, 16, 18-19, 23, 53-72, 84-85. **Size:** L · **Tasks:** 6

### Phase 06: Multi-Tenant & Error Catalog

- **Goal:** tenant isolation proven and every error code reachable on demand.
- **Scope (in):** tenant switcher semantics (`required: false` default; `required: true` e2e
  variant); isolation e2e (A never sees B); `errors-demo/` module triggering all 24 codes
  (markers, malformed inputs, backdate helper, boot-variant tests for the two config codes and
  `provider.api_key_missing`); ledger-only module variant proving conditional registration.
- **Definition of Done:** an e2e table-test walks every catalog code and asserts status + body
  shape; isolation proof green in both tenant modes.
- **Covers:** rows 2, 10-12, 20, 22, 34, 38, 44-45, 48, 50, 60-62, 66, 75, 77-83. **Size:** M ·
  **Tasks:** 5

### Phase 07: Web Skeleton & Design System

- **Goal:** the Next.js 16 dashboard shell, pixel-consistent with the family.
- **Scope (in):** `apps/web` init; design-system integration (tokens/fonts/shell from
  `design_system.html`); navigation for the eight pages; typed api client (shared-subpath types,
  `AI_TOKENS_ERROR_CODES` narrowing); user/tenant switcher wired to the demo headers; Vitest
  setup; CI web jobs.
- **Definition of Done:** `pnpm dev` serves the shell; switcher persists selection; api client
  round-trips `GET /usage/balance` against the live api; visual parity check against a sibling
  screenshot.
- **Covers:** rows 79, 86-87. **Size:** M · **Tasks:** 5

### Phase 08: Dashboard Pages

- **Goal:** the eight pages that make every capability visible.
- **Scope (in):** Overview (stat cards + sparkline); Playground (five command cards, embeddings
  panel, model picker, cost breakdown, failure-marker helper); Ledger (table, filters, metadata
  inspector, refund/top-up); Pricing (table, history timeline, update form, flush); Usage
  (charts + leaderboard + system costs); Quota Lab; Tenants; Errors (catalog triggers). Component
  tests along the way.
- **Definition of Done:** every §13 scenario is walkable in the browser; pages consume only the
  documented endpoints; component tests green.
- **Covers:** the "Demonstrated in" column across §7 (dashboard side). **Size:** L · **Tasks:** 6

### Phase 09: Quality, Docs & Export Audit

- **Goal:** the reference-grade close: exhaustive verification and publishable documentation.
- **Scope (in):** unit coverage to 100% (api, web); E2E consolidation (every route, error, guard
  path, module variant); `scripts/audit-library-exports.mjs` (diff library exports vs §7, CI
  gate); README (badges, quick start, scenario walkthrough, coverage-matrix link, curl examples);
  `CHANGELOG.md`; CI finalization (jobs contractual, conditional security workflows verified);
  final acceptance audit against the spec.
- **Definition of Done:** all gates in Appendix A green from a clean clone; audit script fails CI
  when an export goes undemonstrated (proven by a mutation of the matrix in a test).
- **Covers:** matrix enforcement + G6. **Size:** L · **Tasks:** 6

---

## Update Protocol

1. Task done -> update its block + Task index row in the phase file, tick acceptance boxes, bump
   the header progress counter, append to the phase Completion log.
2. Mirror the phase row here (Done/Total, %, Status) and recompute **Overall progress**.
3. Keep [`tasks/README.md`](tasks/README.md) index in sync (it mirrors this dashboard).
4. Phase done -> Status ✅ here only after the phase PR is merged with CI green and the Copilot
   review resolved; set the next phase to 🔄 only when its dependencies are ✅.
5. External blockers (e.g., library publish pending) -> mark the phase ⛔ naming the blocker;
   never sit in 🔄 while blocked.
6. Commit dashboards updates as `docs(plan): ...` (Conventional Commits, no attribution trailers).

---

## Appendix A: Quality Gates

| Gate          | Command                           | Bar                                                   |
| ------------- | --------------------------------- | ----------------------------------------------------- |
| Lint / format | `pnpm lint` / `pnpm format:check` | zero warnings, zero suppressions                      |
| Types         | `pnpm typecheck`                  | strict, no `any`                                      |
| Unit (api)    | `pnpm --filter api test:cov`      | 100% all four metrics                                 |
| Unit (web)    | `pnpm --filter web test:cov`      | 100% `lib/**` + components                            |
| E2E           | `pnpm --filter api test:e2e`      | every route, error code, guard path, module variant   |
| Web smoke     | `pnpm --filter web test:e2e`      | shell + one live round-trip                           |
| Export audit  | `pnpm audit:exports`              | every library export demonstrated or ⛔-justified     |
| CI            | `.github/workflows/ci.yml`        | all of the above, sequential, green from the first PR |
