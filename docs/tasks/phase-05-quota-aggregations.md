# Phase 05: Quota, Credits & Aggregations

> **Status**: 🔄 In Progress · **Progress**: 4 / 6 tasks · **Last updated**: 2026-07-10
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#per-phase-detail) §Phase 05
> **Source spec**: [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md) §17 (Quota), §11 (usage/quota/system-jobs routes), §7.5-7.6 (matrix rows 53-72, 84-85)

> **Reconciliation (2026-07-10):** the shipped library v0.1.0 supersedes the quota surface drafted
> here and in spec §17/§11 (same rule as the phase 01-04 notes). There is NO `TokenQuotaGuard`,
> `@ConsumeTokens`, `@SkipQuota`, `IQuotaPolicy`, `BYMAX_AI_TOKENS_QUOTA_POLICY`,
> `UsageAggregatorService`, `recordCredit`, or `quota.*` error code family. The real enforcement
> surface is the opt-in `wallets`/`budgets` feature blocks (`WalletService`, `BudgetService`,
> `BudgetGuard`), the host `scopeResolver`, the metering lifecycle
> (`MeteringService.hold/capture/release/record({ enforce })`), and the `@Meter`/`@RequireBudget`/
> `@AiFeature` decorators consumed by `BudgetGuard`/`MeteringInterceptor`. Mappings applied:
> `balanceResolver` + `QuotaBalanceService.sumAmount` -> `WalletService.getBalance(ref)` (the
> materialized balance kept transactionally consistent with the append-only entry ledger;
> `reconcile` recomputes from the entries, so the ledger stays the source of truth and there is
> nothing app-side to write); guard on workspace -> the app's null-tolerant `EnforcementGuard`
> over `BudgetGuard` on the seven metered handlers (the library binds `BudgetGuard` as `null` when
> budgets are disabled), with the 401 no-user rejection raised by the module `scopeResolver`;
> `@ConsumeTokens(estimator)` -> app-owned pure estimators sizing a rated `HoldEstimate`
> (`{ provider, model, operation, inputTokens, maxOutputTokens }`) scaled by the host
> `QUOTA_TOLERANCE` knob, run through hold -> provider -> capture/release so a wallet/budget
> shortfall rejects BEFORE the provider runs and writes NO ledger row; `@SkipQuota` -> metadata
> absence (`MeteringInterceptor` passes through handlers without `@Meter`; unguarded handlers skip
> the guard), proven on `GET /workspace/models` and `GET /usage/balance`; 402
> `quota.insufficient_balance` -> `AI_TOKENS_INSUFFICIENT_CREDITS` (canonical envelope); 402
> `quota.below_minimum`/`minimumBalance` -> no such option; `QUOTA_MINIMUM_BALANCE` maps to
> `wallets.overdraftNanoUsd` and the below-floor rejection IS the insufficient-credits rejection;
> lab `constant` -> the declarative `@RequireBudget({ estimate })` static-hold path settled by
> `MeteringInterceptor`; lab `model-based` -> a service-level estimator branching on `body.model`;
> lab `resolvers` (`userIdResolver`/`tenantIdResolver`) -> NOT implementable (identity mapping is
> owned by the single module-level `scopeResolver`); class-based `IQuotaPolicy` variant -> NOT
> implementable (no policy port; the equivalent hard-stop is a `'block'` budget row created via
> the budgets admin surface and enforced pre-handler by the guard); `recordCredit` with
> `purchase`/`monthly_allocation`/`trial_allocation` -> `WalletService.grant` with the type as the
> entry `reason` (matching the phase-01 seed grants); refund with `metadata.refundOf` ->
> `MeteringService.reverse(transactionId, reason)` (compensating record linked via
> `reversesRecordId`/`reversedByRecordId`, original amounts untouched, wallet refunded and budget
> released for enforced originals); `UsageAggregatorService` -> `UsageReportService.summarize`
> (`groupBy` day|week|month|feature|model|scope|systemCostCategory; by-type reconciles to the
> `feature` dimension, top consumers to a tenant-wide `scope` grouping sorted host-side);
> `EmbeddingService.generateBatch(isSystemCost)` -> the app embedding path metered with
> `MeteringContext.isSystemCost`/`systemCostCategory` (the documented reserved fields);
> `type: 'agent_decision_assist'` with `metadata` -> a `record()` of a deterministic 25-token
> usage under feature `agent.decision-assist` with `correlationId: decisionId` and
> `strategy:`/`confidence:` tags (the immutable ledger stores no free text, so `reasoning` is
> echoed in the response, never persisted).

