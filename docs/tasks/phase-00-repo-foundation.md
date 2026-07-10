# Phase 00: Repository Foundation & CI

> **Status**: 👀 Review · **Progress**: 4 / 5 tasks · **Last updated**: 2026-07-10
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#per-phase-detail) §Phase 00
> **Source spec**: [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md) §23 (Tooling & Conventions), §6 (Repository Layout)

## Context

The repository contains only `docs/` on `main`. This phase produces a buildable pnpm workspace
with the full Bymax toolchain and, critically, a **CI pipeline that gates this very phase's PR**:
install, lint, typecheck and format run from the first commit, with test/build jobs joining as the
apps appear in later phases. CodeQL and OpenSSF Scorecard workflows are added now but guarded by a
repository-visibility condition, so the pipeline is public-ready while the repo stays private.

## Rules-of-phase

1. No application code in this phase; tooling and repo hygiene only.
2. Every config is real and enforced (no placeholder configs that a later phase "activates").
3. CI job names are contractual once merged; later phases extend jobs, never rename them.
4. The security workflows (CodeQL, Scorecard) must be inert on a private repo and require zero
   edits when the repo goes public.
5. No `.gitkeep`, no empty directories, no em dashes anywhere.

## Reference docs

- Spec §23 (tooling table), §6 (layout), §24 (CI security posture)
- Plan §2 Global Conventions
- Sibling reference: `nest-cache-example` root configs (same family conventions)

## Task index

| ID  | Task                                                                         | Status | Priority | Size | Depends on |
| --- | ---------------------------------------------------------------------------- | ------ | -------- | ---- | ---------- |
| 0.1 | Branch + workspace root (pnpm, tsconfig, scripts)                            | ✅     | P0       | S    | none       |
| 0.2 | Lint, format & hooks (ESLint flat, Prettier, husky, commitlint, lint-staged) | ✅     | P0       | S    | 0.1        |
| 0.3 | Repo hygiene files (LICENSE, README stub, CHANGELOG, renovate, editorconfig) | ✅     | P1       | S    | 0.1        |
| 0.4 | CI pipeline + conditional security workflows                                 | ✅     | P0       | M    | 0.2        |
| 0.5 | Phase close: audit, dashboards, PR + Copilot review                          | 👀     | P0       | S    | 0.1..0.4   |

---

## Task 0.1: Branch + workspace root

- **Status**: ✅ Done · **Priority**: P0 · **Size**: S · **Depends on**: none

#### Description

