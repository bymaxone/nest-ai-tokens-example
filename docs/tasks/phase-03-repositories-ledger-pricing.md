# Phase 03: Repositories, Ledger & Pricing API

> **Status**: 🔄 In Progress · **Progress**: 1 / 6 tasks · **Last updated**: 2026-07-10
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#per-phase-detail) §Phase 03
> **Source spec**: [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md) §16, §11 (ledger/pricing routes), §7.2-7.3 (matrix rows 13-36)

## Context

The placeholders from phase 02 become real: both repository ports implemented on Prisma with
database-level aggregation, the boot pricing seed (defaults + mock models, idempotent), and the
ledger + pricing REST surface the dashboard will consume. After this phase the library's core
(ledger + pricing) is fully operational end to end.

> **Reconciliation (2026-07-10):** the shipped library v0.1.0 supersedes the shapes drafted here
> and in spec §16/§11 (same rule as the phase 01/02 notes). The real persistence surface is ONE
> `IAiTokensStore` (ledger + pricing ports, wallet/budget halves optional), and the library SHIPS
> the official PostgreSQL adapter `PrismaAiTokensStore` (`@bymax-one/nest-ai-tokens/prisma`,
> parameterized raw SQL over the host schema), so the app binds that adapter to its
> `PrismaService` instead of reimplementing persistence; there is no
> `PrismaTokenTransactionRepository`/`PrismaModelPricingRepository` to write. Mappings applied:
> `sumAmount`/`groupByType`/`groupByUser` -> `sumCost(filter)` (SQL `SUM`/`COUNT`, and its
> `records` count doubles as the list total; group-by reporting is `UsageReportService` territory,
> a later phase); `findActive`/`closeCurrentWindow`/`upsertIfMissing` -> `resolveRate` (window
> predicate in SQL) and `upsertPrice` (atomic close-and-insert under a per-tuple advisory xact
> lock plus a partial unique index on the single open row); `findAllCurrent` has no port
> equivalent, so the "all current pricing" read is a host-owned Prisma query on the open rows;
> `AiTokenTransactionService.getUserTransactions` -> `LedgerService.query` + `sumCost`
> (the shipped filter has no `type`/`onlyDebits`/`onlyCredits`/`order`: costs are unsigned,
> corrections are compensating records, and the adapter orders `createdAt` ascending);
> `UpdatePricingDto` -> `NewPriceVersion` (Zod mirror); `invalidateCache()` has NO public
> equivalent in v0.1.0 (`upsertPrice` clears the cache internally), so `POST /pricing/cache/flush`
> is not implementable and is documented as omitted; `pricing.seedDefaults` + `customSeed` +
> `DEFAULT_OPENAI_PRICING_2026` -> `pricing.seedFromSnapshot` + `MODEL_PRICES_SEED` (18 rows,
> which include `gpt-5-mini` but NOT `gpt-4o-mini`; assertions target shipped models). The
> shipped snapshot seed serializes CONCURRENT boots (session advisory lock) but re-runs on a
> later fresh boot, closing and reinserting every open row, so restart row counts would grow;
> to honor this phase's idempotency requirement the app keeps `seedFromSnapshot: false` and owns
> an existence-checked, advisory-locked boot seed that writes the snapshot rows plus the three
> mock models (`mock-chat-pro`, `mock-chat-lite`, `mock-embed`) exactly once.

> **Completion Protocol ("standard steps"):** task Status ✅ (block + index) -> checkboxes ->
> header Progress -> plan dashboard row + overall counter -> tasks README -> Completion log entry
> -> Conventional commit.

## Rules-of-phase

1. `sumAmount`, `groupByType`, `groupByUser` MUST aggregate in the database (Prisma
   `aggregate`/`groupBy`); a test asserts no full-table fetch.
2. Decimal-to-number mapping happens at the repository boundary only.
3. `upsertIfMissing` must be safe under concurrent boots (unique-violation tolerant).
4. Controllers stay thin; Zod DTOs; `@SkipQuota` semantics arrive in phase 05 (no guard here yet).
5. 100% coverage on everything implemented; every `it()` commented.