## Context

Quota enforcement becomes real: the ledger-backed `balanceResolver`, `TokenQuotaGuard` on the
workspace controllers, the three estimator families, `@SkipQuota`, credits/refund endpoints, the
full `UsageAggregatorService` surface, and the system-jobs module (system costs + agent-decision
metadata). After this phase the drain-then-402 scenario is walkable.

> **Completion Protocol ("standard steps"):** task Status ✅ (block + index) -> checkboxes ->
> header Progress -> plan dashboard row + overall counter -> tasks README -> Completion log entry
> -> Conventional commit.

## Rules-of-phase

1. The balance is derived from the ledger only (`sumAmount` semantics); no parallel balance table.
2. Estimators are synchronous and pure (library rule): no DB calls inside estimators.
3. Guard placement is controller-scoped (workspace + quota), not global; `/workspace/models`
   stays unmarked to prove the inert path.
4. Every 402/401 body must be the library's canonical envelope, untouched.
5. 100% coverage; commented `it()`; bounded workers.

## Reference docs

- Spec §17, §11, §13 scenarios 3, 5, 7; §7.5-7.6
- Library: `@ConsumeTokens`/`@SkipQuota`/`TokenQuotaGuard`, `UsageAggregatorService`,
  `recordCredit`, `IQuotaPolicy` from the package d.ts

## Task index

| ID  | Task                                                                                       | Status | Priority | Size | Depends on |
| --- | ------------------------------------------------------------------------------------------ | ------ | -------- | ---- | ---------- |
| 5.1 | Branch + ledger-backed balance resolver + guard on workspace                               | ✅     | P0       | M    | none       |
| 5.2 | Estimators: body-size on commands, constant + model-based + resolver overrides in `quota/` | ✅     | P0       | M    | 5.1        |
| 5.3 | Credits + refund endpoints (`purchase`, allocations, `refund`)                             | ✅     | P0       | S    | 5.1        |
| 5.4 | `usage/` REST: balance, by-period/type/model, top consumers, system costs                  | ✅     | P0       | M    | 5.1        |
| 5.5 | `system-jobs/`: reindex (system cost) + agent-decision metadata                            | 📋     | P1       | S    | 5.4        |
| 5.6 | Phase close: audit, dashboards, PR + Copilot review                                        | 📋     | P0       | S    | 5.1..5.5   |

---

## Task 5.1: Branch + balance resolver + guard wiring

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: none

#### Description

(Reconciled onto v0.1.0; see the phase note.) Move the workspace commands and embeds from
observe-only `record()` onto the full enforcement lifecycle: app-owned pure body-size estimators
scaled by `QUOTA_TOLERANCE` size a spend hold, the provider response settles it, and the
null-tolerant `EnforcementGuard` (over the library's `BudgetGuard`) covers the seven metered
handlers while `GET /workspace/models` stays the unguarded inert path.

#### Acceptance criteria

- [x] Branch `feat/phase-05-quota-aggregations` created with `git switch -c`.
- [x] Balance is the library's ledger-backed wallet balance (`WalletService.getBalance` over the
      append-only entry ledger); the drained/credited transitions are proven e2e against the
      seeded grants.
- [x] Guard active on workspace: request without `x-demo-user` -> 401 raised by the module
      `scopeResolver` BEFORE body validation; `/workspace/models` (unguarded) passes; skip
      semantics are metadata absence, proven on the models route.
