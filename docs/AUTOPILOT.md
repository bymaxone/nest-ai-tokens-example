# Autopilot Config: nest-ai-tokens-example

> Per-project parameters for /bymax-workflow:autopilot. Reviewed and approved
> by the operator before the first run. The planning docs own WHAT to build
> ([`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) + [`tasks/`](tasks/)); this file
> owns HOW the chain runs.
>
> Status legend (single vocabulary, shared with the planning docs):
> 📋 ToDo · 🔄 In Progress · 👀 Review · ✅ Done · ⛔ Blocked · 🟡 Partial

## Identity

- **Project root**: the repository root (wherever this repo is checked out;
  all commands below run from it). The sibling library is expected at
  `../nest-ai-tokens`, beside this repo.
- **GitHub repo**: bymaxone/nest-ai-tokens-example (visibility: **private**)
- **Default branch**: main
- **Product summary** (target state; the repo starts docs-only and the chain
  builds toward this): the canonical reference / dogfood application for the
  `@bymax-one/nest-ai-tokens` NestJS library. A pnpm monorepo, `apps/api`
  (NestJS 11) + `apps/web` (Next.js 16), that demonstrates every public export
  and documented behavior of the library against a deterministic
  `MockAiProvider`, backed by Postgres 17 + Prisma. Defining constraint:
  **library-faithful and deterministic** (no real AI keys, mock provider only)
  at a reference-grade test bar (100% unit coverage, full E2E, export audit).
- **Roadmap file**: docs/DEVELOPMENT_PLAN.md (Progress Dashboard is canonical)
- **Tasks index**: docs/tasks/README.md
- **Phases**: 10 phases / 55 tasks (phase files docs/tasks/phase-NN-*.md)
- **Branch convention**: `feat/phase-NN-<slug>` where `<slug>` matches the phase
  filename (e.g. `feat/phase-00-repo-foundation`,
  `feat/phase-03-repositories-ledger-pricing`).

## External preconditions

<!-- Each row: when it applies, the exact check command (run from the project
     root), and what to do on failure. STOP is the default; autopilot never
     polls for external events the repo cannot influence. -->

The library rows depend on the **selected link mode** (see the decision note
below): while the dependency is a `file:` link, the sibling checks apply and
the registry check does not; once the dependency is `^0.1.0` from a registry,
the registry check applies and the sibling checks are skipped.

| Applies to | Check (exit 0 = OK, from project root) | On failure |
|---|---|---|
| launch, phases 1+ | `docker info` | STOP; operator starts Docker (Postgres compose + Testcontainers e2e need it) |
| phases 1+, `file:` link mode only | `test -d ../nest-ai-tokens` (the link target resolves; run BEFORE the dist probe below) | mark P<N> ⛔ blocked on "sibling library missing", STOP; operator clones/places `@bymax-one/nest-ai-tokens` beside this repo |
| phases 1+, `file:` link mode only | `test -d ../nest-ai-tokens/dist` (only after the existence check above passes) | mark P<N> ⛔ blocked on "sibling library not built", STOP; operator runs `pnpm -C ../nest-ai-tokens install && pnpm -C ../nest-ai-tokens build`, then relaunches |
| phases 1+, registry mode only | `npm view @bymax-one/nest-ai-tokens version` | mark P<N> ⛔ blocked on "library not published", STOP; operator publishes the package (autopilot never publishes) |

> **⚠ Launch-blocking design decision: resolve BEFORE the first `run`.**
> The library dependency is `file:../../../nest-ai-tokens` (relative to
> `apps/api/package.json`). Implementers run under `isolation: "worktree"`, so
> their working copy lives in a temporary worktree, NOT beside
> `../nest-ai-tokens`; the relative `file:` path will **not** resolve there,
> and the same is true in GitHub Actions CI (which checks out only this repo).
> Phase 01's Definition of Done ("subpath probe passes in CI") cannot hold as
> written under either condition. **Pick one before running:**
>
> 1. **Publish** `@bymax-one/nest-ai-tokens@0.1.0` to a registry (private
>    GitHub Packages) and switch the dep to `^0.1.0`; worktrees and CI then
>    resolve it by version. (Recommended; matches the plan's post-publish mode.)
> 2. **Vendor / absolute link**: resolve the library to an absolute path or a
>    pnpm global link that survives the worktree relocation, and have phase 01's
>    probe skip in CI with the link mode documented (the plan's fallback).
>
> Until this is settled, leave npm/registry publication as a manual operator
> step; autopilot does not publish packages.

## Model policy

<!-- inherit = the orchestrator's own model (the strong tier). Fix sub-agents
     always escalate to inherit when a phase stalls on review/CI findings. -->

| Phase | Model | Rationale |
|---|---|---|
| 00 Repo Foundation & CI | `sonnet` | mechanical toolchain scaffold on a fully specified checklist |
| 01 Postgres, Prisma & Library Link | `inherit` | first contact with the consumed library; subpath resolution and `file:`-link gotchas are the failure mode; exact Prisma reference shapes |
| 02 API Skeleton & Module Wiring | `inherit` | first real consumption of the library's `registerAsync` factory, DI tokens and provider port; invented library APIs are THE failure mode; identity middleware is security-adjacent |
| 03 Repositories, Ledger & Pricing | `inherit` | implements both library repository ports (14 methods) with SQL aggregation, race-safe upsert and window logic; contract fidelity plus money-adjacent correctness |
| 04 Mock Provider, Commands & Embeddings | `inherit` | provider-port contract, command/embedding DTO reuse, and the ledger transaction guarantees (one-per-call, batch aggregate, truncated debits, invalid-JSON no-debit) are subtle |
| 05 Quota, Credits & Aggregations | `inherit` | security-sensitive: quota guard enforcement (drain then 402), ledger-backed balance resolver, credit/refund money paths; a /security-review would flag all of these |
| 06 Multi-Tenant & Error Catalog | `inherit` | security-sensitive: tenant isolation (A never sees B) is the canonical tenancy invariant; full 24-code error catalog with no internal leakage |
| 07 Web Skeleton & Design System | `sonnet` | UI shell on an established API plus verbatim shared design system |
| 08 Dashboard Pages | `sonnet` | UI pages (feature work) on established endpoints plus the design system |
| 09 Quality, Docs & Export Audit | `inherit` | final hardening/audit phase: export-audit correctness, 100% coverage close, CI least-privilege verification, acceptance audit against the spec |

**Heavy phases** (silent-death watch widened to ~120 min; gates pull container
images, install browsers, or run full E2E consolidation): **02** (first
`postgres:17-alpine` image pull + Testcontainers boot), **07**/**08** (web e2e
smoke may install Playwright browsers), **09** (full E2E + 100% coverage +
export audit in one gate). Phases 03-06 also run Testcontainers e2e but on an
already-pulled image.

## Gates

<!-- The CI pipeline grows by phase. Local gate commands the implementer must
     pass, and from which phase each becomes active. Job names become
     contractual once branch protection references them. Command names come
     from DEVELOPMENT_PLAN.md Appendix A. -->

| Gate (local command) | Active from |
|---|---|
| `pnpm install && pnpm lint && pnpm typecheck && pnpm format:check` | phase 00 |
| `pnpm build` (once an app exists) | phase 01 |
| `pnpm infra:up` healthy + `prisma migrate dev` + `prisma db seed` + subpath probe | phase 01 |
| `pnpm --filter api test:cov` (100% all four metrics on implemented code) | phase 02 |
| `pnpm --filter api test:e2e` (Testcontainers `postgres:17-alpine`, needs Docker) | phase 02 |
| `pnpm --filter web test:cov` (100% `lib/**` + component tests) | phase 07 |
| `pnpm --filter web test:e2e` (shell + one live round-trip) | phase 07 |
| `pnpm audit:exports` (every library export demonstrated or ⛔-justified) | phase 09 |

**Expected-skip CI checks**: `CodeQL` and `Scorecard` are wired from phase 00
but **conditional on repository visibility**. The repo is currently **private**,
so these workflows report `skipping`; that counts as a pass, never a merge
blocker. They activate automatically (zero pipeline edits) when the repo goes
public.

## Invariant greps

<!-- Mechanically checkable project rules. Each check prints nothing and exits
     0 when the tree is clean; any output (exit 1) is a violation with the
     evidence on stdout. Directory guards keep the checks green in phases
     before apps/ exists. Run these in every implementer's phase-wide gate. -->

```bash
# Web must reference ONLY the ./shared subpath, never the server root '.'
# (catches every reference form: import, export-from, require, dynamic
# import, single or double quotes; only the exact /shared subpath is
# excluded, terminated by a quote or a deeper /, so lookalikes such as
# /shared2 stay flagged)
[ ! -d apps/web ] || ! { grep -rn "@bymax-one/nest-ai-tokens" apps/web --include='*.ts' --include='*.tsx' | grep -vE "@bymax-one/nest-ai-tokens/shared['\"/]"; }

# No suppression comments anywhere (types or lint)
[ ! -d apps ] || ! grep -rnE '@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable' apps --include='*.ts' --include='*.tsx'

# process.env confined to the config/env layer (ai-tokens.config.ts + env schema)
[ ! -d apps ] || ! { grep -rn "process\.env" apps --include='*.ts' --include='*.tsx' | grep -vE 'ai-tokens\.config\.ts|env\.(ts|schema\.ts)|\.spec\.ts|\.e2e-spec\.ts'; }

# No placeholder files (user-global rule + plan Guiding Principle 9);
# prunes .git and node_modules at ANY depth (pnpm workspaces nest them)
! { find . \( -name .git -o -name node_modules \) -prune -o \( -name '.gitkeep' -o -name '.keep' \) -print | grep .; }

# No real provider secret committed anywhere (whole repo, not just apps/)
! { grep -rnE 'sk-[A-Za-z0-9]{20,}' . --exclude-dir=.git --exclude-dir=node_modules; }

# No attribution trailers on this branch's commits (checked per PR). By
# project convention ALL Co-Authored-By trailers are banned (commits carry
# the operator's identity only), alongside any "Generated with" attribution.
# The ref check fails loudly WITH a message first, so a missing origin/main
# cannot make the negated grep pass silently.
{ git rev-parse --verify --quiet origin/main >/dev/null ||
  { echo 'invariant not evaluable: origin/main ref missing'; false; }; } &&
  ! { git log --format='%B' origin/main..HEAD | grep -iE 'Co-Authored-By|Generated with|🤖'; }
```

## Security invariants & review focus

<!-- From spec §24 (Security & Safety), §17 (Quota), §18 (Multi-Tenant),
     §19 (Error Handling). Auditable statements for /security-review and
     /bymax-quality:code-review. -->

- **No real credentials anywhere.** No OpenAI key in code, fixtures, or CI;
  `.env.example` ships placeholder-free names only; secret scanning stays clean.
  `OPENAI_API_KEY` is read **only** when `AI_PROVIDER_MODE=openai-optin` (local
  opt-in, never CI). Deterministic default is always `MockAiProvider`.
- **PII rule.** Metadata is never logged in full; **prompts are never stored in
  metadata**; the workspace stores a `resourceId` reference instead.
- **Demo identity is NOT auth.** The `x-demo-user` / `x-tenant-id` middleware is
  clearly labeled a simulation and must never be presented as a real trust
  boundary; the README points to `nest-auth-example` for the real pattern.
- **Tenant isolation (§18).** Tenant A must never read tenant B's ledger, usage,
  or pricing; every query is tenant-scoped; `multiTenant.required: true` mode
  rejects a missing tenant with the documented error.
- **Quota enforcement (§17).** The guard blocks over-quota calls with the
  canonical 402 envelope; `balanceResolver` is ledger-backed; the estimation
  tolerance boundary is respected; `@SkipQuota` applies only where intended and
  cannot be used to bypass metering silently.
- **Error-envelope integrity (§19).** Every `AiTokensException` maps to its
  documented code + HTTP status; error bodies expose no stack trace or internal
  detail.
- **Least-privilege CI (§24).** SHA-pinned actions, explicit `permissions:`
  blocks per workflow, dependency review.

**Per-phase focus** (the security-sensitive rows above):

- **P02**: identity middleware is simulation-only (no real trust); explicit
  `@Inject` for every library token; no `process.env` outside the config layer.
- **P05**: quota guard is unbypassable; credit/refund endpoints validate
  amounts (reject negative / overflow); balance math is strictly ledger-backed.
- **P06**: tenant isolation proven in **both** modes (default + `required`);
  every one of the 24 error codes reachable and leak-free.
- **P09**: the export audit genuinely fails CI on an undemonstrated export
  (proven by a mutation test); secret scan clean; CI least-privilege verified.

## Review bot

- **Reviewer**: `copilot-pull-request-reviewer[bot]`; request on every phase PR
  with `gh pr edit <PR#> --add-reviewer copilot-pull-request-reviewer[bot]`.
  (The plan mandates a GitHub Copilot code review on every phase PR, all
  findings addressed before merge. The repo ruleset also auto-requests a
  Copilot review on every push to a PR targeting main.)
- **Review-bot timeout**: 15 minutes; a request pending this long with no
  review submitted is treated as bot-unresponsive: remove the request, leave one
  factual PR comment as the audit trail, and proceed CI-only (the implementer's
  zero-findings review floor already ran before the PR opened).

## Merge policy

- **Method**: squash (delete branch on merge, always, local + remote, with the
  `git ls-remote` / `git branch --list` proof).
- **Grace window**: 5 minutes since the last push (measured concretely).
- **Review-bot timeout**: 15 minutes (see Review bot above).
- **Stall limit**: 3 full fix cycles on the same phase with no progress:
  mark 🟡/⛔ with the exact failing gate, `PushNotification`, STOP; never
  brute-force.

## Custom conventions

<!-- Beyond /bymax-workflow:standards. Sourced from DEVELOPMENT_PLAN.md
     Guiding Principles + Global Conventions and spec §10.2. -->

- **`apps/web` imports ONLY the `./shared` subpath** of the library (browser-safe
  surface); the server root `.` subpath appears only in `apps/api`.
- **Design system is verbatim.** `apps/web` integrates the shared Bymax design
  system from [`design_system.html`](design_system.html) unchanged; the shell
  must be indistinguishable from the sibling example apps; do not restyle tokens,
  fonts, or shell.
- **Determinism.** `MockAiProvider` only; no real provider network calls; no real
  API key anywhere; failure paths reached via injection markers, not outages.
- **No `process.env` outside the config/env layer** (spec §10.2).
- **House style.** `@fileoverview` + `@layer` header on every file; JSDoc on
  every public symbol; Zod DTOs + JSDoc (no Swagger); functions ≤ 50 lines,
  files ≤ 800; TypeScript strict, no `any`.
- **Timeless comments**, English-only, no em dashes in code or docs, no
  `.gitkeep`.
- **No shortcuts**: no `@ts-ignore` / `eslint-disable` / `--no-verify` /
  `#[allow]` / skipped hooks / lowered coverage thresholds, neither in
  implementer work nor in what the orchestrator accepts.
- **Conventional Commits** everywhere; **no AI-attribution trailers** in commits,
  PR titles, PR bodies, or comments.
- **Sequential tests, bounded workers**: one suite at a time, `maxWorkers: '50%'`
  baked into both Jest and Vitest configs; never run api and web suites
  concurrently; never fan out parallel test agents.
- **One PR per phase**, branch `feat/phase-NN-<slug>`; the last task opens the
  PR, requests the Copilot review, and the orchestrator merges only on the full
  gate.