## Reference docs

- Spec §16, §11 (routes table `/ledger/*`, `/pricing/*`), §7.2-7.3
- Library: `ITokenTransactionRepository` (8 methods), `IModelPricingRepository` (6 methods),
  `AiTokenTransactionService`/`PricingService` APIs; verify signatures from the package types

## Task index

| ID  | Task                                                                           | Status | Priority | Size | Depends on |
| --- | ------------------------------------------------------------------------------ | ------ | -------- | ---- | ---------- |
| 3.1 | Branch + `PrismaTokenTransactionRepository` (8 methods, SQL aggregation)       | ✅     | P0       | L    | none       |
| 3.2 | `PrismaModelPricingRepository` (6 methods, window predicate, race-safe upsert) | 📋     | P0       | M    | 3.1        |
| 3.3 | Boot pricing seed (defaults + `MOCK_MODEL_PRICING`) + idempotency e2e          | 📋     | P0       | S    | 3.2        |
| 3.4 | `ledger/` REST: list, detail, filters, pagination                              | 📋     | P0       | M    | 3.1        |
| 3.5 | `pricing/` REST: current, history, update, flush-cache                         | 📋     | P0       | M    | 3.2        |
| 3.6 | Phase close: audit, dashboards, PR + Copilot review                            | 📋     | P0       | S    | 3.1..3.5   |

---

## Task 3.1: Branch + `PrismaTokenTransactionRepository`

- **Status**: ✅ Done · **Priority**: P0 · **Size**: L · **Depends on**: none

#### Description

Implement all eight methods of `ITokenTransactionRepository` on Prisma (`create`, `findById`,
`findMany`, `count`, `sumAmount`, `groupByType`, `groupByUser` with `topN`), honoring the filter
contract (type arrays, date bounds, onlyDebits/onlyCredits, ordering) and replacing the phase 02
placeholder binding. _Reconciled (see the phase note): the ledger half ships inside the library's
`PrismaAiTokensStore`; this task binds that adapter and proves the ledger-half behavior against
real data instead of reimplementing it._

#### Acceptance criteria

- [x] Branch `feat/phase-03-repositories-ledger-pricing` created with `git switch -c`.
- [x] The shipped `PrismaAiTokensStore` is bound under the `AI_TOKENS_STORE` symbol (factory over
      the app `PrismaService`); the phase 02 placeholder store is deleted.
- [x] Aggregation happens in the database: the integration spec proves `sumCost` totals equal
      sums computed independently from the deterministic seed plan, and an empty match coalesces
      to exact zeros.
- [x] The shipped filter contract is honored and proven: scope, operation, inclusive `from`/`to`
      bounds, system-cost partition, and `limit`/`offset` paging.
- [x] Rows map exactly to the library's `UsageRecord` interface (bigint nano-USD, `Decimal(10,4)`
      markup to `number`, `Date` fields) at the store boundary.
- [x] 100% unit coverage held; integration specs run against the e2e container.

#### Files to create / modify

- `apps/api/src/ai/ai-store.module.ts` (shipped-adapter binding), `ai/ai-tokens.config.ts`,
  `ai/ai.module.ts`, placeholder deletion, unit specs, `test/e2e/store-integration.e2e-spec.ts`

#### Agent prompt

