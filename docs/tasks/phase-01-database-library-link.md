# Phase 01: Postgres, Prisma & Library Link

> **Status**: 🔄 In Progress · **Progress**: 3 / 5 tasks · **Last updated**: 2026-07-10
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#per-phase-detail) §Phase 01
> **Source spec**: [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md) §16 (Prisma Repositories), §21 (Local Stack), §8 (Library Consumption)

## Context

Phase 00 delivered the tooling and CI. This phase gives the project its two external foundations:
the Postgres data layer (docker compose, Prisma schema mirroring the library's reference models,
migration, deterministic seed) and the library dependency itself, linked via `file:` until the
package is published, with a probe script proving both subpaths resolve. No NestJS app yet.

> **Reconciliation (2026-07-10):** the shipped library v0.1.0 supersedes the shapes drafted here
> and in spec §16. The reference schema is the seven-model fragment shipped at
> `dist/prisma/schema.prisma.fragment` (BigInt nano-USD money, `tenantId` on every table, two
> PostgreSQL partial indexes in the shipped SQL), and the public export names differ from the
> draft. Tasks were executed against the shipped dist/types (the source of truth); acceptance
> criteria below were aligned in the same commits.

> **Completion Protocol (referenced by every task below as "standard steps"):** set the task's
> Status ✅ in its block and the Task index; tick its acceptance checkboxes; bump the header
> Progress counter; update the Phase 01 row in `docs/DEVELOPMENT_PLAN.md` (and overall counter) and
> `docs/tasks/README.md`; append `- <id> ✅ YYYY-MM-DD: <summary>` to the Completion log; commit
> with the stated Conventional message.

## Rules-of-phase

1. Prisma models replicate the library's reference schema exactly: a verbatim copy of the shipped
   `dist/prisma/schema.prisma.fragment` (seven models, BigInt nano-USD money, `Decimal(10,4)`
   markup multiplier, `Json?` metadata columns, every documented index plus the two PostgreSQL
   partial indexes from the shipped `migrations/0001_init.sql`); no extra opinion.
2. The seed is deterministic (stable ids, stable dates) so charts and tests assert exact values.
3. The library is consumed as an external package (`file:../../../nest-ai-tokens`), never copied,
   never a workspace member.
4. `openai` is NOT installed (the example proves the optional-peer claim).
5. Suites run with bounded workers; no parallel package suites.

## Reference docs

- Spec §16, §21, §8.1-8.2, §9.1 (env table)
- Library reference schemas: `TokenTransaction` §5.1.1 and `ModelPricing` §5.3.1 of the library's
  technical specification (mirrored in spec §16)

## Task index

| ID  | Task                                                                | Status | Priority | Size | Depends on |
| --- | ------------------------------------------------------------------- | ------ | -------- | ---- | ---------- |
| 1.1 | Branch + docker compose Postgres + infra scripts                    | ✅     | P0       | S    | none       |
| 1.2 | `apps/api` package init + Prisma schema + first migration           | ✅     | P0       | M    | 1.1        |
| 1.3 | Deterministic seed (users, tenants, allocations, historical debits) | ✅     | P0       | M    | 1.2        |
| 1.4 | Library `file:` link + dual-subpath probe script (CI job)           | 📋     | P0       | S    | 1.2        |
| 1.5 | Phase close: audit, dashboards, PR + Copilot review                 | 📋     | P0       | S    | 1.1..1.4   |

---

## Task 1.1: Branch + docker compose Postgres + infra scripts

- **Status**: ✅ Done · **Priority**: P0 · **Size**: S · **Depends on**: none

#### Description

`docker-compose.yml` with `postgres:17-alpine` (healthcheck, named volume, port 5432, database
`ai_tokens_example`), `.env.example` starting the spec §9.1 registry, and real `infra:up/down/nuke`
scripts replacing the phase 00 stubs.

#### Acceptance criteria

- [x] Branch `feat/phase-01-database-library-link` created with `git switch -c`.
- [x] `pnpm infra:up` waits for the healthcheck; `infra:nuke` removes the volume.
- [x] `.env.example` documents `DATABASE_URL` and `PORT` (more rows join in later phases).
- [x] No credentials beyond local-only `postgres/postgres` defaults.

#### Files to create / modify

- `docker-compose.yml`, `.env.example`, `package.json` (infra scripts)

#### Agent prompt

