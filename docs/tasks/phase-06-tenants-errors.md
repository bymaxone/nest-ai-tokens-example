# Phase 06: Multi-Tenant & Error Catalog

> **Status**: 🔄 In Progress · **Progress**: 4 / 5 tasks · **Last updated**: 2026-07-10
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#per-phase-detail) §Phase 06
> **Source spec**: [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md) §18 (Multi-Tenant), §19 (Error Handling), §7.7 (matrix rows 2, 10-12, 60-62, 75, 77-83)

> **Reconciliation (2026-07-10):** the shipped library v0.1.0 supersedes the tenancy and error
> surfaces drafted here and in spec §18/§19 (same rule as the phase 01-05 notes).
>
> **Tenancy.** There is NO `multiTenant` options block and NO `tenantIdResolver`: tenancy flows
> through the host `scopeResolver` (this app's demo identity -> `MeteringContext` mapping in
> `ai/ai-tokens.config.ts`) and the `tenantId` column on every table. The drafted
> `multiTenant.required: true` mode maps to this app's `TENANT_REQUIRED` env knob: the
> scopeResolver rejects tenant-less identities itself. The drafted `ledger.tenant_required` code
> does not exist; the documented rejection is the app's `tenant.required` (403, canonical
> envelope). Default mode: a null-tenant identity falls back to the app's `global` tenant id.
>
> **Error catalog.** The drafted 24-code dot-namespaced list does not exist. The REAL runtime
> surface is the library's 15-code `AI_TOKENS_ERROR_CODES` union raised as `AiTokensException`
> (`{ error: { code, message, details? } }`, statuses from the internal map:
> NOT_CONFIGURED 503, INVALID_CONFIG 500, UNKNOWN_PROVIDER 400, USAGE_MALFORMED 422,
> PRICE_NOT_FOUND 422, FX_REQUIRED 500, BUDGET_EXCEEDED 402, QUOTA_EXCEEDED 429,
> INSUFFICIENT_CREDITS 402, HOLD_NOT_FOUND 404, HOLD_EXPIRED 410, HOLD_ALREADY_SETTLED 409,
> IDEMPOTENCY_CONFLICT 409, STREAM_USAGE_MISSING 422, STORE_ERROR 502) plus this app's HOST codes
> in the mirrored `ApiException` envelope: `provider.rate_limited` 429, `provider.timeout` 504,
> `provider.empty_response` 502, `provider.content_filter` 400, `provider.api_key_invalid` 401,
> `provider.unknown_error` 500 (marker throws), `provider.response_truncated` 502,
> `provider.invalid_json` 502, `command.missing_translations` 502 (command outcomes),
> `quota.disabled` 503 (feature-block guards) and `tenant.required` 403 (this phase). Drafted-code
> mappings: `ledger.invalid_input`/`ledger.zero_amount` -> `AI_TOKENS_INVALID_CONFIG` (wallet
> input validation); `pricing.not_found` -> `AI_TOKENS_PRICE_NOT_FOUND`;
> `pricing.invalid_date`/`command.missing_parameters`/`embedding.empty_text` -> the app's global
> Zod validation rejection (400 `{ message: 'Validation failed', issues }`, value-free) — the
> services never see those inputs; `pricing.overlap` -> NOT an error (the library's `upsertPrice`
> closes the open row by design); `command.unsupported_command` -> NOT reachable (the route/DTO
> space is closed over the five commands). Config-time codes (`AI_TOKENS_INVALID_CONFIG` at boot,
> `AI_TOKENS_FX_REQUIRED`) are proven by task 6.4's boot variants; `AI_TOKENS_NOT_CONFIGURED` is
> RESERVED in v0.1.0 (defined in the catalog but never raised by the shipped dist) and is
> documented honestly instead of faked.
>
> **Conditional registration.** The drafted "ledger-only module (no provider)" maps to the real
> feature blocks: `forRoot` without `wallets`/`budgets` registers no `WalletService`/
> `BudgetService`; `forRootAsync` registers them unconditionally but resolves them to `null`.
> The drafted `EmbeddingService`/`AiCommandService` do not exist (host-owned workspace services);
> the drafted `config.invalid_provider_strategy`/`config.missing_repository`/
> `provider.api_key_missing` boot codes map to `AI_TOKENS_INVALID_CONFIG` (invalid markup /
> missing store port methods) and `AI_TOKENS_FX_REQUIRED` (non-USD currency without `fx`); there
> is no provider strategy or OpenAI key surface in the library at all (the app's mock provider is
> host code and `openai` stays uninstalled).

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
| 6.1 | Branch + tenant isolation proofs (both modes)                          | ✅     | P0       | M    | none       |
| 6.2 | `errors-demo/` triggers: ledger, pricing, embedding/command codes      | ✅     | P0       | M    | none       |
| 6.3 | `errors-demo/` provider codes + backdate helper                        | ✅     | P0       | S    | 6.2        |
| 6.4 | Module boot variants (sync, ledger-only, invalid configs, missing key) | ✅     | P0       | M    | 6.1        |
| 6.5 | Phase close: audit, dashboards, PR + Copilot review                    | 📋     | P0       | S    | 6.1..6.4   |

---

## Task 6.1: Branch + tenant isolation proofs

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: none

#### Description

E2E proofs of §18: with the header resolver, `acme` queries never return `globex` rows across
ledger, usage, and balance; the null-tenant admin sees only global rows; a test-only module
variant with `multiTenant.required: true` proves `ledger.tenant_required` on a tenant-less write.