- [x] Drain scenario e2e: a drained wallet rejects the next command 402
      `AI_TOKENS_INSUFFICIENT_CREDITS` (canonical envelope, `balanceNanoUsd`/`requestedNanoUsd`
      details) BEFORE the provider runs, with NO ledger row in any status and NO wallet entry; a
      credit grant unblocks the identical call; a passing call debits exactly the billed cost.
- [x] 100% coverage on changed files.

#### Files to create / modify

- `apps/api/src/ai/ai-tokens.config.ts` (resolver), `ai/quota-balance.service.ts`,
  `workspace/workspace.controller.ts` (guard + decorators), e2e spec

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example, reference app for @bymax-one/nest-ai-tokens. CURRENT PHASE: 05,
Task 5.1 of 6 (FIRST).

PRECONDITIONS
- Phase 04 merged: commands/embeddings live; quota options already flow from env (QUOTA_ENABLED
  true, tolerance 1.2).

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §17 and §13 scenario 5
- TokenQuotaGuard, ConsumeTokens, SkipQuota, UsageAggregatorService from the package d.ts

TASK
Create the phase branch, wire the real balance resolver, and enforce quota on the workspace.

DELIVERABLES
1. Branch: `git switch -c feat/phase-05-quota-aggregations` (NEVER checkout -b).
2. ai/quota-balance.service.ts: @Injectable() QuotaBalanceService with
   getBalance(userId, tenantId?) delegating to the bound ITokenTransactionRepository.sumAmount
   ({ userId, tenantId }); replace the placeholder in the options factory so
   quota.balanceResolver calls it (module-ref pattern documented in JSDoc since the resolver runs
   outside DI context).
3. workspace.controller.ts: @UseGuards(TokenQuotaGuard) at controller level; @ConsumeTokens with
   a pure body-size estimator (ceil(text length/4) scaled by targetLanguages count for translate;
   ceil(chars/4) elsewhere; batch: sum of texts) on the five commands + both embeds; @SkipQuota
   nowhere yet except GET routes if any exist here; /workspace/models stays UNMARKED (inert
   path proof).
4. E2E: without x-demo-user -> 401 quota.no_user; models route passes unauthenticated-guarded;
   drain loop on a low-balance seeded user until 402 quota.insufficient_balance asserting the
   details payload; then a credit (direct repository insert) unblocks.
5. Unit tests for the balance service and estimator purity. 100% on changed files.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Estimators synchronous and pure. Canonical envelopes untouched. Strict TS; timeless comments;
  no em dashes.

Verification:
- test:cov 100%; test:e2e green.