```
You are a senior NestJS/Prisma engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example, reference app for @bymax-one/nest-ai-tokens. The library defines
ITokenTransactionRepository; this app ships the reference Prisma implementation.

CURRENT PHASE: 03, Task 3.1 of 6 (FIRST).

PRECONDITIONS
- Phase 02 merged: app boots with placeholder repositories; e2e harness works.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §16
- ITokenTransactionRepository + TokenTransactionFilter types from the installed package (read the
  d.ts; never code the contract from memory)

TASK
Create the phase branch and implement the full transaction repository.

DELIVERABLES
1. Branch: `git switch -c feat/phase-03-repositories-ledger-pricing` (NEVER checkout -b).
2. prisma-token-transaction.repository.ts implementing all 8 methods:
   - create: persist, return mapped row (id/createdAt from DB).
   - findById, findMany (filter contract: userId, tenantId incl. explicit null, subscriptionId,
     type single-or-array, from/to inclusive, onlyDebits amount<0, onlyCredits amount>0,
     limit/offset, order default desc on createdAt).
   - count, sumAmount (prisma aggregate _sum, coalesce null -> 0), groupByType, groupByUser
     (groupBy + orderBy abs total via raw orderBy on _sum, topN take).
3. Swap the placeholder binding in ai.module.ts to this class (explicit @Inject(PrismaService)).
4. Unit tests with a mocked Prisma client asserting the exact aggregate/groupBy call shapes (the
   in-database rule) + mapping/branch coverage to 100%; integration spec against the Testcontainer
   verifying sums/grouping on the phase 01 seed.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Verify current Prisma aggregate/groupBy APIs against official docs. Strict TS; no any;
  @fileoverview/@layer; JSDoc; functions <= 50 lines; timeless comments; no em dashes.

Verification:
- `pnpm --filter api test:cov` 100%; integration spec green in `pnpm --filter api test:e2e`.

Completion Protocol: standard steps; commit `feat(api): prisma token transaction repository (3.1)`.
```

---

## Task 3.2: `PrismaModelPricingRepository`

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 3.1

#### Description

Implement the six methods of `IModelPricingRepository`: `create`, `findActive` (documented window
predicate, highest `effectiveFrom` on overlap), `findHistory`, `findAllCurrent`,
`closeCurrentWindow` (returns updated count), `upsertIfMissing` (race-safe on the
`(model, effectiveFrom)` pair). Decimal mapped to number at the boundary.

#### Acceptance criteria

- [ ] Window predicate exactly:
      `effectiveFrom <= date AND (effectiveTo IS NULL OR effectiveTo >= date)`;
      overlap resolution picks max `effectiveFrom`.
- [ ] `upsertIfMissing` tolerates a concurrent insert (unique violation -> fetch existing).
- [ ] Binding swapped in `ai.module.ts`; placeholders deleted.
- [ ] 100% coverage incl. integration specs on windows and history ordering.

#### Files to create / modify

- `apps/api/src/ai/repositories/prisma-model-pricing.repository.ts`, `ai/ai.module.ts`, specs

#### Agent prompt

```
You are a senior NestJS/Prisma engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 03, Task 3.2 of 6 (MIDDLE).

PRECONDITIONS
- Task 3.1 done on the phase branch.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §16
- IModelPricingRepository + ModelPricing types from the installed package d.ts

TASK
Implement the pricing repository and remove the last placeholder.

DELIVERABLES
1. prisma-model-pricing.repository.ts: create (assign timestamps), findActive (window predicate,
   orderBy effectiveFrom desc take 1), findHistory (effectiveFrom desc), findAllCurrent
   (effectiveTo null, model asc), closeCurrentWindow (updateMany where effectiveTo null, return
   count), upsertIfMissing (try create; on P2002 unique violation fetch the existing
   (model, effectiveFrom) row; document the migration adding that unique constraint if the phase
   01 schema lacks it, and add it via a new migration).
2. Decimal -> number mapping at the boundary (Prisma.Decimal.toNumber), documented in JSDoc.
3. Swap the binding; delete both placeholder classes.
4. Unit + integration specs: window resolution across three stacked windows, close-then-insert
   sequence, race-safe upsert (simulate P2002), Decimal mapping. 100% coverage.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Strict TS; JSDoc; timeless comments; no em dashes; verify Prisma error-code handling in docs.

Verification:
- test:cov 100%; e2e integration specs green.

Completion Protocol: standard steps; commit `feat(api): prisma model pricing repository (3.2)`.
```

---

## Task 3.3: Boot pricing seed + idempotency e2e

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: S · **Depends on**: 3.2

#### Description