Create the phase branch and the pnpm workspace skeleton: root `package.json` (private, workspaces
`apps/*`, `packageManager` pin, `engines.node >=24`, scripts), `pnpm-workspace.yaml`, `.nvmrc`,
`tsconfig.base.json` (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`),
`.gitignore`.

#### Acceptance criteria

- [x] Branch `feat/phase-00-repo-foundation` created with `git switch -c`.
- [x] `package.json` root: `private: true`, workspaces `apps/*`, scripts `lint`, `typecheck`,
      `format`, `format:check`, `test`, `build`, `dev`, `infra:up/down/nuke` (infra scripts may
      no-op until phase 01 wires compose, but must exist and exit 0 with a clear message).
- [x] `tsconfig.base.json` strict flags exactly as spec §23; `pnpm typecheck` runs project-less
      and exits 0.
- [x] `.nvmrc` = `24`; `engines.node` = `>=24`.
- [x] `pnpm install` succeeds on a clean clone.

#### Files to create / modify

- `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `tsconfig.base.json`, `.gitignore`

#### Agent prompt

```
You are a senior TypeScript platform engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example, the canonical reference application for the
@bymax-one/nest-ai-tokens NestJS library (AI token ledger, pricing, quota). pnpm workspace,
TypeScript 5.9 strict, Node >= 24. Repo currently contains only docs/ on main.

CURRENT PHASE: 00 (Repository Foundation & CI), Task 0.1 of 5 (FIRST).

PRECONDITIONS
- main contains docs/ only; no package.json exists yet.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §23 (Tooling & Conventions) and §6 (Repository Layout)
- docs/DEVELOPMENT_PLAN.md §2 (Global Conventions)

TASK
Create the phase branch and the pnpm workspace root exactly as specified.

DELIVERABLES
1. Branch: `git switch -c feat/phase-00-repo-foundation` (NEVER `git checkout -b`).
2. `package.json` (root): private, workspaces ["apps/*"], packageManager pnpm pin, engines
   node >=24, scripts: lint, typecheck, format, format:check, test, build, dev, infra:up,
   infra:down, infra:nuke (infra scripts print "infra arrives in a later change" and exit 0).
3. `pnpm-workspace.yaml` with packages: ['apps/*'].
4. `.nvmrc` containing 24.
5. `tsconfig.base.json`: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes,
   verbatimModuleSyntax, ES2023 lib, NodeNext module/resolution.
6. `.gitignore` covering node_modules, dist, .next, coverage, .env, *.tsbuildinfo.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- TypeScript strict, no any, no suppression comments. English-only, timeless comments (no
  phase/task references in committed files). No .gitkeep. No em dashes in any file.

Verification:
- `pnpm install` exits 0 on a clean checkout.
- `git branch --show-current` prints feat/phase-00-repo-foundation.

Completion Protocol:
1. Set this task's Status to ✅ in its block and in the Task index.
2. Tick all acceptance checkboxes; bump the header Progress counter.
3. Update the Phase 00 row in docs/DEVELOPMENT_PLAN.md (dashboard) and docs/tasks/README.md.
4. Append `- 0.1 ✅ YYYY-MM-DD: <summary>` to the Completion log.
5. Commit: `chore(repo): scaffold pnpm workspace root (0.1)`.
```

---

## Task 0.2: Lint, format & hooks

- **Status**: ✅ Done · **Priority**: P0 · **Size**: S · **Depends on**: 0.1

#### Description

ESLint 9 flat config (`recommendedTypeChecked`, scoped to `*.ts`/`*.tsx`, test relaxations,
ignores), Prettier 3, husky (`pre-commit` -> lint-staged, `commit-msg` -> commitlint),
`commitlint.config.mjs` (conventional), `lint-staged.config.mjs`, `.gitmessage` with the repo
scopes (`repo`, `api`, `web`, `ci`, `docs`).

#### Acceptance criteria

- [x] `pnpm lint` and `pnpm format:check` exit 0.
- [x] A commit with message `bad message` is rejected by the commit-msg hook.
- [x] A staged `.ts` file with a lint error blocks the pre-commit hook.
- [x] Zero `eslint-disable` / `@ts-ignore` anywhere.

#### Files to create / modify

- `eslint.config.mjs`, `.prettierrc.mjs`, `commitlint.config.mjs`, `lint-staged.config.mjs`,
  `.husky/pre-commit`, `.husky/commit-msg`, `.gitmessage`

#### Agent prompt

```
You are a senior TypeScript platform engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example (reference app for @bymax-one/nest-ai-tokens). pnpm workspace,
TS 5.9 strict.

CURRENT PHASE: 00, Task 0.2 of 5 (MIDDLE).

PRECONDITIONS
- Task 0.1 merged into the phase branch: workspace root exists; you are on
  feat/phase-00-repo-foundation.

REQUIRED READING (only these)
- docs/DEVELOPMENT_PLAN.md §2 (Global Conventions)
- docs/TECHNICAL_SPECIFICATION.md §23

TASK
Wire lint, format, and local governance hooks.

DELIVERABLES
1. `eslint.config.mjs`: ESLint 9 flat config, typescript-eslint recommendedTypeChecked scoped to
   TS files, relaxed rules for *.spec.ts/*.test.ts, ignores (dist, .next, coverage, node_modules).
2. `.prettierrc.mjs`: printWidth 100, singleQuote, trailingComma all, semi false.
3. husky: `prepare: husky` script; .husky/pre-commit -> `pnpm exec lint-staged`;
   .husky/commit-msg -> `pnpm exec commitlint --edit "$1"`.
4. `commitlint.config.mjs` extending @commitlint/config-conventional.
5. `lint-staged.config.mjs`: eslint --fix + prettier --write on staged TS/MD/JSON.
6. `.gitmessage` documenting Conventional Commits with scopes repo/api/web/ci/docs.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Verify current ESLint 9 flat-config and typescript-eslint APIs against official docs before
  writing the config; do not write from memory.
- No suppression comments; English-only timeless comments; no em dashes.

Verification:
- `pnpm lint` exit 0; `pnpm format:check` exit 0.
- `echo "bad" | pnpm exec commitlint` exits non-zero.

Completion Protocol: same 5 steps as task 0.1 (status, checkboxes, dashboards, completion log,
Conventional commit `chore(repo): add lint, format and commit governance (0.2)`).
```

---

## Task 0.3: Repo hygiene files

- **Status**: ✅ Done · **Priority**: P1 · **Size**: S · **Depends on**: 0.1

#### Description

`LICENSE` (MIT, Bymax One), `README.md` stub (what this is, family links, docs links, quick-start
placeholder), `CHANGELOG.md` (Keep a Changelog header), `renovate.json` (weekend schedule, group
the `@bymax-one/nest-ai-tokens` dependency, pin GitHub Actions digests), `.editorconfig`.

#### Acceptance criteria

- [x] All five files exist with real content (no lorem/TODO bodies).
- [x] README names the library under test and links `docs/TECHNICAL_SPECIFICATION.md`,
      `docs/DEVELOPMENT_PLAN.md`, `docs/tasks/README.md`.
- [x] `renovate.json` validates against the Renovate schema (`$schema` set).

#### Files to create / modify

- `LICENSE`, `README.md`, `CHANGELOG.md`, `renovate.json`, `.editorconfig`

#### Agent prompt

```
You are a senior TypeScript platform engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example (reference app for @bymax-one/nest-ai-tokens).

CURRENT PHASE: 00, Task 0.3 of 5 (MIDDLE).

PRECONDITIONS
- Tasks 0.1-0.2 done on feat/phase-00-repo-foundation.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §1 (Purpose) and the header blockquote
- docs/DEVELOPMENT_PLAN.md §2 (Global Conventions)

TASK
Add the repository hygiene files.

DELIVERABLES
1. LICENSE: MIT, copyright Bymax One.
2. README.md stub: one-paragraph purpose (canonical reference app exercising every public feature
   of @bymax-one/nest-ai-tokens), family mention (nest-auth-example, nest-logger-example,
   nest-cache-example), links to the three docs, a "status: under construction, see the plan"
   note. Professional, public-grade English.
3. CHANGELOG.md: Keep a Changelog + SemVer header, Unreleased section.
4. renovate.json: $schema, config:recommended extends, weekend schedule, packageRules grouping
   @bymax-one/* (no automerge yet), GitHub Actions digest pinning.
5. .editorconfig: utf-8, lf, 2-space indent, final newline.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Public-grade: no internal project references, no local paths. No em dashes.

Verification:
- `pnpm lint` still exits 0 (markdown untouched by eslint config).

Completion Protocol: standard steps; commit `docs(repo): add license, readme stub and hygiene
files (0.3)`.
```

---

## Task 0.4: CI pipeline + conditional security workflows

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: 0.2

#### Description

`.github/workflows/ci.yml` gating every PR from now on: jobs `install`, `lint`, `typecheck`,
`format` (sequential needs-chain; `build`/`test`/`e2e` jobs are added by later phases when the
apps exist, extending this file without renaming jobs). `.github/workflows/codeql.yml` and
`scorecard.yml` guarded so they only run when the repository is public. `dependabot.yml` for
actions updates (Renovate handles npm).

#### Acceptance criteria

- [x] CI triggers on `pull_request` to `main` and on `push` to `main`.
- [x] Actions SHA-pinned; explicit least-privilege `permissions:` per workflow.
- [x] CodeQL/Scorecard jobs carry a visibility condition (skip cleanly while private) and a
      comment stating they activate when the repo goes public.
- [x] The phase PR itself runs install -> lint -> typecheck -> format green.

#### Files to create / modify

- `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/scorecard.yml`,
  `.github/dependabot.yml`

#### Agent prompt

```
You are a senior CI engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example (reference app for @bymax-one/nest-ai-tokens). pnpm, Node 24.

CURRENT PHASE: 00, Task 0.4 of 5 (MIDDLE).

PRECONDITIONS
- Tasks 0.1-0.3 done; lint/typecheck/format scripts work locally.

REQUIRED READING (only these)
- docs/DEVELOPMENT_PLAN.md §2 (CI row) and §0 principle 6
- docs/TECHNICAL_SPECIFICATION.md §23 (CI paragraph), §24 (Security)

TASK
Create the CI pipeline that gates every PR from this phase onward, plus visibility-conditional
security workflows.

DELIVERABLES
1. .github/workflows/ci.yml: on pull_request + push(main); pnpm/action-setup + setup-node@v4
   (node-version 24, cache pnpm); jobs install -> lint -> typecheck -> format as a needs-chain;
   `pnpm install --frozen-lockfile`. Job names are contractual: install, lint, typecheck, format
   (later phases append build, test, e2e; never rename).
2. .github/workflows/codeql.yml: standard JS/TS CodeQL analysis, but every job guarded with
   `if: github.event.repository.private == false` plus a one-line comment: activates when the
   repository becomes public.
3. .github/workflows/scorecard.yml: OpenSSF Scorecard with the same visibility guard and comment.
4. .github/dependabot.yml: weekly github-actions updates.
All actions pinned to full commit SHAs; each workflow has an explicit least-privilege
`permissions:` block.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Verify current action versions/SHAs and CodeQL/Scorecard workflow shapes against official docs
  before writing; do not write from memory. No em dashes; timeless comments only.

Verification:
- `gh workflow list` shows the three workflows after push.
- Push the branch and confirm ci.yml runs green on the PR (opened in task 0.5, so here:
  `act`-style dry validation is not required; YAML must pass `gh workflow view` parse after push).

Completion Protocol: standard steps; commit `ci(repo): add gating pipeline and conditional
security workflows (0.4)`.
```

---

## Task 0.5: Phase close: audit, dashboards, PR + Copilot review

- **Status**: 👀 Review · **Priority**: P0 · **Size**: S · **Depends on**: 0.1..0.4

#### Description

Audit every acceptance criterion of the phase, update all dashboards, open the phase PR, request
the GitHub Copilot code review, address every finding, and merge with CI green.

Opening the PR and requesting the review is executed here; addressing findings, waiting for CI,
and the squash merge are carried out in a follow-up pass once the review lands.

#### Acceptance criteria

- [x] All 0.1..0.4 acceptance boxes verified ticked against the real tree (not narration).
- [x] Phase file header, plan dashboard and tasks README rows updated to reflect the open PR.
- [ ] PR opened with a professional English title/body; Copilot review requested; all findings
      addressed (every severity); CI green; squash-merged with branch deleted.

#### Files to create / modify

- `docs/tasks/phase-00-repo-foundation.md`, `docs/DEVELOPMENT_PLAN.md`, `docs/tasks/README.md`

#### Agent prompt

```
You are the phase-close auditor for nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 00, Task 0.5 of 5 (LAST, phase close).

PRECONDITIONS
- Tasks 0.1-0.4 report done on feat/phase-00-repo-foundation.

REQUIRED READING (only these)
- This phase file (all acceptance criteria)
- docs/DEVELOPMENT_PLAN.md Progress Dashboard + Update Protocol

TASK
Close Phase 00 with an audited, reviewed, merged PR.

DELIVERABLES
1. Re-run locally: `pnpm install && pnpm lint && pnpm typecheck && pnpm format:check` (all 0).
2. Verify each 0.1..0.4 acceptance criterion against the working tree; fix or reopen tasks on
   any miss.
3. Update: this file's header (Status ✅, Progress 5/5) + Task index + Completion log; the plan
   dashboard row + overall counter; the tasks README row.
4. `gh pr create` with title `feat(repo): phase 00, repository foundation and CI` and a body
   summarizing deliverables and verification results.
5. Request the GitHub Copilot code review on the PR (via the GitHub UI or
   `gh pr edit --add-reviewer copilot-pull-request-reviewer[bot]`); wait for it; address EVERY
   finding (all severities) with real commits; re-request as needed.
6. Merge only when CI is green and the review is resolved:
   `gh pr merge --squash --delete-branch`. Verify the branch is gone locally and remotely.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Verify state via git/gh output, never via memory of earlier steps.

Verification:
- `gh pr view --json state` shows MERGED; `git ls-remote --heads origin feat/phase-00-repo-foundation`
  prints nothing; CI green on main.

Completion Protocol: append `- 0.5 ✅ YYYY-MM-DD: phase merged in PR #<n>` to the Completion log
(commit lands on main via a docs commit if needed: `docs(plan): mark phase 00 complete`).
```

---

## Completion log

<!-- append: - <id> ✅ YYYY-MM-DD: <one-line summary> -->

- 0.1 ✅ 2026-07-10: pnpm workspace root scaffolded (package.json, pnpm-workspace.yaml, .nvmrc, strict tsconfig.base.json, .gitignore); `pnpm install` and `pnpm typecheck` green.
- 0.2 ✅ 2026-07-10: ESLint 9 flat config + Prettier 3 + husky (pre-commit/commit-msg) + commitlint + lint-staged wired; commit-msg hook proven to reject a non-conventional message, pre-commit hook proven to block a broken staged file.
- 0.3 ✅ 2026-07-10: LICENSE (MIT), README stub, CHANGELOG (Keep a Changelog), renovate.json, .editorconfig added.
- 0.4 ✅ 2026-07-10: `ci.yml` (install -> lint -> typecheck -> format needs-chain, SHA-pinned actions), `codeql.yml` and `scorecard.yml` (visibility-guarded), `dependabot.yml` (github-actions weekly) added.
- 0.5 👀 2026-07-10: acceptance criteria audited against the working tree, dashboards updated, PR opened and Copilot review requested; addressing findings and the squash merge follow in a subsequent pass.
