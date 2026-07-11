# Phase 09: Quality, Docs & Export Audit

> **Status**: 🔄 In Progress · **Progress**: 1 / 6 tasks · **Last updated**: 2026-07-10
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#per-phase-detail) §Phase 09
> **Source spec**: [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md) §22 (Testing Strategy), §7 (matrix enforcement), §23 (CI), Appendix rows

> **Reconciliation (2026-07-10):** the real repo state after phases 00-08 supersedes several
> drafted assumptions here (same rule as the phase 01-08 notes). Mappings applied:
>
> - **Coverage baseline.** Both suites already sit at 100% on all four metrics (api 424 unit
>   tests, web 305 tests); tasks 9.1/9.2 verify and KEEP that bar through this phase's changes
>   rather than "raise" it. The prompt-less quota-lab crash the phase 08 sweep documented is NOT
>   reproducible on the current api: `labRunBodySchema` defaults the missing prompt
>   (`DEFAULT_LAB_PROMPT`) and the global `ZodValidationPipe` rejects a missing or malformed body
>   with the canonical value-free 400, so `{}` answers 200 deterministically and nothing reaches
>   the provider with `undefined` content (verified live against a Testcontainers boot). Task 9.1
>   therefore locks the contract with regression e2e cases instead of changing api code, and 9.2
>   removes the now-unnecessary web-side always-send-a-prompt workaround.
> - **E2E consolidation (9.3).** The route inventory asserts against the REAL controller surface
>   (the phase 07 note's module map), not the drafted spec §11 table; the error-code summary
>   asserts the REAL reachable catalog (the phase 06 note: 15 library codes, of which 13 are
>   runtime-reachable plus 2 boot/reserved, and the 11 host `ApiException` codes), not the drafted
>   "24 dot-namespaced codes". The drafted Playwright web smoke maps to the EXISTING
>   `pnpm --filter web run test:integration` suite plus the phase 08 live §13 scenario sweep; no
>   Playwright dependency is added and the reusable CI's `run-e2e-web` stays `false` (the
>   `web-build` job plus the integration suite are the web gates).
> - **Export audit (9.4).** The audited truth is the library dist (`package.json` exports map +
>   d.ts named exports for `.` and `./shared`), never the drafted spec lists; spec §7 matrix rows
>   citing drafted names are updated to the shipped surface in the same commit. The CI switch is
>   the reusable caller input `run-export-audit: true` (verified against
>   `bymaxone/.github/.github/workflows/node-ci.yml`), driving the conventional root
>   `pnpm audit:exports` script.
> - **README (9.5).** The quick start is honest about link mode: the library resolves via
>   `file:../../../nest-ai-tokens` and needs the sibling checkout built first. Screenshots are
>   out of scope for this phase (no headless capture pipeline); the §13 walkthrough is
>   command-driven with curl examples instead.
> - **Phase close (9.6).** Executed up to opening the PR and requesting the Copilot review; the
>   merge, branch deletion, and the final "plan complete" flip are owned by the orchestrating
>   session, per the recorded operating mode in `docs/AUTOPILOT.md`.

## Context

The reference-grade close. Feature work is done (phases 00-08); this phase raises everything to
the family bar: 100% unit coverage on both apps, an E2E consolidation that walks every route,
error code, guard path, and module variant, the export-audit script that keeps the coverage
matrix honest forever, the publishable README, and the final acceptance audit.

> **Completion Protocol ("standard steps"):** task Status ✅ (block + index) -> checkboxes ->
> header Progress -> plan dashboard row + overall counter -> tasks README -> Completion log entry
> -> Conventional commit.

## Rules-of-phase

1. Coverage is raised by writing missing tests, never by excluding files or lowering thresholds.
2. The export audit diffs the library's REAL exports (from its d.ts/package exports) against the
   spec §7 matrix; a new undemonstrated export must fail CI.
3. README is public-grade: badges, quick start, scenarios, honest boundaries; no internal
   references.
4. Suites run one at a time with bounded workers; the full local gate replay is sequential.
5. Any matrix row that cannot be honestly ✅ becomes ⛔ with a written reason (no silent gaps).

## Reference docs

- Spec §22, §7, §23-25; plan Appendix A
- Sibling READMEs (`nest-cache-example`, `nest-logger-example`) for structure parity

## Task index

| ID  | Task                                                      | Status | Priority | Size | Depends on |
| --- | --------------------------------------------------------- | ------ | -------- | ---- | ---------- |
| 9.1 | Branch + api unit coverage to 100% (all four metrics)     | ✅     | P0       | L    | none       |
| 9.2 | Web unit coverage to 100% (`lib/**` + components)         | 📋     | P0       | M    | none       |
| 9.3 | E2E consolidation: every route, code, guard path, variant | 📋     | P0       | L    | 9.1        |
| 9.4 | Export-audit script + CI gate                             | 📋     | P0       | M    | 9.1        |
| 9.5 | README + CHANGELOG + docs polish                          | 📋     | P0       | M    | 9.3, 9.4   |
| 9.6 | Phase close: final acceptance audit, PR + Copilot review  | 📋     | P0       | M    | 9.1..9.5   |

