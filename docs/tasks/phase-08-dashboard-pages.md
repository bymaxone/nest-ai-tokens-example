# Phase 08: Dashboard Pages

> **Status**: 🔄 In Progress · **Progress**: 1 / 6 tasks · **Last updated**: 2026-07-10
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#per-phase-detail) §Phase 08
> **Source spec**: [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md) §14 (page-by-page), §13 (Demonstration Scenarios)

## Reconciliation note (endpoint/type surface vs drafted names)

The `apps/web/src/lib/api-client.ts` + `api-types.ts` pair built in phase 07 already models every
route this phase needs, field for field against the real controllers (`apps/api/src/{workspace,
ledger,pricing,usage,quota,errors-demo}`); no client/type changes were required to start this
phase. Two drafted names in the task blocks do not exist on the real surface and are reconciled
here:

- **"Type chips from `AI_TOKEN_TRANSACTION_TYPES`" (task 8.3).** No such export exists on the
  library's shared subpath (it exports `WALLET_ENTRY_TYPES` for wallet entries, not ledger usage
  rows). The Ledger's `GET /ledger/transactions` filter surface (`ListTransactionsQueryDto`) is
  `status` (`UsageStatus`: pending/posted/reversed/released) and `operation` (`AiOperation`:
  chat/responses/embeddings/...). The Ledger page builds its filter chips from `UsageStatus` and
  `AiOperation` (both re-exported by `@bymax-one/nest-ai-tokens/shared`) instead.
- **Per-field `formatted` money strings (project constraint).** Only `BalanceView`,
  `WorkspaceUsageView.cost`, and `CreditResponse.balance` carry a pre-formatted USD string.
  `PriceRowView`, `UsageSummaryView`, and `UsageRecordView` carry only raw nano-USD decimal
  strings. `apps/web/src/lib/money.ts` formats those the same way the library formats them
  server-side: it re-exports the library's own `formatNanoUsd` from
  `@bymax-one/nest-ai-tokens/shared` (exact string-to-bigint parse, no floating-point division) so
  the web never computes a cost, it only renders an already-settled amount through the library's
  own formatter.

## Context

The eight pages that make every library capability visible in the browser. Requires the backend
feature phases (03-06) and the web skeleton (07). Each task ships pages complete with loading,
empty, and error states, component tests, and the design-system look. When this phase closes,
every §13 scenario is walkable end to end in the browser.

> **Completion Protocol ("standard steps"):** task Status ✅ (block + index) -> checkboxes ->
> header Progress -> plan dashboard row + overall counter -> tasks README -> Completion log entry
> -> Conventional commit.

## Rules-of-phase

1. Pages consume ONLY the documented endpoints through the typed client; no ad-hoc fetches.
2. Every page handles loading, empty, and `ApiError` states; error envelopes are rendered
   faithfully (code + message + details), never swallowed.
3. Charts are Recharts via the design-system chart recipe; money renders with 6-decimal USD
   precision where costs are shown.
4. Component tests accompany each page in the same task (no test backlog).
5. Design parity: reuse the shell primitives; no bespoke visual language.

## Reference docs

- Spec §14 (per-page requirements), §13 (scenarios each page must enable), §11 (endpoints)
- [`../design_system.html`](../design_system.html) chart + form recipes

## Task index

| ID  | Task                                                                  | Status | Priority | Size | Depends on |
| --- | --------------------------------------------------------------------- | ------ | -------- | ---- | ---------- |
| 8.1 | Branch + Overview page (stat cards + sparkline)                       | ✅     | P0       | M    | none       |
| 8.2 | Playground page (5 command cards + embeddings panel + failure helper) | 📋     | P0       | L    | 8.1        |
| 8.3 | Ledger page (table, filters, inspector, refund/top-up)                | 📋     | P0       | M    | 8.1        |
| 8.4 | Pricing + Usage pages (tables, timeline, charts, leaderboard)         | 📋     | P0       | L    | 8.1        |
| 8.5 | Quota Lab + Tenants + Errors pages                                    | 📋     | P0       | M    | 8.2        |
| 8.6 | Phase close: audit, dashboards, PR + Copilot review                   | 📋     | P0       | S    | 8.1..8.5   |

---

## Task 8.1: Branch + Overview page

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: none

#### Description

The landing page: balance card (`/usage/balance`), tokens-consumed and cost-USD stat cards
(ledger totals), a 30-day usage sparkline (`/usage/by-period?granularity=day`), and the current
default models with pricing badges (`/workspace/models`).