```
You are a senior platform engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example, reference app for @bymax-one/nest-ai-tokens. pnpm workspace,
Node 24, CI from phase 00.

CURRENT PHASE: 01, Task 1.1 of 5 (FIRST).

PRECONDITIONS
- Phase 00 merged: tooling + CI on main.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §21 (Local Stack & Docker) and §9.1 (env table)

TASK
Create the phase branch, the Postgres compose stack, and real infra scripts.

DELIVERABLES
1. Branch: `git switch -c feat/phase-01-database-library-link` (NEVER `git checkout -b`).
2. docker-compose.yml: service `postgres` (image postgres:17-alpine pinned by digest or minor),
   env POSTGRES_DB=ai_tokens_example POSTGRES_USER=postgres POSTGRES_PASSWORD=postgres, port
   5432:5432, named volume, healthcheck pg_isready, restart unless-stopped.
3. .env.example: DATABASE_URL and PORT rows with one-line comments.
4. Root scripts: infra:up = `docker compose up -d --wait`; infra:down = `docker compose down`;
   infra:nuke = `docker compose down -v`.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Local-only credentials; no secrets. Timeless English comments; no em dashes; no .gitkeep.

Verification:
- `pnpm infra:up` exits 0 with a healthy container; `docker compose ps` shows healthy.
- `pnpm infra:nuke` removes the volume.

Completion Protocol: standard steps; commit `feat(api): add postgres compose stack and infra
scripts (1.1)`.
```

---

## Task 1.2: `apps/api` package init + Prisma schema + first migration

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: 1.1

#### Description

Initialize `apps/api` (package.json, tsconfig extending the base) with Prisma: schema containing
`AiTokenTransaction` and `ModelPricing` exactly as the library documents (field names, types,
indexes, `@@map` table names), the first migration, and `prisma:*` scripts.

#### Acceptance criteria

- [x] `apps/api/prisma/schema/ai-tokens.prisma` is a verbatim copy of the library's shipped
      `dist/prisma/schema.prisma.fragment` (all seven models, field for field, every index).
- [x] `pnpm --filter api run prisma:migrate:dev` creates the tables against the compose Postgres,
      including the two partial indexes from the shipped `migrations/0001_init.sql`.
- [x] Money columns are `BigInt` nano-USD; `markupMultiplier` is `Decimal @db.Decimal(10, 4)`;
      `extraUnits`/`unitRates`/`softThresholds` are the documented `Json` columns.
- [x] `pnpm typecheck` green with the generated client.

#### Files to create / modify

- `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/prisma/schema.prisma`,
  `apps/api/prisma/migrations/**`

#### Agent prompt

```
You are a senior NestJS/Prisma engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example, reference app for @bymax-one/nest-ai-tokens. The library is
ORM-agnostic; this app provides the reference Prisma implementation.

CURRENT PHASE: 01, Task 1.2 of 5 (MIDDLE).

PRECONDITIONS
- Task 1.1 done: compose Postgres healthy on localhost:5432.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §16 (Persistence)
- The library's reference schemas (its technical_specification §5.1.1 and §5.3.1); if the local
  library checkout is unavailable, use the shapes replicated in spec §16 and verify against the
  published README.

TASK
Initialize apps/api with the Prisma layer.

DELIVERABLES
1. apps/api/package.json: name api, private, scripts (build, dev, test, test:cov, test:e2e,
   prisma:generate, prisma:migrate:dev, prisma:seed placeholder), deps @prisma/client + prisma
   (dev). No NestJS yet (phase 02).
2. apps/api/tsconfig.json extending ../../tsconfig.base.json.
3. prisma/schema.prisma: datasource postgres via env DATABASE_URL; generator client; model
   AiTokenTransaction (id uuid pk, userId, tenantId?, subscriptionId?, amount Int, type String,
   description?, metadata Json?, createdAt now) with @@index on userId, tenantId, subscriptionId,
   type, createdAt, [userId, createdAt] and @@map("ai_token_transactions"); model ModelPricing
   (id uuid pk, model, inputPrice Decimal(10,6), outputPrice Decimal(10,6)?, effectiveFrom now,
   effectiveTo?, createdAt, updatedAt @updatedAt) with @@index on model, effectiveFrom,
   effectiveTo, [model, effectiveFrom] and @@map("model_pricing").
4. First migration committed.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Verify current Prisma schema syntax against official docs before writing. Strict TS; no any;
  timeless comments; no em dashes.

Verification:
- `pnpm --filter api prisma:migrate:dev` exits 0; `psql`-level table check optional.
- `pnpm typecheck` exits 0.

Completion Protocol: standard steps; commit `feat(api): add prisma schema and first migration
(1.2)`.
```