---

## Task 9.1: Branch + api unit coverage to 100%

- **Status**: ✅ Done · **Priority**: P0 · **Size**: L · **Depends on**: none

#### Description

Run the api coverage report, enumerate every uncovered line/branch/function, and write the
missing unit tests (repositories edge branches, config permutations, error mapping, identity
edge cases). Thresholds already sit at 100%; this task makes them pass with zero exclusions.

#### Acceptance criteria

- [x] Branch `feat/phase-09-quality-docs-audit` created with `git switch -c`.
- [x] `pnpm --filter api test:cov` passes at 100/100/100/100 with no `coveragePathIgnorePatterns`
      additions and no istanbul-ignore comments (424 tests; the baseline already held, verified).
- [x] Every new `it()` carries a scenario comment naming the branch it kills.
- [x] Reconciled extra: the prompt-less quota-lab contract is locked by four regression e2e cases
      in `quota-lab.e2e-spec.ts` (`{}` answers 200 via DTO defaults; body-less and wrong-typed
      bodies answer the canonical value-free 400 and never settle a charge).

#### Files to create / modify

- `apps/api/src/**/*.spec.ts` (additions only)

#### Agent prompt

```
You are a senior NestJS testing engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example, reference app for @bymax-one/nest-ai-tokens. CURRENT PHASE: 09,
Task 9.1 of 6 (FIRST).

PRECONDITIONS
- Phases 00-08 merged; thresholds are 100% and currently failing or barely passing.

REQUIRED READING (only these)
- docs/DEVELOPMENT_PLAN.md Appendix A
- The coverage report you generate (that IS the worklist)

TASK
Create the phase branch and close every api coverage gap honestly.

DELIVERABLES
1. Branch: `git switch -c feat/phase-09-quality-docs-audit` (NEVER checkout -b).
2. Run `pnpm --filter api test:cov`; collect the uncovered map; write targeted unit tests until
   all four metrics are 100%. Typical gaps: repository error branches, Decimal mapping edges,
   config factory permutations, identity middleware branches, errors-demo registry misses,
   guard boundary conditions.
3. FORBIDDEN: threshold lowering, path exclusion, istanbul-ignore, deleting code to avoid
   coverage. If a line is truly unreachable, refactor it away in a dedicated commit with
   justification.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- maxWorkers '50%'; one suite at a time; commented it(); no em dashes.

Verification:
- `pnpm --filter api test:cov` prints 100% on statements, branches, functions, lines and exits 0.

Completion Protocol: standard steps; commit `test(api): close unit coverage to 100 percent
(9.1)`.
```

---

## Task 9.2: Web unit coverage to 100%

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: none

#### Description

Same discipline for `apps/web`: `lib/**` at 100% on all metrics, components covered for every
state (loading/empty/error/success) and interaction (filters, forms, switcher).

#### Acceptance criteria

- [ ] `pnpm --filter web test:cov` passes thresholds with zero exclusions added.
- [ ] Interaction paths (refund confirm, top-up submit, granularity switch, failure helper) all
      exercised.

#### Files to create / modify

- `apps/web/src/**/*.test.tsx` (additions only)

#### Agent prompt

```
You are a senior React testing engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 09, Task 9.2 of 6 (MIDDLE).

PRECONDITIONS
- Phase 08 merged; Vitest thresholds set in phase 07.

REQUIRED READING (only these)
- docs/DEVELOPMENT_PLAN.md Appendix A
- The Vitest coverage report you generate

TASK
Close every web coverage gap honestly.

DELIVERABLES
1. Run `pnpm --filter web test:cov`; write the missing tests for lib/** (client branches,
   identity store, error narrowing) and components (all states + interactions listed in the
   acceptance criteria).
2. FORBIDDEN: threshold lowering, exclusions, ignore comments.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Testing Library idioms (roles/labels, no test-ids where a role exists); commented it(); no em
  dashes; bounded workers.

Verification:
- `pnpm --filter web test:cov` passes thresholds and exits 0.

Completion Protocol: standard steps; commit `test(web): close unit coverage to thresholds (9.2)`.
```

---

## Task 9.3: E2E consolidation

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: L · **Depends on**: 9.1

#### Description

One consolidated inventory spec that walks EVERY documented surface: all §11 routes (success +
main failure), all 24 error codes (cross-referencing the phase 06 suites), every guard path,
every module variant, tenant isolation, seed idempotency; plus the Playwright web smoke (shell +
one live command round-trip). The inventory asserts against a checklist constant so a missing
route is a test failure, not an oversight.