#### Acceptance criteria

- [x] Branch `feat/phase-08-dashboard-pages` created with `git switch -c`.
- [x] All four data blocks live with loading/empty/error states; switcher changes refresh them.
- [x] Sparkline renders the seeded history deterministically.
- [x] Component tests (mocked client) cover states; 100% on touched `lib/**`.

#### Files to create / modify

- `apps/web/src/app/(dashboard)/overview/**`, `components/stat-card.tsx`, `components/charts/**`

#### Agent prompt

```
You are a senior Next.js/React engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example, reference app for @bymax-one/nest-ai-tokens. CURRENT PHASE: 08,
Task 8.1 of 6 (FIRST).

PRECONDITIONS
- Phases 03-07 merged: endpoints + shell + client + switcher live.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §14 (Overview), §13 scenario 1
- docs/design_system.html (stat card + chart recipes)

TASK
Create the phase branch and ship the Overview page.

DELIVERABLES
1. Branch: `git switch -c feat/phase-08-dashboard-pages` (NEVER checkout -b).
2. overview/page.tsx + components: BalanceCard (/usage/balance), StatCards (tokens consumed +
   cost USD from the ledger endpoints), UsageSparkline (Recharts area over
   /usage/by-period?granularity=day, last 30 days), ModelsBadge (/workspace/models with price per
   1M tokens).
3. Loading skeletons, empty states, ApiError rendering (code + message) per the rules-of-phase.
4. Component tests with a mocked api client for all states.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Typed client only; verify current Recharts v3 API against docs; strict TS; timeless comments;
  no em dashes.

Verification:
- `pnpm --filter web test:cov` green; manual: switcher flips the numbers between ada and linus.

Completion Protocol: standard steps; commit `feat(web): overview page (8.1)`.
```

---

## Task 8.2: Playground page

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: L · **Depends on**: 8.1

#### Description

The interactive heart: five command cards (Translate, Summarize, Rewrite, Analyze, Custom) with
their specific inputs, a model picker (mock models), the embeddings panel (single + batch), a live
result panel (content, token split, USD cost breakdown, transactionId link into the Ledger), and
the failure-marker helper (dropdown appending `@@fail:*@@` markers with an explanation of what
each demonstrates). A streaming note marks the documented boundary.

#### Acceptance criteria

- [ ] Every command round-trips and renders content + `tokensUsed` + `estimatedCost` + a link to
      `/ledger?focus=<transactionId>`.
- [ ] Batch embeddings show ONE transaction id for N inputs (scenario 2 walkable).
- [ ] Failure helper produces the canonical error envelope rendering (e.g. 429 rate_limited).
- [ ] Component tests per card (mocked client); 100% on touched `lib/**`.

#### Files to create / modify

- `apps/web/src/app/(dashboard)/playground/**`, `components/playground/**`

#### Agent prompt

```
You are a senior Next.js/React engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 08, Task 8.2 of 6 (MIDDLE).

PRECONDITIONS
- Task 8.1 done.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §14 (Playground), §12 (markers), §13 scenarios 1-2, 5

TASK
Ship the Playground.

DELIVERABLES
1. playground/page.tsx with a CommandCard per command: Translate (text, source, multi-target
   chips), Summarize (style select), Rewrite (instruction), Analyze (text; fixed schema note),
   Custom (system + user prompts, format toggle); shared ModelPicker (mock models from
   /workspace/models); ResultPanel (content, prompt/completion token split, USD breakdown to 6
   decimals, transactionId linking to /ledger?focus=).
2. EmbeddingsPanel: single text -> vector preview (first 8 dims) + cost; batch textarea (one per
   line) -> N vectors, ONE transactionId callout.
3. FailureHelper: select of the @@fail:*@@ markers with a one-line explanation each; appends the
   marker to the active card's input.
4. A visible note: response streaming is out of the library's v1 scope (honest boundary).
5. Component tests for each card happy path + one error envelope render.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Typed client only; strict TS; timeless comments; no em dashes.

Verification:
- `pnpm --filter web test:cov` green; manual: drain scenario reachable (repeat commands, watch
  balance in the header fall, hit 402 rendered faithfully).

Completion Protocol: standard steps; commit `feat(web): playground page (8.2)`.
```

---

## Task 8.3: Ledger page

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 8.1

#### Description