---

## Task 1.3: Deterministic seed

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: 1.2

#### Description

`prisma/seed.ts` creating: demo users `ada`, `grace`, `linus` across tenants `acme`/`globex` (+ a
global null-tenant admin `root`); `monthly_allocation` and `trial_allocation` credits; a spread of
historical `generation`/`embedding_generation` debits across the last 90 days (stable dates,
stable amounts, realistic metadata with `model`, `tokensUsed`, `estimatedCost`, `resourceId`) so
usage charts and top-consumer boards have meaningful shapes from first boot.

#### Acceptance criteria

- [x] `pnpm --filter api run prisma:seed` is idempotent (re-run produces no duplicates; stable ids
      plus a deleteMany-first strategy documented in the writer's header comment).
- [x] Both tenants have distinct, non-overlapping data; tenant-scoped system-cost rows exist too
      (the shipped schema requires `tenantId` on every row, superseding the drafted null-tenant
      admin user).
- [x] Every seeded row typechecks against the generated `Prisma.*CreateManyInput` shapes with the
      documented model/token/cost fields (`provider`, `model`, `operation`, token counts,
      nano-USD costs, `markupMultiplier`, `idempotencyKey`, `payloadHash`).
- [x] A unit test asserts seed counts and a known balance per user.

#### Files to create / modify

- `apps/api/prisma/seed.ts`, `apps/api/package.json` (prisma.seed), a seed unit test

#### Agent prompt

```
You are a senior NestJS/Prisma engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 01, Task 1.3 of 5 (MIDDLE).

PRECONDITIONS
- Task 1.2 done: schema + migration exist; Postgres healthy.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §16 (seed paragraph), §9.1 (DEMO_SEED_USERS), §18 (tenants)

TASK
Write the deterministic demo seed.

DELIVERABLES
1. prisma/seed.ts: users ada (acme), grace (acme), linus (globex), root (tenant null); per user
   one monthly_allocation (50_000) + ada also trial_allocation (10_000); 60-90 historical debits
   spread deterministically over the last 90 days (seeded PRNG or fixed table, stable dates
   relative to a SEED_EPOCH constant), types generation and embedding_generation, negative Int
   amounts, metadata { model, tokensUsed, promptTokens?, completionTokens?, estimatedCost,
   resourceId: 'doc-<n>' }; a couple of isSystemCost rows (systemCostCategory 'reindex').
2. Wire "prisma": { "seed": "tsx prisma/seed.ts" } (add tsx as devDep) and script prisma:seed.
3. A Jest unit test (apps/api/test or src) asserting: row counts, ada's expected balance
   (credits + debits sum), tenant separation (no acme row with tenantId globex).

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Determinism is the point: no Date.now()-relative randomness without a fixed epoch. Strict TS;
  timeless comments; no em dashes. Jest maxWorkers '50%'.

Verification:
- `pnpm --filter api prisma:seed` twice: second run leaves counts unchanged.
- `pnpm --filter api test` green.

Completion Protocol: standard steps; commit `feat(api): add deterministic demo seed (1.3)`.
```

---

## Task 1.4: Library `file:` link + dual-subpath probe

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: S · **Depends on**: 1.2

#### Description

Add `@bymax-one/nest-ai-tokens` as `file:../../../nest-ai-tokens` in `apps/api`, plus
`scripts/probe-subpaths.mjs` that imports the server subpath (Node ESM) and the shared subpath and
asserts key exports exist (`BymaxAiTokensModule`, `AI_TOKENS_ERROR_CODES`,
`DEFAULT_OPENAI_PRICING_2026`, `AI_TOKEN_TRANSACTION_TYPES`). CI gains a `probe` step. Document
the three linking modes in the README (spec §8.1).

#### Acceptance criteria

- [ ] `pnpm install` resolves the local package; `openai` is NOT in any lockfile entry.
- [ ] `node scripts/probe-subpaths.mjs` exits 0 and prints the probed export names.
- [ ] CI runs the probe after install.
- [ ] README gains the linking-modes section (file: now, ^0.1.0 after publish).

#### Files to create / modify

- `apps/api/package.json`, `scripts/probe-subpaths.mjs`, `.github/workflows/ci.yml`, `README.md`

#### Agent prompt

```
You are a senior Node/TypeScript engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 01, Task 1.4 of 5 (MIDDLE).

PRECONDITIONS
- Task 1.2 done. The library checkout exists at ../nest-ai-tokens relative to the repo root's
  parent (file:../../../nest-ai-tokens from apps/api). If its dist/ is missing, build it once
  (pnpm install && pnpm build inside the library) and note that in the PR body.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §8 (Library Consumption)

TASK
Link the library and prove both subpaths resolve.

DELIVERABLES
1. apps/api dependency: "@bymax-one/nest-ai-tokens": "file:../../../nest-ai-tokens".
2. scripts/probe-subpaths.mjs (zero-dep Node ESM): dynamic-import the package root and /shared,
   assert the named exports listed in the acceptance criteria are defined, print a table, exit
   non-zero on any miss.
3. ci.yml: add a `probe` step in the install job (after pnpm install).
4. README: "Library consumption" section with the three modes from spec §8.1.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Do NOT install openai. Do NOT copy library code. Timeless comments; no em dashes.

Verification:
- `node scripts/probe-subpaths.mjs` exits 0.
- `grep -r '"openai"' pnpm-lock.yaml` finds no direct dependency entry introduced by this repo.

Completion Protocol: standard steps; commit `feat(api): link nest-ai-tokens and probe subpaths
(1.4)`.
```

---

## Task 1.5: Phase close: audit, dashboards, PR + Copilot review

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: S · **Depends on**: 1.1..1.4

#### Description

Standard phase close: audit all acceptance criteria against the tree, update dashboards, open the
PR, request the GitHub Copilot review, address all findings, merge with CI green.

#### Acceptance criteria

- [ ] Local gate replay green: `pnpm lint && pnpm typecheck && pnpm --filter api test` plus
      `pnpm infra:up` + migrate + seed + probe.
- [ ] Dashboards updated (this file, plan, tasks README).
- [ ] PR `feat(api): phase 01, postgres, prisma and library link` merged squash with branch
      deleted, Copilot findings all addressed, CI green.

#### Files to create / modify

- This file, `docs/DEVELOPMENT_PLAN.md`, `docs/tasks/README.md`

#### Agent prompt

```
You are the phase-close auditor for nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 01, Task 1.5 of 5 (LAST, phase close).

PRECONDITIONS
- Tasks 1.1-1.4 report done on feat/phase-01-database-library-link.

REQUIRED READING (only these)
- This phase file (all acceptance criteria)
- docs/DEVELOPMENT_PLAN.md Progress Dashboard + Update Protocol

TASK
Close Phase 01 with an audited, reviewed, merged PR.

DELIVERABLES
1. Replay the gates: pnpm lint, pnpm typecheck, pnpm --filter api test, infra:up + migrate + seed
   (idempotency: run seed twice), node scripts/probe-subpaths.mjs. All must pass; fix any miss.
2. Verify every 1.1..1.4 acceptance criterion against the real tree.
3. Update this file's header/status/log, the plan dashboard row + overall counter, tasks README.
4. gh pr create (title `feat(api): phase 01, postgres, prisma and library link`, body with
   deliverables + verification evidence); request the GitHub Copilot code review
   (gh pr edit --add-reviewer copilot-pull-request-reviewer[bot] or via UI); address EVERY
   finding; merge only with CI green: gh pr merge --squash --delete-branch; confirm branch gone.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Verify via git/gh output, never narration.

Verification:
- gh pr view --json state = MERGED; CI green on main.

Completion Protocol: append `- 1.5 ✅ YYYY-MM-DD: phase merged in PR #<n>`; commit
`docs(plan): mark phase 01 complete` on main.
```

---

## Completion log

<!-- append: - <id> ✅ YYYY-MM-DD: <one-line summary> -->

- 1.1 ✅ 2026-07-10: postgres:17-alpine compose stack (digest-pinned, healthcheck, named volume), root `.env.example` (DATABASE_URL, PORT), real infra:up/down/nuke scripts
- 1.2 ✅ 2026-07-10: apps/api package (Prisma 7 + adapter-pg + prisma.config.ts), multi-file schema with the library's shipped fragment verbatim, first migration applied incl. both partial indexes
- 1.3 ✅ 2026-07-10: deterministic seed (pure plan + idempotent delete-first writer): 3 wallets, 4 grants, 76 usage records across acme/globex incl. 4 reindex system costs; 12 unit tests, 100% coverage; double-run verified against Postgres