#### Acceptance criteria

- [ ] `apps/api/test/e2e/inventory.e2e-spec.ts` walks a `ROUTE_INVENTORY` constant derived from
      spec §11; any route without a test entry fails the spec.
- [ ] A summary assertion proves 24/24 error codes exercised across the e2e suites.
- [ ] Playwright smoke: boot web against live api, switch user, run one translate, see the ledger
      row appear.
- [ ] Full `pnpm --filter api test:e2e` + web smoke green sequentially.

#### Files to create / modify

- `apps/api/test/e2e/inventory.e2e-spec.ts`, `apps/web/e2e/**` (Playwright), CI e2e extension

#### Agent prompt

```
You are a senior E2E engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 09, Task 9.3 of 6 (MIDDLE).

PRECONDITIONS
- Task 9.1 done; all feature e2e suites from phases 02-06 green.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §11 (route catalogue), §22
- The existing e2e suites (titles only, for cross-reference)

TASK
Consolidate the exhaustive E2E inventory and the web smoke.

DELIVERABLES
1. inventory.e2e-spec.ts: a ROUTE_INVENTORY constant listing every §11 route with { method,
   path, happyStatus, failureCase }; a table-driven walk hitting each (reusing seeds/markers);
   a completeness assertion comparing the inventory against the spec §11 table length; a
   24/24 error-code summary assertion.
2. Playwright setup in apps/web/e2e: one journey (load shell, pick ada, translate 'hello world',
   assert result panel + new ledger row via the UI). Script `pnpm --filter web test:e2e` with the
   api URL configurable.
3. CI: append the web smoke as the final job (needs api e2e; boots both apps against the service
   Postgres).

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Verify current Playwright APIs against docs. Sequential suites; bounded workers; no em dashes.

Verification:
- `pnpm --filter api test:e2e` then `pnpm --filter web test:e2e` green sequentially; CI green.

Completion Protocol: standard steps; commit `test(e2e): exhaustive inventory and web smoke
(9.3)`.
```

---

## Task 9.4: Export-audit script + CI gate

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 9.1

#### Description

`scripts/audit-library-exports.mjs`: reads the library's actual export names (parsing its
package `exports` + d.ts named exports for both subpaths), reads the spec §7 matrix rows, and
fails if any real export is neither demonstrated (grep across `apps/`) nor ⛔-justified in the
matrix. Wired as `pnpm audit:exports` + a CI step.

#### Acceptance criteria

- [ ] The script is zero-dep Node ESM; deterministic output table (export, status, evidence path).
- [ ] Mutating the matrix (removing a row) makes the script fail (proven by a unit test of the
      script itself).
- [ ] CI runs it after the build; currently green.

#### Files to create / modify

- `scripts/audit-library-exports.mjs`, `package.json`, `.github/workflows/ci.yml`, script test

#### Agent prompt

```
You are a senior Node tooling engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 09, Task 9.4 of 6 (MIDDLE).

PRECONDITIONS
- Task 9.1 done. Library installed via file: link with dist + d.ts present.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §7 (matrix format and the CI-enforceable rule)

TASK
Build the export audit that keeps the coverage matrix honest.

DELIVERABLES
1. scripts/audit-library-exports.mjs (zero-dep, Node ESM):
   - Resolve the library package dir; enumerate named exports of '.' and './shared' (parse the
     d.ts export statements; a pragmatic regex over `export { ... }` and `export type { ... }`
     blocks is acceptable and must be commented).
   - Parse docs/TECHNICAL_SPECIFICATION.md §7 tables: collect the `Library surface` cells and the
     ⛔ rows.
   - For each real export: demonstrated if its name appears in apps/**/*.ts(x) (grep) OR matched
     by a matrix row; ⛔ rows require the reason cell to be non-empty.
   - Print a table (export, subpath, status, evidence); exit 1 listing misses.
2. `pnpm audit:exports` script + CI step after build.
3. A Jest/Vitest-free self-test: a small node:test spec running the script against a fixture
   with a deliberately missing export and asserting exit 1.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Zero third-party deps in the script (supply-chain rule); no em dashes.

Verification:
- `pnpm audit:exports` exits 0 today; the fixture self-test proves the failure mode.

Completion Protocol: standard steps; commit `feat(tooling): library export audit gate (9.4)`.
```

---

## Task 9.5: README + CHANGELOG + docs polish

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 9.3, 9.4

#### Description

The publishable README: badges (CI, license, family), what/why, architecture sketch, quick start
(5 commands), the eight scenarios with screenshots, the coverage-matrix pointer, honest
boundaries (mock provider, no billing, no auth, no streaming), curl walkthrough, troubleshooting.
CHANGELOG entry; final consistency pass across the three docs (statuses, counts, links).