The audit surface: filterable/paginated transactions table (type chips from
`AI_TOKEN_TRANSACTION_TYPES`, date range, debit/credit toggle), row inspector (full metadata JSON,
cost snapshot, `refundOf` links), the refund action, the top-up dialog (credit types), and
`?focus=<id>` deep-linking from the Playground.

#### Acceptance criteria

- [ ] Filters map 1:1 to the `/ledger/transactions` query contract; pagination works.
- [ ] Inspector renders metadata verbatim (JSON viewer) including `batchSize`, `resourceId`,
      system-cost keys.
- [ ] Refund creates the compensating row and refreshes; original row visibly untouched
      (scenario 3 walkable).
- [ ] Component tests; 100% on touched `lib/**`.

#### Files to create / modify

- `apps/web/src/app/(dashboard)/ledger/**`, `components/ledger/**`

#### Agent prompt

```
You are a senior Next.js/React engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 08, Task 8.3 of 6 (MIDDLE).

PRECONDITIONS
- Task 8.1 done.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §14 (Ledger), §13 scenario 3
- AI_TOKEN_TRANSACTION_TYPES from the shared subpath

TASK
Ship the Ledger page.

DELIVERABLES
1. ledger/page.tsx: TransactionsTable (columns date, type badge, amount signed/colored, model,
   cost, id short) with type chips built from AI_TOKEN_TRANSACTION_TYPES, date-range picker,
   debit/credit toggle, limit/offset pagination; ?focus= deep link opens the inspector.
2. RowInspector drawer: full row + metadata JSON viewer + refund button (POST /ledger/refund with
   confirm) + refundOf back-link.
3. TopUpDialog: amount + credit-type select -> POST /ledger/credits; header balance refreshes.
4. Component tests: filters wiring, inspector render, refund flow (mocked).

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Typed client only; strict TS; timeless comments; no em dashes.

Verification:
- `pnpm --filter web test:cov` green; manual: focus deep link from Playground lands highlighted.

Completion Protocol: standard steps; commit `feat(web): ledger page (8.3)`.
```

---

## Task 8.4: Pricing + Usage pages

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: L · **Depends on**: 8.1

#### Description

Pricing: current-pricing table, per-model history timeline (windows as ranges, open window
highlighted), the update form (`PUT /pricing/:model` with an "old windows stay intact" callout),
flush-cache button. Usage: by-period chart with granularity switch, by-type donut, by-model bars,
top-consumers leaderboard, system-costs panel grouped by category.

#### Acceptance criteria

- [ ] Price update round-trip shows the closed window + successor on the timeline without a
      reload (scenario 4 walkable).
- [ ] All five usage visualizations render the deterministic seed correctly; granularity switch
      re-queries.
- [ ] System-costs panel shows the `reindex` category from phase 05 (scenario 7 walkable).
- [ ] Component tests; 100% on touched `lib/**`.

#### Files to create / modify

- `apps/web/src/app/(dashboard)/pricing/**`, `(dashboard)/usage/**`, `components/charts/**`

#### Agent prompt

```
You are a senior Next.js/React engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 08, Task 8.4 of 6 (MIDDLE).

PRECONDITIONS
- Task 8.1 done.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §14 (Pricing, Usage), §13 scenarios 4 and 7

TASK
Ship the Pricing and Usage pages.

DELIVERABLES
1. pricing/page.tsx: CurrentPricingTable (/pricing), HistoryTimeline per selected model
   (/pricing/:model/history rendering effectiveFrom/effectiveTo ranges; open window badge),
   UpdatePricingForm (input/output per 1M USD; PUT; success refreshes table + timeline; callout:
   history is immutable, updates close the open window), FlushCacheButton.
2. usage/page.tsx: PeriodChart (granularity day|week|month switch), TypeDonut, ModelBars,
   TopConsumers list (tokens + cost + count), SystemCostsPanel (byCategory + byType).
3. Component tests across both pages (mocked client, deterministic fixtures mirroring the seed).

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Recharts via the design-system recipe; 6-decimal USD; strict TS; no em dashes.

Verification:
- `pnpm --filter web test:cov` green; manual: scenario 4 walkable end to end.

Completion Protocol: standard steps; commit `feat(web): pricing and usage pages (8.4)`.
```

---

## Task 8.5: Quota Lab + Tenants + Errors pages

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 8.2

#### Description