With real repositories, the library's `pricing.seedDefaults: true` + `customSeed:
MOCK_MODEL_PRICING` boot seeding becomes live. Prove it: an e2e boots the app twice against one
database and asserts pricing rows are created once (idempotent), covering
`DEFAULT_OPENAI_PRICING_2026` presence and the three mock models.

#### Acceptance criteria

- [ ] First boot creates default snapshot rows + mock models; second boot changes nothing
      (counts stable, `updatedAt` untouched).
- [ ] The e2e asserts a known default row (`gpt-4o-mini`) and `mock-chat-pro` resolve via
      `findActive` at now.
- [ ] Matrix rows 35-36 marked demonstrated in the spec (edit the Status cells if placeholders).

#### Files to create / modify

- `apps/api/test/e2e/pricing-seed.e2e-spec.ts`, spec §7 status touch-up if needed

#### Agent prompt

```
You are a senior NestJS testing engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 03, Task 3.3 of 6 (MIDDLE).

PRECONDITIONS
- Tasks 3.1-3.2 done: real repositories bound; options factory already sets seedDefaults +
  customSeed (phase 02).

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §7.3 rows 35-36, §9.2
- Library shared constant DEFAULT_OPENAI_PRICING_2026 (import from /shared)

TASK
Prove boot-seed idempotency end to end.

DELIVERABLES
1. pricing-seed.e2e-spec.ts: boot createApp() against a fresh container DB; snapshot
   model_pricing count; close app; boot again; assert identical count and identical updatedAt for
   a sampled row; assert findActive('gpt-4o-mini') and findActive('mock-chat-pro') resolve; assert
   DEFAULT_OPENAI_PRICING_2026 length matches the seeded default rows.
2. If the spec §7 rows 35-36 carry a planned status, they stay ✅ (no code change needed there).

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- One container per spec file; sequential; bounded workers; no em dashes.

Verification:
- `pnpm --filter api test:e2e` green including the new spec.

