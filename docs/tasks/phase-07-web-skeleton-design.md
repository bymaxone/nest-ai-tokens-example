# Phase 07: Web Skeleton & Design System

> **Status**: 🔄 In Progress · **Progress**: 2 / 5 tasks · **Last updated**: 2026-07-10
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#per-phase-detail) §Phase 07
> **Source spec**: [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md) §14 (Frontend Design), §15 (Design System), §8.2 (shared subpath)

> **Reconciliation (2026-07-10):** the shipped library v0.1.0 and the REAL `apps/api` surface built
> in phases 01-06 supersede the shapes drafted here and in spec §11/§14 (same rule as the phase
> 01-06 notes). The shared subpath (`dist/shared/index.d.ts`) exports `UsageRecord`, `PriceVersion`,
> `AccessStatus`, `Budget`/`BudgetStatus`, `AiTokensErrorResponse`, `AI_TOKENS_ERROR_CODES`,
> `AI_OPERATIONS`, `SERVICE_TIERS`, `formatNanoUsd`, and related money/catalog helpers, NOT the
> drafted `TokenTransaction`/`ModelPricing`/`UsageBy*`/`AI_TOKEN_TRANSACTION_TYPES` names. It also
> ships no `JsonSafe<T>` mapped type (that utility lives only on the server subpath), so the api
> client's response types are hand-declared wire shapes (bigint money and `Date` fields as `string`,
> matching what actually crosses the JSON boundary) built ON the shared unions/interfaces wherever
> they apply (`AiOperation`, `ServiceTier`, `ProviderId`, `UsageStatus`, `MeteringScope`,
> `AiTokensErrorCode`) rather than re-declaring those catalog types. The route catalogue is the REAL
> one from `apps/api/src/{workspace,ledger,pricing,usage,quota,errors-demo,system-jobs,health}`
> (module map, spec §10.1), not the drafted spec §11 table: every controller method in those modules
> has a typed client method. Every app-raised error (library `AiTokensException` AND the host
> `ApiException`) serializes the same `{ error: { code, message, details? } }` envelope, so the
> client narrows on one shape regardless of which layer raised it; host codes (e.g.
> `provider.rate_limited`) are outside the `AI_TOKENS_ERROR_CODES` union and stay typed as `string`.
>
> **Design system.** `design_system.html` documents the production sibling recipe as Tailwind v4 +
> shadcn, but its own rendering (and the literal `tokens.css`/`globals.css` file names this task
> targets) is hand-written CSS custom properties and component-recipe classes. This phase ports
> that hand-written layer VERBATIM (same variable names, same class names, same values) rather than
> adding Tailwind/shadcn/Radix as new dependencies: it is the smaller, equally faithful surface for
> a skeleton phase whose pages are stubs until phase 08.
>
> **CI.** The reusable `node-ci.yml` has no separate "web-test" job: web unit coverage folds into
> the existing `unit` job through the root `test:cov` script (already
> `pnpm -r --workspace-concurrency=1 --if-present run test:cov`, serialized) once
> `apps/web/package.json` carries a `test:cov` script. Setting `has-web: true` turns on the
> reusable's own `web-build` job. The shared-subpath-only grep is a new repo-specific CI job
> (mirroring the existing `probe` job), since the reusable has no such input.

## Context

The dashboard shell. `apps/web` is a Next.js 16 App Router application whose chrome is
pixel-consistent with the sibling reference apps: same tokens, fonts, glass shell, and navigation
pattern from [`design_system.html`](../design_system.html). This phase delivers the shell, the
typed api client built on the library's `./shared` subpath, the user/tenant switcher, and the web
test/CI plumbing. Pages arrive in phase 08. Can start once phase 02 is merged (client contracts
may be mocked until 03-06 endpoints land).

> **Completion Protocol ("standard steps"):** task Status ✅ (block + index) -> checkboxes ->
> header Progress -> plan dashboard row + overall counter -> tasks README -> Completion log entry
> -> Conventional commit.

## Rules-of-phase

1. `apps/web` imports ONLY `@bymax-one/nest-ai-tokens/shared` (never the server subpath); a CI
   grep enforces it.