Quota Lab: guard-inputs visualization (balance, estimated, tolerance, minimum), the three lab
endpoints as buttons, drain/top-up shortcuts. Tenants: the isolation walkthrough (side-by-side
snapshots when switching, the shared-pricing boundary note, the required-mode explanation).
Errors: the catalog grid firing `/errors-demo/:code` and rendering status + envelope + details
for each.

#### Acceptance criteria

- [ ] Quota Lab renders the decision inputs and demonstrates pass/402 per estimator (scenario 5).
- [ ] Tenants page makes isolation visible (scenario 6) and states the honest boundaries.
- [ ] Errors grid covers every runtime-triggerable code with its rendered envelope (scenario 8).
- [ ] Component tests; 100% on touched `lib/**`.

#### Files to create / modify

- `apps/web/src/app/(dashboard)/quota/**`, `(dashboard)/tenants/**`, `(dashboard)/errors/**`

#### Agent prompt

```
You are a senior Next.js/React engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 08, Task 8.5 of 6 (MIDDLE).

PRECONDITIONS
- Task 8.2 done (result-panel + envelope components reusable).

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §14 (Quota Lab, Tenants, Errors), §13 scenarios 5, 6, 8

TASK
Ship the last three pages.

DELIVERABLES
1. quota/page.tsx: GuardInputsCard (balance via /usage/balance, tolerance + minimum from
   /workspace/models options echo or a small config endpoint if present; otherwise display the
   documented env defaults with a note), LabButtons (constant, model-based, resolvers) rendering
   pass/402 outcomes, Drain shortcut (loops a cheap command until 402) and TopUp shortcut.
2. tenants/page.tsx: side-by-side balance + last-transactions snapshot that re-queries on
   switcher change; boundary callouts (shared pricing across tenants; required-mode behavior).
3. errors/page.tsx: grid of catalog codes (grouped ledger/pricing/provider/command/quota) firing
   POST /errors-demo/:code and rendering { status, error.code, error.message, error.details };
   config codes shown as boot-time entries with an explanation instead of a button.
4. Component tests per page.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Typed client only; faithful envelopes; strict TS; no em dashes.

Verification:
- `pnpm --filter web test:cov` green; manual: scenarios 5, 6, 8 walkable.

Completion Protocol: standard steps; commit `feat(web): quota, tenants and errors pages (8.5)`.
```

---

## Task 8.6: Phase close: audit, dashboards, PR + Copilot review

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: S · **Depends on**: 8.1..8.5

#### Description

Standard phase close plus the scenario sweep: walk all eight §13 scenarios in the browser and
record the outcome in the PR body. PR `feat(web): phase 08, dashboard pages`, GitHub Copilot
review, squash-merge on green, delete branch, log.

#### Acceptance criteria

- [ ] All eight §13 scenarios walk green (evidence in the PR body).
- [ ] Gates green; dashboards synced; PR merged with review resolved; branch gone.

#### Agent prompt

```
You are the phase-close auditor for nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 08, Task 8.6 of 6 (LAST, phase close).

PRECONDITIONS: tasks 8.1-8.5 report done on feat/phase-08-dashboard-pages.
REQUIRED READING (only these): this phase file; docs/TECHNICAL_SPECIFICATION.md §13;
docs/DEVELOPMENT_PLAN.md dashboard + protocol.

TASK: close Phase 08 with an audited, reviewed, merged PR.

DELIVERABLES
1. Replay sequentially: pnpm lint, typecheck, --filter web build, --filter web test:cov,
   --filter api test:e2e (still green).
2. Scenario sweep: with infra + both apps running, walk §13 scenarios 1-8; record each outcome
   (pass + one-line evidence) in the PR body; fix any failure before proceeding.
3. Sync dashboards; gh pr create title `feat(web): phase 08, dashboard pages`; request the
   GitHub Copilot code review; address EVERY finding; merge with CI green:
   gh pr merge --squash --delete-branch; verify branch removal.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification: PR MERGED; CI green on main.

Completion Protocol: append `- 8.6 ✅ YYYY-MM-DD: phase merged in PR #<n>`; commit
`docs(plan): mark phase 08 complete`.
```

---

## Completion log

<!-- append: - <id> ✅ YYYY-MM-DD: <one-line summary> -->

- 8.1 ✅ 2026-07-10: Overview page (BalanceCard, TotalsStats, UsageSparkline, ModelsBadge) plus
  the shared `useApiQuery`/`useApiMutation` hooks, `StatCard`, `ErrorBanner`, and `money.ts` that
  every later task in this phase builds on.
