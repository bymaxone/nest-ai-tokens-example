# Phase 06: Multi-Tenant & Error Catalog

> **Status**: 📋 ToDo · **Progress**: 0 / 5 tasks · **Last updated**: 2026-07-06
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#per-phase-detail) §Phase 06
> **Source spec**: [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md) §18 (Multi-Tenant), §19 (Error Handling), §7.7 (matrix rows 2, 10-12, 60-62, 75, 77-83)

## Context

The last backend feature phase: tenant isolation proven in both modes, the complete error catalog
reachable on demand through `errors-demo/`, and the module boot variants (sync registration,
ledger-only conditional registration, tenant-required, invalid configs, missing OpenAI key). After
this phase every row of the coverage matrix that belongs to the backend is demonstrated.

> **Completion Protocol ("standard steps"):** task Status ✅ (block + index) -> checkboxes ->
> header Progress -> plan dashboard row + overall counter -> tasks README -> Completion log entry
> -> Conventional commit.

## Rules-of-phase

1. Error envelopes are the library's, verbatim; the app never wraps or re-maps them.
2. Boot-variant tests build isolated Nest testing modules; they never mutate the primary wiring.
3. The tenant-required variant proves `ledger.tenant_required`; the primary app keeps
   `required: false`.
4. Every trigger endpoint is deterministic and safe (no state corruption; failed calls must not
   debit unless the library contract says they do).
5. 100% coverage; commented `it()`.

## Reference docs

- Spec §18, §19, §13 scenarios 6 and 8
- Library error table (24 codes) + `AiTokensException` shape from the package

## Task index

| ID  | Task                                                                   | Status | Priority | Size | Depends on |
| --- | ---------------------------------------------------------------------- | ------ | -------- | ---- | ---------- |
| 6.1 | Branch + tenant isolation proofs (both modes)                          | 📋     | P0       | M    | none       |
| 6.2 | `errors-demo/` triggers: ledger, pricing, embedding/command codes      | 📋     | P0       | M    | none       |
| 6.3 | `errors-demo/` provider codes + backdate helper                        | 📋     | P0       | S    | 6.2        |
| 6.4 | Module boot variants (sync, ledger-only, invalid configs, missing key) | 📋     | P0       | M    | 6.1        |
| 6.5 | Phase close: audit, dashboards, PR + Copilot review                    | 📋     | P0       | S    | 6.1..6.4   |

---

## Task 6.1: Branch + tenant isolation proofs

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: none

#### Description

E2E proofs of §18: with the header resolver, `acme` queries never return `globex` rows across
ledger, usage, and balance; the null-tenant admin sees only global rows; a test-only module
variant with `multiTenant.required: true` proves `ledger.tenant_required` on a tenant-less write.

#### Acceptance criteria

- [ ] Branch `feat/phase-06-tenants-errors` created with `git switch -c`.
- [ ] Isolation e2e: run a command as ada(acme) and linus(globex); each tenant's
      ledger/usage/balance reflects only its own rows (matrix row 83).
- [ ] Required-mode variant: write without tenantId -> `ledger.tenant_required` 400 (rows 22, 81).
- [ ] Default mode documented: null tenant = global (row 80).

#### Files to create / modify

- `apps/api/test/e2e/tenant-isolation.e2e-spec.ts`, test variant module

#### Agent prompt

```
You are a senior NestJS testing engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example, reference app for @bymax-one/nest-ai-tokens. CURRENT PHASE: 06,
Task 6.1 of 5 (FIRST).

PRECONDITIONS
- Phase 05 merged: quota, credits, usage endpoints live; seed has acme/globex/global data.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §18 and §13 scenario 6; §7.7 rows 80-83

TASK
Create the phase branch and prove tenant isolation in both modes.

DELIVERABLES
1. Branch: `git switch -c feat/phase-06-tenants-errors` (NEVER checkout -b).
2. tenant-isolation.e2e-spec.ts: as ada (x-demo-user ada) run one translate; as linus run one;
   assert: ada's /ledger/transactions contains no globex row; /usage/balance differs per user;
   /usage/by-type scoped per tenant; root (null tenant) sees only global rows.
3. Test-only module variant with multiTenant.required: true (fresh testing module reusing the
   real factory with an env override): a recordCredit without tenantId -> AiTokensException
   ledger.tenant_required (assert code + 400).
4. Describe blocks cite the matrix rows.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Variants never touch the primary wiring; sequential suites; no em dashes.

Verification:
- `pnpm --filter api test:e2e` green.

Completion Protocol: standard steps; commit `test(api): tenant isolation proofs (6.1)`.
```