2. The design system is applied verbatim: tokens/fonts/shell copied from `design_system.html`,
   not reinvented; visual parity with a sibling is an acceptance criterion.
3. The api client is fully typed: responses typed with the shared types; errors narrowed on
   `AI_TOKENS_ERROR_CODES`.
4. Demo identity travels as `x-demo-user`/`x-tenant-id` headers set by the switcher; persisted in
   `localStorage`.
5. 100% coverage on `lib/**`; component tests for the shell pieces.

## Reference docs

- Spec §14, §15, §8.2; [`../design_system.html`](../design_system.html)
- Sibling reference for shell structure: `nest-cache-example` `apps/web` layout conventions

## Task index

| ID  | Task                                                      | Status | Priority | Size | Depends on |
| --- | --------------------------------------------------------- | ------ | -------- | ---- | ---------- |
| 7.1 | Branch + Next.js 16 app init + design tokens/fonts        | ✅     | P0       | M    | none       |
| 7.2 | App shell: sidebar, header, page scaffold (8 nav entries) | ✅     | P0       | M    | 7.1        |
| 7.3 | Typed api client on the shared subpath + error narrowing  | 📋     | P0       | M    | 7.1        |
| 7.4 | User/tenant switcher + Vitest setup + CI web jobs         | 📋     | P0       | M    | 7.2, 7.3   |
| 7.5 | Phase close: audit, dashboards, PR + Copilot review       | 📋     | P0       | S    | 7.1..7.4   |

---

## Task 7.1: Branch + Next.js 16 init + design tokens

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: none

#### Description

Initialize `apps/web` (Next.js 16, App Router, TypeScript strict, ESM) and port the design
system: CSS custom properties/tokens, font loading, global styles, and the base surface classes
from `design_system.html`.

#### Acceptance criteria

- [x] Branch `feat/phase-07-web-skeleton-design` created with `git switch -c`.
- [x] `pnpm --filter web dev` serves a page using the design tokens (background, typography,
      glass card visible). (Verified via `next build` + `next start`; `next dev` itself hits an
      unrelated port conflict from a concurrent sibling worktree in this environment.)
- [x] Tokens/fonts match `design_system.html` exactly (same variable names and values).
- [x] Workspace lint/typecheck cover the new app.

#### Files to create / modify

- `apps/web/**` (init), `apps/web/src/app/globals.css`, `apps/web/src/styles/tokens.css`

#### Agent prompt

```
You are a senior Next.js/React engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example, reference app for @bymax-one/nest-ai-tokens. The dashboard must
be visually indistinguishable from the sibling Bymax example apps.

CURRENT PHASE: 07, Task 7.1 of 5 (FIRST).

PRECONDITIONS
- Phase 02 merged (api boots). docs/design_system.html present.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §14-15
- docs/design_system.html (tokens, fonts, shell recipes)

TASK
Create the phase branch and the Next.js 16 app with the design system foundations.

DELIVERABLES
1. Branch: `git switch -c feat/phase-07-web-skeleton-design` (NEVER checkout -b).
2. apps/web: Next.js 16 App Router init (verify current create/config shape against official
   Next.js docs), TypeScript strict extending ../../tsconfig.base.json, ESLint wired into the
   flat config.
3. styles/tokens.css + globals.css porting the design_system.html custom properties, font
   stack loading, base surfaces (glass card, page background) with the SAME variable names.
4. A temporary index page rendering one glass card with the brand heading to prove the tokens.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Do not reinvent tokens; port them. Strict TS; timeless comments; no em dashes.

Verification:
- `pnpm --filter web dev` renders the tokenized page; pnpm lint + typecheck green.

Completion Protocol: standard steps; commit `feat(web): next 16 init with design tokens (7.1)`.
```

---

## Task 7.2: App shell

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: 7.1

#### Description

The dashboard chrome: sidebar with the eight navigation entries (Overview, Playground, Ledger,
Pricing, Usage, Quota Lab, Tenants, Errors), header with the app name + switcher slot, page
scaffold (title, description, content grid), loading/error boundaries: all per the design-system
shell recipe.

#### Acceptance criteria

- [x] Every nav entry routes to a stub page with the standard page scaffold.
- [x] Active-route highlight, responsive collapse (sidebar hides under 900px per the design
      system's own shell breakpoint), and the family footer note (package name in the sidebar
      footer).
