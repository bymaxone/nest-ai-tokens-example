# Task Files: Index & Conventions

> Per-phase task breakdowns for [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md). Start at the
> [Progress Dashboard](../DEVELOPMENT_PLAN.md#progress-dashboard) (canonical; this index mirrors
> it). The product spec is [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md).

## Phase files

| Phase | File                                      | Tasks | Status | Scope                                                                                                                  |
| ----- | ----------------------------------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| 00    | `phase-00-repo-foundation.md`             | 5 / 5 | ✅     | pnpm workspace, strict TS/ESLint/Prettier, husky/commitlint, CI from day one (CodeQL/Scorecard visibility-conditional) |
| 01    | `phase-01-database-library-link.md`       | 5 / 5 | ✅     | docker `postgres:17`, Prisma schema/migration/seed, `file:` library link + subpath probe                               |
| 02    | `phase-02-api-skeleton-wiring.md`         | 5 / 5 | ✅     | NestJS 11 skeleton, demo identity, `forRootAsync` wiring, e2e harness                                                  |
| 03    | `phase-03-repositories-ledger-pricing.md` | 6 / 6 | ✅     | Prisma repositories (both ports), pricing seed, ledger + pricing REST                                                  |
| 04    | `phase-04-mock-provider-commands.md`      | 6 / 6 | ✅     | `MockAiProvider` + failure injection, commands, embeddings, transaction guarantees                                     |
| 05    | `phase-05-quota-aggregations.md`          | 6 / 6 | ✅     | quota guard + estimators, credits/refund, usage aggregations, system jobs                                              |
| 06    | `phase-06-tenants-errors.md`              | 0 / 5 | 📋     | tenant isolation + required mode, full error catalog, module variants                                                  |
| 07    | `phase-07-web-skeleton-design.md`         | 0 / 5 | 📋     | Next.js 16 + shared design system + typed api client + switcher                                                        |
| 08    | `phase-08-dashboard-pages.md`             | 0 / 6 | 📋     | the eight dashboard pages                                                                                              |
| 09    | `phase-09-quality-docs-audit.md`          | 0 / 6 | 📋     | 100% coverage, full E2E, export audit, README, CI finalization                                                         |

**Status legend:** 📋 ToDo · 🔄 In Progress · 👀 Review · ✅ Done · ⛔ Blocked · 🟡 Partial

## Task-file anatomy

1. **Header**: `# Phase NN: Title` + blockquote (Status, Progress `0 / M`, Last updated, links to
   plan + spec sections).
2. **Context**: what the phase delivers; expected repo state at start.
3. **Rules-of-phase**: numbered invariants.
4. **Reference docs**: the only sections an executor should read.
5. **Task index**: `| ID | Task | Status | Priority | Size | Depends on |` (IDs `N.M`).
6. **Task blocks**: Description, Acceptance criteria (checkboxes), Files to create / modify, and a
   self-contained English **Agent prompt** in a four-backtick fence.
7. **Completion log**: append-only.

## Branch & PR workflow (mandatory, one PR per phase)

1. The FIRST task of each phase creates the branch: `git switch -c feat/phase-NN-<slug>` (never
   `git checkout -b`).
2. Every task commits with Conventional Commits: `<type>(scope): <subject> (N.M)`.
3. The LAST task of each phase (phase close) audits acceptance criteria, updates dashboards, opens
   the PR via `gh pr create`, requests the **GitHub Copilot code review**, addresses ALL findings,
   and merges only with CI green (`gh pr merge --squash --delete-branch`).
4. Never add `Co-Authored-By`, "Generated with", or any AI-attribution line to commits, PR titles,
   PR bodies, or comments.

## Execution guidance for agents

- **Token economy:** read only your task block + its REQUIRED READING (use offsets); never load
  whole specs.
- **Docs-first:** verify NestJS 11 / Prisma / Next.js 16 APIs against current official docs before
  coding; verify library surfaces against the library README/types, never from memory.
- **Sequential tests, bounded workers:** one suite at a time, `maxWorkers: '50%'`; never run api
  and web suites concurrently; never fan out parallel test agents.
- **Determinism:** no real AI keys, no network calls to providers; `MockAiProvider` only.
- **Self-update protocol (end of every task):** task block Status + checkboxes -> Task index row ->
  phase header progress -> [`DEVELOPMENT_PLAN.md` dashboard](../DEVELOPMENT_PLAN.md#progress-dashboard)
  row + overall counter -> this index -> Completion log entry -> Conventional commit.

## Project-wide constraints (every task)

- TypeScript strict, no `any`, no suppression comments; functions <= 50 lines, files <= 800.
- JSDoc with `@fileoverview` + `@layer` on every file; imperative JSDoc on exports.
- English-only, timeless comments (no phase/task references in committed code or config).
- Zod DTOs + JSDoc (no Swagger); no `.gitkeep`; no em dashes in code or docs.
- 100% coverage on everything implemented in the phase (both jest/vitest configs).
- `apps/web` imports only the `./shared` subpath of the library.