Completion Protocol: standard steps; commit `feat(api): ledger-backed quota enforcement (5.1)`.
```

---

## Task 5.2: Estimator variants + `quota/` lab endpoints

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: 5.1

#### Description

(Reconciled onto v0.1.0; see the phase note.) `quota/` module with the estimator-variant lab:
`POST /quota/lab/constant` (the DECLARATIVE path: a static `@RequireBudget({ estimate })` hold
placed by the guard, settled by `MeteringInterceptor` per `@Meter`, `x-ai-tokens-*` cost headers),
`POST /quota/lab/model-based` (programmatic estimator branching on `body.model`: 5000 vs 1000
tokens), `GET /quota/status` (`MeteringService.getStatus`, the combined wallet+budget meter), and
the budget admin/read surface (`POST/GET /quota/budgets`, root-only mutation, strict Zod money
strings). The drafted `resolvers` endpoint and the class-based `IQuotaPolicy`/`minimumBalance`
variants are not implementable on v0.1.0 (documented in the phase note); the equivalent
hard-stop is a `'block'` budget row enforced pre-handler by the guard.

#### Acceptance criteria

- [x] Both implementable lab estimators behave per their estimate, proven via CRAFTED balances: a
      balance strictly between the lite and pro estimates rejects the pro call (canonical 402)
      and passes the lite call on the same wallet.
- [x] The `'block'` budget row (the reconciled class-policy/minimum variant) is proven e2e: a
      count-limited budget lets exactly one call through, then the guard blocks pre-handler with
      the canonical 429 `AI_TOKENS_QUOTA_EXCEEDED` envelope and NO ledger write in any status.
- [x] Tolerance boundary unit-tested host-side: an exact product stays unrounded
      (1000 x 1.2 = 1200) and a fractional product rounds UP (1001 x 1.2 -> 1202), so a hold is
      never under-reserved.
- [x] 100% coverage.

#### Files to create / modify

- `apps/api/src/quota/**`, e2e variant modules + specs

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 05, Task 5.2 of 6 (MIDDLE).

PRECONDITIONS
- Task 5.1 done: guard live on workspace.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §17, §7.5 rows 54-57, 61, 64-65
- ConsumeTokens config shape + IQuotaPolicy from the package d.ts

TASK
Ship the Quota Lab endpoints and the policy/minimum variants.

DELIVERABLES
1. quota module/controller: /quota/lab/constant (@ConsumeTokens estimator () => 1000, body
   optional), /quota/lab/model-based (estimator req => req.body.model === 'mock-chat-pro' ? 5000
   : 1000), /quota/lab/resolvers (@ConsumeTokens with userIdResolver reading x-lab-user and
   tenantIdResolver reading x-lab-tenant). Each handler performs a small custom() command so a
   pass actually debits.
2. E2E variant modules (test-only): (a) quota policy bound via BYMAX_AI_TOKENS_QUOTA_POLICY to a
   class implementing IQuotaPolicy (fixed low balance) proving the token alternative; (b) options
   with minimumBalance 100000 proving quota.below_minimum 402.
3. Unit test for the tolerance boundary using the guard directly with a mocked ExecutionContext.
4. 100% coverage on new files; commented it().

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Pure estimators; canonical envelopes; strict TS; no em dashes.

Verification:
- test:cov 100%; test:e2e green.

Completion Protocol: standard steps; commit `feat(api): quota lab and policy variants (5.2)`.
```

---

## Task 5.3: Credits + refund endpoints

- **Status**: ✅ Done · **Priority**: P0 · **Size**: S · **Depends on**: 5.1

#### Description

(Reconciled onto v0.1.0; see the phase note.) `POST /ledger/credits` (`WalletService.grant` with
type `purchase`/`monthly_allocation`/`trial_allocation` as the entry reason, strict positive
BigInt nano-USD strings, backdated `effectiveAt`, host-side replay pre-check) and
`POST /ledger/refund` (`MeteringService.reverse`: a compensating record linked via
`reversesRecordId`/`reversedByRecordId`, wallet refunded for enforced originals). Simulates the
billing webhook the library intentionally excludes.

#### Acceptance criteria

- [x] Credits raise the balance immediately: e2e asserts the wallet balance delta equals exactly
      the granted bigint amount, with the post-credit balance echoed in the response
      (`effectiveAt` backdated so the DB-clock spendability rule can never leave a fresh top-up
      inert); a client `idempotencyKey` makes retries replay-safe (one grant, same entry).
- [x] Refund writes a NEW compensating transaction that exactly negates the original (linked via
      `reversesRecordId`; the reconciled home of `metadata.refundOf`); the original row's amounts
      stay byte-identical under the `reversed` annotation (immutability proof, matrix row 23),
      the wallet is restored by the billed cost, and a double refund is the canonical 409.
- [x] Zero/negative/fractional/oversized amounts rejected by Zod before reaching the library
      (proven e2e with a zero wallet delta); the library's own zero-amount error stays reachable
      only through its direct API.
- [x] 100% coverage.

#### Files to create / modify

- `apps/api/src/ledger/**` (controller/service additions), specs

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 05, Task 5.3 of 6 (MIDDLE).

PRECONDITIONS
- Task 5.1 done. Ledger read endpoints exist (phase 03).

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §11 (credits/refund rows), §13 scenario 3, NG3
- AiTokenTransactionService.recordCredit signature from the package d.ts

TASK
Ship the credit and refund simulation endpoints.

DELIVERABLES
1. POST /ledger/credits: Zod { amount positive int, type enum
   [purchase, monthly_allocation, trial_allocation], description? }; delegate to
   recordCredit({ userId, tenantId, amount, type, description }); JSDoc frames it as the
   billing-webhook simulation (the library records, the app charges).
2. POST /ledger/refund: Zod { transactionId, reason? }; load the original (404 unknown, 403
   foreign); recordCredit({ type: 'refund', amount: abs(original.amount), additionalMetadata:
   { refundOf: transactionId, reason } }); assert original untouched.
3. Unit + e2e: balance delta after credit; refund immutability (original row byte-equal). 100%.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Strict TS; timeless comments; no em dashes.

Verification:
- test:cov 100%; e2e green.

Completion Protocol: standard steps; commit `feat(api): credits and refund endpoints (5.3)`.
```

---

## Task 5.4: `usage/` REST

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: 5.1

#### Description

(Reconciled onto v0.1.0; see the phase note.) The full `UsageReportService.summarize` surface as
chart-ready endpoints: `GET /usage/balance` (`WalletService.getBalance`, unmetered/unguarded),
`/usage/by-period` (granularity `day|week|month`, bounded from/to), `/usage/by-type` (the
`feature` dimension), `/usage/by-model`, `/usage/top-consumers` (tenant-wide `scope` grouping,
host-ordered, topN), `/usage/system-costs` (category filter, `isSystemCost: true`).

#### Acceptance criteria

- [x] Every implementable dimension is served by exactly one endpoint; `UsageSummary` rows are
      returned verbatim (JSON-safe: bigint money as decimal strings), never reshaped.
- [x] Seed-based e2e asserts EXACT aggregation values (records, tokens, bigint costs) computed
      independently from the seed plan for ada/acme over a fixed window, per feature, model,
      month bucket, consumer ranking, and system-cost category.
- [x] Skip semantics demonstrated on the balance route (matrix row 58 reconciled): no guard, no
      `@Meter`, and an e2e-proven zero ledger delta across every lifecycle status.
- [x] 100% coverage.

#### Files to create / modify

- `apps/api/src/usage/**`, specs

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 05, Task 5.4 of 6 (MIDDLE).

PRECONDITIONS
- Task 5.1 done. Seed data from phase 01 present.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §11 (usage rows), §7.6
- UsageAggregatorService signatures + helper types from the package d.ts

TASK
Ship the analytics surface.

DELIVERABLES
1. usage module/controller/service: GET /usage/balance (@SkipQuota, getBalance),
   /usage/by-period (Zod: granularity enum day|week|month, from, to; getUsageByPeriod scoped to
   req.user unless ?scope=tenant), /usage/by-type, /usage/by-model, /usage/top-consumers
   (?topN=10, tenant-scoped), /usage/system-costs (?category=). All responses are the library
   helper types verbatim (UsageByPeriod[], UsageByType[], UsageByModel[], etc.).
2. E2E: exact-value assertions against the deterministic seed (pick ada/acme, a fixed window).
3. Unit specs for query validation and scoping branches. 100% on new files.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- No reshaping of library types; strict TS; timeless comments; no em dashes.

Verification:
- test:cov 100%; e2e green.

Completion Protocol: standard steps; commit `feat(api): usage aggregation endpoints (5.4)`.
```

---

## Task 5.5: `system-jobs/`: reindex + agent decision

- **Status**: 📋 ToDo · **Priority**: P1 · **Size**: S · **Depends on**: 5.4

#### Description

`POST /system-jobs/reindex` runs a batch embedding flagged `isSystemCost: true`,
`systemCostCategory: 'reindex'` (excluded from user reports, visible in `/usage/system-costs`);
`POST /system-jobs/agent-decision` records a `record()` transaction of type
`agent_decision_assist` with `decisionId`/`strategy`/`confidence`/`reasoning` metadata.

#### Acceptance criteria

- [ ] Reindex rows appear in system-costs aggregation and NOT in the user's by-type report
      (matrix rows 71, 84).
- [ ] Agent-decision row proves the seventh transaction type + its metadata keys (row 85, 13).
- [ ] 100% coverage.

#### Files to create / modify

- `apps/api/src/system-jobs/**`, specs

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 05, Task 5.5 of 6 (MIDDLE).

PRECONDITIONS
- Task 5.4 done (system-costs endpoint live).

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §13 scenario 7, §7.7 rows 84-85
- EmbeddingService.generateBatch (isSystemCost params) + AiTokenTransactionService.record +
  TokenTransactionMetadata reserved keys from the package d.ts

TASK
Ship the system-jobs simulations.

DELIVERABLES
1. POST /system-jobs/reindex: Zod { count 1..20 default 5 }; generateBatch over deterministic
   fixture texts with isSystemCost: true, systemCostCategory: 'reindex', resourceId 'reindex-run';
   returns tokensUsed + transactionId.
2. POST /system-jobs/agent-decision: Zod { decisionId, strategy, confidence 0..1, reasoning };
   ledger.record({ userId: req.user.id, tenantId, amount: -25, type: 'agent_decision_assist',
   metadata: { decisionId, strategy, confidence, reasoning, model: 'mock-chat-lite' } }).
3. E2E: reindex row excluded from the user's /usage/by-type but present in /usage/system-costs
   byCategory reindex; agent row queryable via /ledger/transactions?type=agent_decision_assist.
4. 100% coverage.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Strict TS; timeless comments; no em dashes.

Verification:
- test:cov 100%; e2e green.

Completion Protocol: standard steps; commit `feat(api): system jobs simulations (5.5)`.
```

---

## Task 5.6: Phase close: audit, dashboards, PR + Copilot review

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: S · **Depends on**: 5.1..5.5

#### Description

Standard phase close: replay gates, audit criteria, sync dashboards, PR
`feat(api): phase 05, quota, credits and aggregations`, GitHub Copilot review with all findings
addressed, squash-merge on green, delete branch, log.

#### Acceptance criteria

- [ ] Gates green sequentially; all criteria verified; dashboards synced; PR merged; branch gone.

#### Agent prompt

```
You are the phase-close auditor for nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 05, Task 5.6 of 6 (LAST, phase close).

PRECONDITIONS: tasks 5.1-5.5 report done on feat/phase-05-quota-aggregations.
REQUIRED READING (only these): this phase file; docs/DEVELOPMENT_PLAN.md dashboard + protocol.

TASK: close Phase 05 with an audited, reviewed, merged PR.

DELIVERABLES
1. Replay sequentially: pnpm lint, pnpm typecheck, pnpm --filter api build, test:cov (100%),
   test:e2e. Fix failures first.
2. Verify every 5.1..5.5 acceptance criterion against the tree.
3. Sync dashboards (phase file, plan row + overall, tasks README).
4. gh pr create title `feat(api): phase 05, quota, credits and aggregations`; request the GitHub
   Copilot code review; address EVERY finding; merge with CI green:
   gh pr merge --squash --delete-branch; verify branch removal.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification: PR MERGED; CI green on main.

Completion Protocol: append `- 5.6 ✅ YYYY-MM-DD: phase merged in PR #<n>`; commit
`docs(plan): mark phase 05 complete`.
```

---

## Completion log

<!-- append: - <id> ✅ YYYY-MM-DD: <one-line summary> -->

- 5.1 ✅ 2026-07-10: hold-based enforcement on all seven metered workspace handlers (tolerance-scaled estimators, EnforcementGuard, drain-then-blocked e2e)
- 5.2 ✅ 2026-07-10: quota lab (declarative constant + model-based estimators), access status read, budgets admin surface with pre-handler block e2e
- 5.3 ✅ 2026-07-10: credits (grant with backdated effectiveAt + replay pre-check) and refund (orchestrated reversal) endpoints with exact-delta e2e proofs
- 5.4 ✅ 2026-07-10: usage analytics surface (balance + five summarize dimensions) with exact seed-plan e2e assertions and bounded query validation