#### Acceptance criteria

- [ ] README structure matches the family (compare against `nest-cache-example`); public-grade,
      zero internal references, zero em dashes.
- [ ] Quick start verified verbatim on a clean clone (commands copy-paste green).
- [ ] All doc cross-links resolve; dashboard counts consistent across plan/tasks/README.

#### Files to create / modify

- `README.md`, `CHANGELOG.md`, `docs/*` consistency touch-ups

#### Agent prompt

```
You are a senior technical writer-engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 09, Task 9.5 of 6 (MIDDLE).

PRECONDITIONS
- Tasks 9.3-9.4 done: everything green and audited.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §1-2, §13, §25
- The sibling nest-cache-example README (structure reference)

TASK
Write the publishable README and close the docs.

DELIVERABLES
1. README.md: badges (CI workflow, MIT, reference-app family); one-paragraph pitch; architecture
   ASCII (from spec §3, compact); Quick start (pnpm install, infra:up, prisma migrate+seed, dev,
   open localhost:3000); "What's inside" table mapping the eight pages to library capabilities;
   the eight scenarios each with one screenshot; honest-boundaries section; curl walkthrough
   (translate -> ledger -> 402 -> top-up); troubleshooting (Docker, ports, link mode);
   contribution note pointing to docs/DEVELOPMENT_PLAN.md.
2. Screenshots captured into docs/assets/ (shell, playground result, 402 envelope, pricing
   timeline).
3. CHANGELOG.md: 0.1.0 entry summarizing the delivered surface.
4. Consistency pass: statuses/counts/links across TECHNICAL_SPECIFICATION.md,
   DEVELOPMENT_PLAN.md, docs/tasks/README.md.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Public-grade English; no internal/private references; no em dashes anywhere.

Verification:
- Quick start replayed verbatim on a clean clone: green.
- A markdown link checker (or manual pass) finds zero dead links.

Completion Protocol: standard steps; commit `docs(repo): publishable readme and changelog (9.5)`.
```

---

## Task 9.6: Phase close: final acceptance audit, PR + Copilot review

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 9.1..9.5

#### Description

The repo-level acceptance audit: replay every Appendix A gate from a clean clone, sweep the §7
matrix end to end (90 rows: ✅ with evidence or ⛔ with reason), verify the CI security workflows
still carry the visibility condition, then the final PR
`feat(repo): phase 09, quality, docs and export audit`, Copilot review, squash-merge, log, and
flip the plan to complete.

#### Acceptance criteria

- [ ] Appendix A table replayed green from a clean clone (evidence per gate in the PR body).
- [ ] §7 sweep: 90/90 rows resolved (✅/⛔+reason); export audit green.
- [ ] Plan dashboard: 10/10 phases ✅, overall 55/55; PR merged; branch gone.

#### Agent prompt

```
You are the final acceptance auditor for nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 09, Task 9.6 of 6 (LAST, phase close and project
close).

PRECONDITIONS: tasks 9.1-9.5 report done on feat/phase-09-quality-docs-audit.
REQUIRED READING (only these): docs/DEVELOPMENT_PLAN.md Appendix A + dashboard;
docs/TECHNICAL_SPECIFICATION.md §7.

TASK: run the final acceptance audit and close the project plan.

DELIVERABLES
1. From a CLEAN clone (fresh directory): replay Appendix A sequentially: install, lint,
   format:check, typecheck, api test:cov (100%), web test:cov, api test:e2e, web test:e2e,
   audit:exports, builds. Record evidence per gate.
2. Matrix sweep: walk spec §7 rows 1-90; confirm each ✅ has code + test evidence (spot-check by
   grep) and each ⛔ has a reason.
3. Confirm codeql/scorecard workflows still carry the visibility condition (repo stays private
   until the owner flips it; zero pipeline edits will be needed).
4. Sync all dashboards to complete (plan 10/10 + 55/55; tasks README; this file).
5. gh pr create title `feat(repo): phase 09, quality, docs and export audit` with the evidence
   tables in the body; request the GitHub Copilot code review; address EVERY finding; merge with
   CI green: gh pr merge --squash --delete-branch; verify branch removal.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Evidence over narration: every claim in the PR body cites a command output or file path.

Verification: PR MERGED; CI green on main; plan reads 100%.

Completion Protocol: append `- 9.6 ✅ YYYY-MM-DD: project plan complete in PR #<n>`; commit
`docs(plan): mark phase 09 and the plan complete`.
```

---

## Completion log

<!-- append: - <id> ✅ YYYY-MM-DD: <one-line summary> -->

- 9.1 ✅ 2026-07-10: api coverage verified at 100/100/100/100 (424 tests); prompt-less quota-lab
  contract locked with four regression e2e cases (14 e2e in the lab suite).