---

## Task 6.2: `errors-demo/` triggers: ledger, pricing, embedding/command

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: none

#### Description

`errors-demo/` module: `POST /errors-demo/:code` deterministically triggers each non-provider,
non-config code: `ledger.invalid_input`, `ledger.zero_amount`, `pricing.not_found`,
`pricing.invalid_date`, `pricing.overlap`, `embedding.empty_text`, `command.missing_parameters`,
`command.missing_translations` (via the `@@fail:partial_translations@@` marker),
`command.unsupported_command` (documented as future if untriggerable: return the catalog entry
with a note instead of faking it).

#### Acceptance criteria

- [ ] Each supported code returns its documented HTTP status and canonical envelope.
- [ ] An e2e table-test walks every code in this task's scope asserting status + `error.code` +
      message from `AI_TOKENS_ERROR_CODES`.
- [ ] Untriggerable codes respond `501` with an honest explanation payload (and the spec matrix
      is updated with the ⛔ + reason if any).

#### Files to create / modify

- `apps/api/src/errors-demo/**`, e2e spec

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 06, Task 6.2 of 5 (MIDDLE).

PRECONDITIONS
- Phases 03-05 merged (ledger, pricing, commands, quota live).

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §19; the library error table (§12.2 of its spec, mirrored in
  the package's AI_TOKENS_ERROR_CODES + messages)

TASK
Ship the deterministic error triggers for the ledger/pricing/command/embedding codes.

DELIVERABLES
1. errors-demo module/controller/service: POST /errors-demo/:code with a registry mapping code ->
   trigger fn: ledger.invalid_input (record with empty userId), ledger.zero_amount (amount 0),
   pricing.not_found (getCurrentPricing('ghost-model')), pricing.invalid_date (updatePricing with
   malformed date), pricing.overlap (insert overlapping window through the service),
   embedding.empty_text (generate with ''), command.missing_parameters (translate without
   targetLanguages, bypassing app Zod via direct service call), command.missing_translations
   (translate with @@fail:partial_translations@@). The library exception propagates untouched.
2. Unknown :code -> 404 listing supported codes; untriggerable codes -> 501 with an honest
   { reason } payload.
3. E2E table-test across all codes in scope asserting status + error.code + canonical message.
4. 100% coverage.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Never wrap the library envelope; strict TS; timeless comments; no em dashes.

Verification:
- test:cov 100%; e2e green.

Completion Protocol: standard steps; commit `feat(api): errors-demo core triggers (6.2)`.
```

---

## Task 6.3: `errors-demo/` provider codes + backdate helper

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: S · **Depends on**: 6.2

#### Description

Extend the registry with the marker-driven provider codes (`rate_limited`, `timeout`,
`empty_response`, `content_filter`, `response_truncated`, `invalid_json`, `unknown_error`,
`api_key_invalid`) and add `POST /errors-demo/helpers/backdated-cost` (calculates a cost at an
old date to expose historical pricing, supporting scenario §13.4).

#### Acceptance criteria

- [ ] All eight provider codes triggerable via their markers with documented status.
- [ ] Backdate helper returns `{ pricing, cost }` for a supplied model + date (no ledger write).
- [ ] The full-catalog e2e (6.2 + 6.3) covers 22 of 24 codes; the remaining 2 config codes are
      owned by task 6.4's boot variants.

#### Files to create / modify

- `apps/api/src/errors-demo/**`, e2e spec extension

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 06, Task 6.3 of 5 (MIDDLE).

PRECONDITIONS
- Task 6.2 done (registry live); phase 04 markers available.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §12 (markers), §19, §13 scenario 4

TASK
Complete the runtime error catalog and the backdate helper.

DELIVERABLES
1. Registry additions: each provider code triggers a custom() command whose userPrompt embeds the
   matching @@fail:*@@ marker; api_key_invalid uses its marker; unknown_error likewise. Assert
   the library statuses (429, 504, 502, 400, 502, 502, 500, 401).
2. POST /errors-demo/helpers/backdated-cost: Zod { model, promptTokens, completionTokens, date };
   PricingService.calculateCost(model, p, c, date); returns the CostCalculation verbatim.
3. Extend the table-driven e2e to the full runtime set; a summary assertion counts 22 covered
   codes.
4. 100% coverage.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- No sleeps: markers are synchronous failures. No em dashes.

Verification:
- test:cov 100%; e2e green.

Completion Protocol: standard steps; commit `feat(api): provider error triggers and backdate
helper (6.3)`.
```

---

## Task 6.4: Module boot variants

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 6.1

#### Description

Test-only boot variants proving the registration-time surface: sync registration (matrix row 2);
ledger-only module (no `provider`) proving `EmbeddingService`/`AiCommandService` are absent from
the container (row 12); `config.invalid_provider_strategy` and `config.missing_repository` boot
failures (rows 10-11); `provider.api_key_missing` with `strategy: 'openai-default'` and no key
(row 75).

#### Acceptance criteria

- [ ] Each variant is an isolated testing module; assertions on container resolution or boot
      rejection with the exact error code.
- [ ] Ledger-only variant: resolving `AiCommandService` throws Nest's unknown-provider error
      while `AiTokenTransactionService` resolves.
- [ ] The two config codes + api_key_missing complete the 24/24 catalog count (asserted in a
      summary spec).

#### Files to create / modify

- `apps/api/test/e2e/module-variants.e2e-spec.ts`

#### Agent prompt

```
You are a senior NestJS testing engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 06, Task 6.4 of 5 (MIDDLE).

PRECONDITIONS
- Task 6.1 done. Real repositories available for reuse in variants.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §7.1 rows 2, 10-12; §7.7 row 75; §4.3 contract 7
- The library registration surfaces from the package d.ts

TASK
Prove the boot-time surface with isolated module variants.

DELIVERABLES
1. module-variants.e2e-spec.ts building isolated Test.createTestingModule variants:
   (a) sync registration path with minimal options + repositories -> boots, ledger service
   resolves; (b) ledger-only (no provider block) -> AiCommandService/EmbeddingService NOT
   resolvable, ledger/pricing resolvable; (c) provider.strategy 'bogus' ->
   boot rejects with config.invalid_provider_strategy; (d) missing transaction repository
   binding -> config.missing_repository; (e) strategy 'openai-default' without apiKey -> boot or
   first-call failure provider.api_key_missing (assert whichever the library documents; read its
   README section on the openai-default strategy first).
2. A summary spec asserting the catalog coverage count reaches 24/24 across phases 06 tasks.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Variants never touch the primary app module; openai stays uninstalled (the openai-default
  variant must fail BEFORE needing the SDK; if the library requires the SDK at import time for
  that strategy, assert that documented failure instead and note it in the spec matrix).

Verification:
- `pnpm --filter api test:e2e` green.

Completion Protocol: standard steps; commit `test(api): module boot variants complete the
catalog (6.4)`.
```

---

## Task 6.5: Phase close: audit, dashboards, PR + Copilot review

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: S · **Depends on**: 6.1..6.4

#### Description

Standard phase close: replay gates, audit criteria (including the 24/24 catalog count and the
backend coverage-matrix sweep), sync dashboards, PR
`feat(api): phase 06, multi-tenant and error catalog`, GitHub Copilot review, squash-merge on
green, delete branch, log.

#### Acceptance criteria

- [ ] Gates green; 24/24 error codes proven; backend matrix rows all ✅ or ⛔-justified.
- [ ] Dashboards synced; PR merged with review resolved; branch gone.

#### Agent prompt

```
You are the phase-close auditor for nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 06, Task 6.5 of 5 (LAST, phase close).

PRECONDITIONS: tasks 6.1-6.4 report done on feat/phase-06-tenants-errors.
REQUIRED READING (only these): this phase file; docs/DEVELOPMENT_PLAN.md dashboard + protocol;
docs/TECHNICAL_SPECIFICATION.md §7 (for the backend sweep).

TASK: close Phase 06 with an audited, reviewed, merged PR.

DELIVERABLES
1. Replay sequentially: pnpm lint, typecheck, build, test:cov (100%), test:e2e.
2. Backend matrix sweep: walk spec §7 rows 1-90; every backend-owned row must have live code +
   a test; fix or ⛔-justify in the spec within this PR.
3. Sync dashboards; gh pr create title `feat(api): phase 06, multi-tenant and error catalog`;
   request the GitHub Copilot code review; address EVERY finding; merge with CI green:
   gh pr merge --squash --delete-branch; verify branch removal.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification: PR MERGED; CI green on main.

Completion Protocol: append `- 6.5 ✅ YYYY-MM-DD: phase merged in PR #<n>`; commit
`docs(plan): mark phase 06 complete`.
```

---

## Completion log

<!-- append: - <id> ✅ YYYY-MM-DD: <one-line summary> -->