- [x] Component tests for sidebar (active state) and scaffold render. (Deferred to compile
      alongside the Vitest runner in 7.4, as this task's Agent prompt explicitly allows; the
      component code itself is verified here via `next build` rendering all eight routes plus a
      `next start` smoke asserting the active nav-item class on `/overview`.)

#### Files to create / modify

- `apps/web/src/app/(dashboard)/layout.tsx`, `components/shell/**`, stub `page.tsx` per route

#### Agent prompt

```
You are a senior Next.js/React engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 07, Task 7.2 of 5 (MIDDLE).

PRECONDITIONS
- Task 7.1 done: tokens live.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §14; docs/design_system.html (shell recipe)

TASK
Build the dashboard shell with the eight routes.

DELIVERABLES
1. (dashboard)/layout.tsx: sidebar + header per the design-system shell; children grid.
2. components/shell: Sidebar (entries: overview, playground, ledger, pricing, usage, quota,
   tenants, errors; active highlight via usePathname), Header (title + switcher slot placeholder),
   PageScaffold (title, description, actions slot).
3. Stub page.tsx per route using PageScaffold with the §14 one-line description.
4. Vitest component tests: sidebar active state, scaffold render. (Vitest config may land in 7.4;
   if so, write tests now and wire the runner there, keeping this task's tests compiling.)

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Design parity is the bar; strict TS; timeless comments; no em dashes.

Verification:
- All eight routes render with the shell; lint/typecheck green.

Completion Protocol: standard steps; commit `feat(web): dashboard shell and routes (7.2)`.
```

---

## Task 7.3: Typed api client

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 7.1

#### Description

`lib/api-client.ts`: a thin typed fetch wrapper for every backend route (§11 catalogue), request/
response types built from `@bymax-one/nest-ai-tokens/shared` (`TokenTransaction`, `ModelPricing`,
`UsageBy*`, `AI_TOKEN_TRANSACTION_TYPES`), an `ApiError` class narrowing the canonical envelope on
`AI_TOKENS_ERROR_CODES`, and header injection from the identity store (7.4).

#### Acceptance criteria

- [ ] Every §11 route has a typed method; no `any` anywhere.
- [ ] Errors parse the canonical envelope; `isCode(err, AI_TOKENS_ERROR_CODES.X)` helper works.
- [ ] Only the shared subpath is imported (grep-proof).
- [ ] 100% unit coverage on `lib/**` (fetch mocked).

#### Files to create / modify

- `apps/web/src/lib/api-client.ts`, `lib/api-types.ts`, unit tests

#### Agent prompt

```
You are a senior TypeScript frontend engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 07, Task 7.3 of 5 (MIDDLE).

PRECONDITIONS
- Task 7.1 done. The api routes catalogue is spec §11 (some endpoints may still be pending in the
  backend; type them from the spec contract).

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §11 (endpoint catalogue), §19 (envelope), §8.2
- The shared-subpath exports from the package d.ts

TASK
Build the fully typed api client.

DELIVERABLES
1. lib/api-types.ts: request/response types per §11 built ON the shared types (import
   TokenTransaction, ModelPricing, CostCalculation, UsageByPeriod/Type/Model, TokenTransactionType
   from @bymax-one/nest-ai-tokens/shared; never re-declare).
2. lib/api-client.ts: base fetch with JSON handling, identity headers from a HeaderProvider
   callback (wired in 7.4), one typed method per route, ApiError extending Error carrying
   { code, message, details, status } parsed from the canonical envelope, and an isCode narrowing
   helper on AI_TOKENS_ERROR_CODES.
3. Unit tests with mocked fetch: success mapping, envelope parsing, narrowing, network-error
   path. 100% coverage on lib/**.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- ONLY the /shared subpath; strict TS no any; timeless comments; no em dashes.

Verification:
- `pnpm --filter web test:cov` 100% on lib/**; grep confirms no server-subpath import.

Completion Protocol: standard steps; commit `feat(web): typed api client on shared subpath
(7.3)`.
```

---

## Task 7.4: Switcher + Vitest + CI web jobs

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 7.2, 7.3

#### Description