Completion Protocol: standard steps; commit `test(api): prove pricing seed idempotency (3.3)`.
```

---

## Task 3.4: `ledger/` REST

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 3.1

#### Description

`GET /ledger/transactions` (Zod query: type single/array, from/to, onlyDebits/onlyCredits,
limit/offset, order; scoped to `req.user` + tenant) and `GET /ledger/transactions/:id` (owner
check, full metadata payload) built on `AiTokenTransactionService.getUserTransactions` and the
repository. Credits/refund arrive in phase 05.

#### Acceptance criteria

- [ ] List honors every filter and returns `{ items, total, limit, offset }`.
- [ ] Detail 404s cleanly on unknown id; 403 on another user's row (owner check in the app,
      documented as app-level policy).
- [ ] E2E covers filters against the seed; unit covers controller/service branches; 100%.

#### Files to create / modify

- `apps/api/src/ledger/**` (module, controller, service, DTOs), e2e spec

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 03, Task 3.4 of 6 (MIDDLE).

PRECONDITIONS
- Task 3.1 done (repository live); identity middleware provides req.user.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §11 (ledger rows), §10.2 (house style)
- AiTokenTransactionService.getUserTransactions signature from the package d.ts

TASK
Ship the ledger read surface.

DELIVERABLES
1. ledger module/controller/service: GET /ledger/transactions (Zod query schema; delegate to
   AiTokenTransactionService.getUserTransactions with the user's id + tenant; total via the
   repository count for the same filter) and GET /ledger/transactions/:id (repository findById;
   404 unknown; 403 foreign owner with a JSDoc note that ownership policy is app-level, not
   library-level).
2. Thin controllers; JSDoc route docs; DTO schemas in ledger/dto with inferred types.
3. Unit specs (service branches, mapping) + e2e (filter permutations vs seed data, 404/403).
   100% coverage on new files.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Strict TS; explicit @Inject; timeless comments; no em dashes; no Swagger.

Verification:
- test:cov 100%; e2e green.

Completion Protocol: standard steps; commit `feat(api): ledger read endpoints (3.4)`.
```

---

## Task 3.5: `pricing/` REST

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 3.2

#### Description

`GET /pricing` (`getAllCurrentPricing`), `GET /pricing/:model/history` (`getPricingHistory`),
`PUT /pricing/:model` (library `UpdatePricingDto` + `updatePricing`: closes window, inserts
successor, invalidates cache), `POST /pricing/cache/flush` (`invalidateCache`). E2E proves the
window sequence and that a backdated `calculateCost` still uses the old window.

#### Acceptance criteria

- [ ] Update flow: old open window gains `effectiveTo`; successor row open; cache invalidated
      (next `getCurrentPricing` reflects the new price immediately).
- [ ] Backdated cost proof: `calculateCost(model, tokens, 0, oldDate)` uses the closed window
      (matrix row 32).
- [ ] Library DTO reused (`UpdatePricingDto`), demonstrating matrix row 88 partially (workspace
      DTOs complete it in phase 04).
- [ ] 100% coverage on new files; e2e green.

#### Files to create / modify

- `apps/api/src/pricing/**`, e2e spec

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 03, Task 3.5 of 6 (MIDDLE).

PRECONDITIONS
- Task 3.2 done (pricing repository live).

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §11 (pricing rows), §13 scenario 4
- PricingService + UpdatePricingDto from the package d.ts

TASK
Ship the pricing admin surface.

DELIVERABLES
1. pricing module/controller/service: GET /pricing, GET /pricing/:model/history,
   PUT /pricing/:model (validate with the library's UpdatePricingDto shape via Zod mirror or the
   DTO itself if class-validator peers are absent: prefer a Zod schema matching it and note the
   equivalence in JSDoc), POST /pricing/cache/flush.
2. E2E: update mock-chat-pro price; assert old window closed + successor open + immediate
   getCurrentPricing change + backdated calculateCost uses the old price (use PricingService
   directly from the test module for the backdated call).
3. Unit specs for controller/service branches. 100% on new files.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Strict TS; timeless comments; no em dashes.

Verification:
- test:cov 100%; e2e green.

Completion Protocol: standard steps; commit `feat(api): pricing admin endpoints (3.5)`.
```

---

## Task 3.6: Phase close: audit, dashboards, PR + Copilot review

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: S · **Depends on**: 3.1..3.5

#### Description

Standard phase close: replay all gates (lint, typecheck, build, test:cov 100%, test:e2e),
audit every criterion, sync dashboards, open PR
`feat(api): phase 03, repositories, ledger and pricing`, request the GitHub Copilot review,
address every finding, squash-merge on green, delete the branch, log completion.

#### Acceptance criteria

- [ ] All gates green sequentially; all 3.1..3.5 criteria verified against the tree.
- [ ] Dashboards synced; PR merged with Copilot review resolved; branch gone.

#### Agent prompt

```
You are the phase-close auditor for nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 03, Task 3.6 of 6 (LAST, phase close).

PRECONDITIONS: tasks 3.1-3.5 report done on feat/phase-03-repositories-ledger-pricing.
REQUIRED READING (only these): this phase file; docs/DEVELOPMENT_PLAN.md dashboard + protocol.

TASK: close Phase 03 with an audited, reviewed, merged PR.

DELIVERABLES
1. Replay sequentially: pnpm lint, pnpm typecheck, pnpm --filter api build, test:cov (must be
   100%), test:e2e. Fix any failure before proceeding.
2. Verify every 3.1..3.5 acceptance criterion against the working tree (git/gh evidence).
3. Sync dashboards: this file header/index/log; plan row + overall counter; tasks README.
4. gh pr create title `feat(api): phase 03, repositories, ledger and pricing`; request the
   GitHub Copilot code review (gh pr edit --add-reviewer copilot-pull-request-reviewer[bot] or
   UI); address EVERY finding; merge with CI green: gh pr merge --squash --delete-branch; verify
   the branch is gone locally and remotely.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification: PR MERGED; CI green on main.

Completion Protocol: append `- 3.6 ✅ YYYY-MM-DD: phase merged in PR #<n>`; commit
`docs(plan): mark phase 03 complete`.
```

---

## Completion log

<!-- append: - <id> ✅ YYYY-MM-DD: <one-line summary> -->

- 3.1 ✅ 2026-07-10: bound the shipped `PrismaAiTokensStore` (ledger half proven vs the seed plan), deleted the placeholder store