#### Acceptance criteria

- [x] Branch `feat/phase-06-tenants-errors` created with `git switch -c`.
- [x] Isolation e2e: run a command as ada(acme) and linus(globex); each tenant's
      ledger/usage/balance reflects only its own rows (matrix row 83).
- [x] Required-mode variant: write without tenantId -> `tenant.required` 403 canonical envelope
      (rows 22, 81; reconciled — no `ledger.tenant_required` code exists in v0.1.0).
- [x] Default mode documented: null tenant = global (row 80).

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

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: none

#### Description

`errors-demo/` module: `POST /errors-demo/:code` deterministically triggers each non-provider,
non-config code: `ledger.invalid_input`, `ledger.zero_amount`, `pricing.not_found`,
`pricing.invalid_date`, `pricing.overlap`, `embedding.empty_text`, `command.missing_parameters`,
`command.missing_translations` (via the `@@fail:partial_translations@@` marker),
`command.unsupported_command` (documented as future if untriggerable: return the catalog entry
with a note instead of faking it).

#### Acceptance criteria

- [x] Each supported code returns its documented HTTP status and canonical envelope (reconciled:
      the 12 library codes triggerable at runtime plus `command.missing_translations`; the drafted
      `ledger.*`/`pricing.*`/`embedding.*` codes map per the phase Reconciliation note).
- [x] An e2e table-test walks every code in this task's scope asserting status + `error.code` +
      the shipped canonical message verbatim, plus the state-safety contract (non-billing walk
      moves neither balance nor settled ledger).
- [x] Untriggerable codes respond `501` with an honest explanation payload
      (`errors_demo.not_triggerable` with availability + reason; unknown codes 404 with the
      supported list, value-free).

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

- **Status**: ✅ Done · **Priority**: P0 · **Size**: S · **Depends on**: 6.2

#### Description

Extend the registry with the marker-driven provider codes (`rate_limited`, `timeout`,
`empty_response`, `content_filter`, `response_truncated`, `invalid_json`, `unknown_error`,
`api_key_invalid`) and add `POST /errors-demo/helpers/backdated-cost` (calculates a cost at an
old date to expose historical pricing, supporting scenario §13.4).

#### Acceptance criteria

- [x] All eight provider codes triggerable via their markers with documented status (429, 504,
      502, 400, 401, 500 throws; truncate 502 debited; bad-json 502 not debited).
- [x] Backdate helper returns `{ pricing, cost }` for a supplied model + date (no ledger write;
      reconciled to `PricingService.resolveRate` + `MeteringService.estimateCost({ at })`).
- [x] The full-catalog e2e (6.2 + 6.3) covers 21 of the reconciled 26 codes on demand; the
      remaining 5 are 3 e2e-only proofs (hold expiry, ledger-only 503, strict-tenancy 403), 1
      boot-variant code (`AI_TOKENS_FX_REQUIRED`, task 6.4), and 1 honestly reserved
      (`AI_TOKENS_NOT_CONFIGURED`), asserted by the catalog summary spec.

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

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: 6.1

#### Description

Test-only boot variants proving the registration-time surface: sync registration (matrix row 2);
ledger-only module (no `provider`) proving `EmbeddingService`/`AiCommandService` are absent from
the container (row 12); `config.invalid_provider_strategy` and `config.missing_repository` boot
failures (rows 10-11); `provider.api_key_missing` with `strategy: 'openai-default'` and no key
(row 75).

#### Acceptance criteria

- [x] Each variant is an isolated testing module (or an isolated variant app boot); assertions on
      container resolution or registration-time rejection with the exact error code.
- [x] Ledger-only variant: resolving `WalletService`/`BudgetService` throws Nest's
      unknown-provider error while `LedgerService`/`PricingService` resolve (reconciled: no
      `AiCommandService`/`AiTokenTransactionService` exist); the `QUOTA_ENABLED=false` app boot
      proves the 503 `quota.disabled` guards and a working ledger-only metered call.
- [x] The config codes complete the catalog (reconciled): `AI_TOKENS_FX_REQUIRED` + the boot face
      of `AI_TOKENS_INVALID_CONFIG` at registration time, `AI_TOKENS_HOLD_EXPIRED` via the
      backdated-hold proof; the summary spec accounts for all 26 codes (25 raised + 1 reserved).
      No `provider.api_key_missing` exists (no provider-strategy surface in v0.1.0).

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

- 6.1 ✅ 2026-07-10: tenant isolation e2e (both modes) + strict-tenancy `tenant.required` 403 at
  the identity middleware choke point and the scopeResolver (defense in depth).
- 6.2 ✅ 2026-07-10: errors-demo module (catalog + `POST /errors-demo/:code`), 13 deterministic
  triggers with state-safety guarantees, honest 501/404 policy, e2e table walk with verbatim
  canonical messages.
- 6.3 ✅ 2026-07-10: 8 marker-driven provider triggers (billing semantics proven both ways) +
  `POST /errors-demo/helpers/backdated-cost` with point-in-time pricing e2e and the 21/26
  catalog summary.
- 6.4 ✅ 2026-07-10: sync-forRoot variants (boot + ledger-only resolution), registration-time
  rejections (INVALID_CONFIG, FX_REQUIRED), ledger-only app boot (503 guards + HOLD_EXPIRED),
  26-code completion summary.