The user/tenant switcher (header component listing the demo users, persisting to `localStorage`,
feeding the api client headers), the Vitest + Testing Library setup with 100% thresholds on
`lib/**`, and the CI `web-build`/`web-test` jobs appended to the chain.

#### Acceptance criteria

- [ ] Switcher renders the demo users (ada/grace/linus/root) with tenant badges; selection
      persists across reloads; client sends the headers.
- [ ] A live round-trip works: the Overview stub calls `GET /usage/balance` through the client
      and renders the number (against a locally running api).
- [ ] `pnpm --filter web test:cov` enforces 100% on `lib/**`; component tests green.
- [ ] CI gains `web-build` + `web-test` jobs (names contractual); grep step enforcing the
      shared-only import.

#### Files to create / modify

- `apps/web/src/components/identity-switcher.tsx`, `lib/identity-store.ts`, `vitest.config.ts`,
  `.github/workflows/ci.yml`

#### Agent prompt

```
You are a senior Next.js/React engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 07, Task 7.4 of 5 (MIDDLE).

PRECONDITIONS
- Tasks 7.2-7.3 done.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §14 (switcher paragraph), §22 (web tier)

TASK
Ship identity switching, the web test rig, and the CI extension.

DELIVERABLES
1. lib/identity-store.ts: localStorage-backed store { user, tenantId } with subscribe API; the
   api client's HeaderProvider reads it.
2. components/identity-switcher.tsx: header dropdown of demo users (ada/acme, grace/acme,
   linus/globex, root/global) with tenant badges; updates the store.
3. Overview stub upgrade: fetch /usage/balance via the client and render the value (loading +
   ApiError states), proving the live round-trip.
4. vitest.config.ts + setup (Testing Library, jsdom), coverage thresholds 100% for lib/**,
   maxWorkers '50%'. Migrate/enable the 7.2-7.3 tests.
5. ci.yml: append web-build (next build) and web-test (vitest run --coverage) jobs to the
   needs-chain; add a grep step failing on `from '@bymax-one/nest-ai-tokens'` (server subpath)
   inside apps/web/src.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Verify current Vitest + Testing Library APIs against docs. One suite at a time locally.
  Strict TS; no em dashes.

Verification:
- `pnpm --filter web test:cov` green at thresholds; CI green on the branch.

Completion Protocol: standard steps; commit `feat(web): identity switcher, vitest and ci jobs
(7.4)`.
```

---

## Task 7.5: Phase close: audit, dashboards, PR + Copilot review

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: S · **Depends on**: 7.1..7.4

#### Description

Standard phase close: replay gates (including web build/test), visual-parity check (screenshot
beside a sibling), sync dashboards, PR `feat(web): phase 07, web skeleton and design system`,
GitHub Copilot review, squash-merge on green, delete branch, log.

#### Acceptance criteria

- [ ] Gates green; parity screenshot attached to the PR body.
- [ ] Dashboards synced; PR merged with review resolved; branch gone.

#### Agent prompt

```
You are the phase-close auditor for nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 07, Task 7.5 of 5 (LAST, phase close).

PRECONDITIONS: tasks 7.1-7.4 report done on feat/phase-07-web-skeleton-design.
REQUIRED READING (only these): this phase file; docs/DEVELOPMENT_PLAN.md dashboard + protocol.

TASK: close Phase 07 with an audited, reviewed, merged PR.

DELIVERABLES
1. Replay sequentially: pnpm lint, typecheck, --filter web build, --filter web test:cov,
   --filter api test (unchanged but must stay green).
2. Verify every 7.1..7.4 criterion; capture a shell screenshot and reference it in the PR body
   as the design-parity evidence.
3. Sync dashboards; gh pr create title `feat(web): phase 07, web skeleton and design system`;
   request the GitHub Copilot code review; address EVERY finding; merge with CI green:
   gh pr merge --squash --delete-branch; verify branch removal.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification: PR MERGED; CI green on main.

Completion Protocol: append `- 7.5 ✅ YYYY-MM-DD: phase merged in PR #<n>`; commit
`docs(plan): mark phase 07 complete`.
```

---

## Completion log

<!-- append: - <id> ✅ YYYY-MM-DD: <one-line summary> -->
