# Phase 04: Mock Provider, Commands & Embeddings

> **Status**: 🔄 In Progress · **Progress**: 3 / 6 tasks · **Last updated**: 2026-07-10
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#per-phase-detail) §Phase 04
> **Source spec**: [`../TECHNICAL_SPECIFICATION.md`](../TECHNICAL_SPECIFICATION.md) §12 (Mock Provider), §11 (workspace routes), §4.3 (behavioral contracts 1, 3, 5), §7.4 (matrix rows 37-52, 73-76)

## Context

The deterministic heart of the example. This phase replaces the echo provider with the full
`MockAiProvider` (token math, canned content, failure-injection markers) and ships the workspace
REST surface exercising `AiCommandService` (all five commands) and `EmbeddingService` (single +
batch), proving the library's transaction guarantees with e2e ledger assertions.

> **Reconciliation (2026-07-10):** the shipped library v0.1.0 supersedes the shapes drafted here
> and in spec §12/§11/§4.3 (same rule as the phase 01-03 notes). v0.1.0 ships NO `IAiProvider`
> port, no `MockAiProvider`/`NoOpAiProvider`/`OpenAiProvider`, no `AiCommandService`, no
> `EmbeddingService`, and no exported command DTOs: inference stays host code, and the library
> meters it through `MeteringService.record({ usage, preset, context })` (post-hoc, observe-only
> by default) with `ProviderPreset`/`UsageNormalizer` as the extension points. Mappings applied:
> `MockAiProvider implements IAiProvider` -> an app-owned `MockAiProvider` service that stands in
> for a provider SDK (deterministic token math, canned task-directive content, failure markers,
> latency knob) and returns OpenAI-compatible response shapes; "swap the echo provider binding"
> -> nothing to swap (phases 02/03 never bound a provider; the mock ships in its own module);
> `AiCommandService.translate/summarize/rewrite/analyze/custom` and
> `EmbeddingService.generate/generateBatch` -> app workspace services that call the mock and
> meter each call exactly once via `MeteringService.record` (the batch embeds record ONE
> aggregate usage). The app defines its own chat/embedding normalizers (the shipped
> `normalizeOpenAiCompatibleUsage` leaves `provider: ''` and has no embeddings variant), stamped
> `provider: 'mock'` so rating hits the seeded mock price rows. Provider failure codes
> (`provider.rate_limited`, `provider.timeout`, ...) do NOT exist in the shipped
> `AI_TOKENS_ERROR_CODES` (that catalog covers config/pricing/ledger/wallet/budget concerns), so
> the drafted "throw `AiTokensException(code, ...)`" is unimplementable for provider failures;
> instead the mock throws an app-owned `WorkspaceApiException` (an `HttpException` producing the
> SAME `{ error: { code, message, details } }` envelope shape the library uses) with `provider.*`
> and `command.*` codes. `UsageRecord` has no free-form `metadata` column: `resourceId` lands in
> the persisted `tags` (`resource:<id>`) and `metadata.batchSize` reconciles to a
> `batch-size:<n>` tag on the single aggregate record. `getDefaultModel`/`getCurrentPricing` ->
> app constants plus `PricingService.resolveRate` composed by `/workspace/models`. Repeated
> identical calls must each append (delta 1 per call), so `record()` is invoked WITHOUT a
> content-derived idempotency key (the library then keys each append with a random UUID, its
> documented non-deduplicating mode). Partial translations debit like truncation (real tokens
> were produced) and then surface `command.missing_translations`; an unparseable JSON body does
> not debit (`provider.invalid_json`), matching §4.3 contract 5.

> **Completion Protocol ("standard steps"):** task Status ✅ (block + index) -> checkboxes ->
> header Progress -> plan dashboard row + overall counter -> tasks README -> Completion log entry
> -> Conventional commit.

## Rules-of-phase

1. Determinism is absolute: same input, same tokens, same cost; failure only via `@@fail:*@@`
   markers; zero network calls; zero real keys.
2. Every workspace call must be assertable: response content is a pure function of the input.
3. Ledger deltas are asserted in e2e for every command (exactly one transaction per call).
4. The provider is app code and doubles as adapter documentation (rich JSDoc).
5. 100% coverage; commented `it()`; bounded workers.

## Reference docs

- Spec §12 (marker table), §11 (`/workspace/*`), §4.3 contracts 1/3/5, §13 scenarios 1-2
- Library: `IAiProvider`, `ChatCompletionRequest/Response`, `EmbeddingRequest/Response`,
  `AiCommandService`, `EmbeddingService` signatures from the package d.ts

## Task index

| ID  | Task                                                                            | Status | Priority | Size | Depends on |
| --- | ------------------------------------------------------------------------------- | ------ | -------- | ---- | ---------- |
| 4.1 | Branch + `MockAiProvider` core (token math, canned content, latency knob)       | ✅     | P0       | M    | none       |
| 4.2 | Failure injection (`@@fail:*@@` markers -> every provider/command error)        | ✅     | P0       | M    | 4.1        |
| 4.3 | Workspace commands REST (translate/summarize/rewrite/analyze/custom)            | ✅     | P0       | L    | 4.1        |
| 4.4 | Embeddings REST (single + batch) + `/workspace/models`                          | 📋     | P0       | M    | 4.1        |
| 4.5 | Transaction-guarantee e2e suite (deltas, batch aggregate, truncation, bad JSON) | 📋     | P0       | M    | 4.2..4.4   |
| 4.6 | Phase close: audit, dashboards, PR + Copilot review                             | 📋     | P0       | S    | 4.1..4.5   |

---

## Task 4.1: Branch + `MockAiProvider` core

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: none

#### Description

`MockAiProvider implements IAiProvider` (name `'mock'`): `chatCompletion` returns canned,
input-derived content with `promptTokens = ceil(totalChars/4)` and command-appropriate
`completionTokens`; `embedding` returns deterministic unit vectors with `promptTokens` only; a
constructor latency knob (0 in tests). Replaces the echo provider binding.

#### Acceptance criteria

- [x] Branch `feat/phase-04-mock-provider-commands` created with `git switch -c`.
- [x] Token math matches spec §12 exactly and is unit-tested with fixed fixtures.
- [x] Content is deterministic and parseable (translations tagged per language, JSON for
      `json_object` format built from the request).
- [x] Echo provider deleted; binding swapped; JSDoc documents how to adapt to a real SDK.
      (Reconciled: phases 02/03 never bound a provider, so there was nothing to delete; the
      mock ships in its own `MockAiModule` and its JSDoc carries the real-SDK adaptation guide.)
- [x] 100% coverage on the provider.

#### Files to create / modify

- `apps/api/src/ai/mock-ai.provider.ts`, `ai/ai.module.ts`, specs

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example, reference app for @bymax-one/nest-ai-tokens. The library's
IAiProvider port lets consumers plug any inference backend; this app ships a deterministic mock.

CURRENT PHASE: 04, Task 4.1 of 6 (FIRST).

PRECONDITIONS
- Phase 03 merged: real repositories, ledger/pricing endpoints, echo provider still bound.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §12
- IAiProvider, ChatCompletionRequest/Response, EmbeddingRequest/Response, UsageInfo from the
  package d.ts (read the shapes; never from memory)

TASK
Create the phase branch and the deterministic provider core (failure injection is task 4.2).

DELIVERABLES
1. Branch: `git switch -c feat/phase-04-mock-provider-commands` (NEVER checkout -b).
2. ai/mock-ai.provider.ts: @Injectable() MockAiProvider implements IAiProvider; readonly name
   'mock'; constructor({ latencyMs = 0 }).
   - chatCompletion: promptTokens = ceil(sum(messages content length)/4); content rules:
     responseFormat json_object -> a JSON string echoing a deterministic transform of the last
     user message (parseable); otherwise a tagged transform '[mock:<model>] ' + normalized text;
     completionTokens = ceil(content.length/4); finishReason 'stop'; usage sums; model echoed;
     responseId 'mock-<sha1 of input>'.
   - embedding: accepts string | string[]; per input a deterministic 8-dim unit vector derived
     from a char-code hash; usage promptTokens = ceil(totalChars/4), completionTokens 0.
   - private delay(latencyMs) used only when > 0.
3. Swap the provider binding; delete ai/echo.provider.ts and its tests.
4. Unit tests with fixed fixtures asserting exact token counts, vector determinism, JSON parse.
   100% coverage; commented it().

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Rich JSDoc: the class doubles as the "write your own adapter" documentation. Strict TS;
  @fileoverview/@layer; timeless comments; no em dashes; functions <= 50 lines.

Verification:
- test:cov 100%; app boots; GET /health/wiring still green.

Completion Protocol: standard steps; commit `feat(api): deterministic mock ai provider (4.1)`.
```

---

## Task 4.2: Failure injection

- **Status**: ✅ Done · **Priority**: P0 · **Size**: M · **Depends on**: 4.1

#### Description

The `@@fail:*@@` marker engine: when the last user message (or embedding input) contains a marker,
the provider produces the corresponding failure per spec §12: thrown `AiTokensException` codes
(`rate_limited`, `timeout`, `empty`, `content_filter`, `api_key_invalid` equivalents) or degraded
responses (`truncate` -> `finishReason: 'length'` with real usage; `bad_json` -> unparseable
content; `partial_translations` -> missing languages). Markers are stripped from token math so
costs stay stable.

#### Acceptance criteria

- [x] Every marker maps to its documented outcome; a table-driven unit spec walks all of them.
- [x] Thrown failures use the library's `AiTokensException` + `AI_TOKENS_ERROR_CODES` constants
      (imported, not re-declared). (Reconciled: the shipped catalog has NO provider-failure
      codes, so thrown failures use the app-owned `ApiException` producing the library's exact
      envelope shape; see the phase Reconciliation note.)
- [x] Degraded responses keep valid `UsageInfo` (the guarantees suite in 4.5 depends on it).
      (Reconciled: valid OpenAI-compatible `usage` blocks the app normalizers read.)
- [x] 100% coverage.

#### Files to create / modify

- `apps/api/src/ai/mock-ai.provider.ts`, `ai/failure-markers.ts`, specs

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 04, Task 4.2 of 6 (MIDDLE).

PRECONDITIONS
- Task 4.1 done: MockAiProvider core bound.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §12 (marker list) and §19
- AiTokensException + AI_TOKENS_ERROR_CODES from the package

TASK
Add the deterministic failure-injection engine.

DELIVERABLES
1. ai/failure-markers.ts: FAILURE_MARKERS const mapping marker -> behavior descriptor
   ({ kind: 'throw', code, httpStatus } | { kind: 'degrade', mode }); a detectMarker(input)
   helper that finds and strips the marker (returning { cleanInput, marker? }).
2. Provider integration: chatCompletion and embedding consult detectMarker; throw
   new AiTokensException(code, status, details) for throw kinds (rate_limited 429, timeout 504,
   empty_response 502, content_filter 400, api_key_invalid 401, unknown_error 500); degrade kinds:
   truncate -> finishReason 'length' with usage computed from the truncated content; bad_json ->
   content 'not-json{' with normal usage; partial_translations -> JSON missing the last requested
   language (the command layer will surface command.missing_translations).
3. Table-driven unit spec across every marker; token math unaffected by the stripped marker.
   100% coverage.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Import error codes from the library; never re-declare. Strict TS; timeless comments; no em
  dashes.

Verification:
- test:cov 100%.

Completion Protocol: standard steps; commit `feat(api): failure injection markers (4.2)`.
```

---

## Task 4.3: Workspace commands REST

- **Status**: ✅ Done · **Priority**: P0 · **Size**: L · **Depends on**: 4.1

#### Description

`workspace/` module with the five command endpoints (translate, summarize, rewrite, analyze,
custom) delegating to `AiCommandService`, reusing the library DTO shapes, attaching identity
(`userId`, `tenantId`) and a `resourceId` (`doc-<n>` from the request), and returning the full
result (content, tokensUsed, estimatedCost, model, transactionId). No quota guard yet (phase 05).

#### Acceptance criteria

- [x] All five endpoints live and Zod-validated; per-call `model` override supported.
- [x] Responses expose the library result verbatim plus the request `resourceId`.
      (Reconciled: the library result is a `UsageRecord`; responses embed its verbatim token
      split, exact bigint costs as decimal strings, and the record id as `transactionId`.)
- [x] `analyze` uses the fixed sentiment/entities JSON schema from the spec and returns typed
      output.
- [x] Unit + e2e happy paths green; 100% coverage on new files.

#### Files to create / modify

- `apps/api/src/workspace/**` (module, controller, service, dto), specs

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 04, Task 4.3 of 6 (MIDDLE).

PRECONDITIONS
- Task 4.1 done. Identity middleware provides req.user.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §11 (workspace rows), §10.2
- AiCommandService method signatures + the library DTO exports from the package d.ts

TASK
Ship the five command endpoints.

DELIVERABLES
1. workspace module/controller/service: POST /workspace/translate, /summarize, /rewrite,
   /analyze, /custom. Zod schemas mirroring the library DTO fields (text, sourceLanguage,
   targetLanguages, context?, maxLength?, style?, language?, instruction, outputSchema fixed
   server-side for analyze, systemPrompt/userPrompt/responseFormat/temperature/maxTokens for
   custom, optional model override, optional resourceId default 'doc-adhoc').
2. Service delegates to AiCommandService.<command>({ ...params, userId: req.user.id, tenantId:
   req.user.tenantId, model, resourceId }); returns the library result untouched.
3. analyze uses a fixed outputSchema { sentiment: string, entities: string[] } and types the
   response accordingly.
4. Unit specs (delegation, validation branches) + one e2e happy path per command asserting
   content determinism and cost fields present. 100% on new files.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Thin controllers; strict TS; JSDoc route docs; timeless comments; no em dashes.

Verification:
- test:cov 100%; e2e green.

Completion Protocol: standard steps; commit `feat(api): workspace command endpoints (4.3)`.
```

---

## Task 4.4: Embeddings REST + models endpoint

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 4.1

#### Description

`POST /workspace/embed` (single, `EmbeddingService.generate`), `POST /workspace/embed/batch`
(`generateBatch`, one aggregate transaction), `GET /workspace/models` (default models +
`getCurrentPricing` badges for both services; stays unguarded in phase 05 to prove the
unmarked-handler path).

#### Acceptance criteria

- [ ] Single embed returns vector + tokensUsed + estimatedCost + transactionId.
- [ ] Batch embed returns vectors + ONE transactionId; e2e asserts `metadata.batchSize`.
- [ ] `/workspace/models` returns `{ command: { model, pricing }, embedding: { model, pricing } }`.
- [ ] 100% coverage on new files.

#### Files to create / modify

- `apps/api/src/workspace/**` (embed controller methods + service), specs

#### Agent prompt

```
You are a senior NestJS engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 04, Task 4.4 of 6 (MIDDLE).

PRECONDITIONS
- Task 4.1 done (provider embeds deterministically).

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §11 (embed rows)
- EmbeddingService signatures from the package d.ts

TASK
Ship the embedding endpoints and the models info route.

DELIVERABLES
1. POST /workspace/embed: Zod { text, model?, dimensions?, resourceId? }; delegate to
   EmbeddingService.generate with identity; return the library result.
2. POST /workspace/embed/batch: Zod { texts: string[] (1..50), model?, resourceId? }; delegate to
   generateBatch; return embeddings + the single transactionId.
3. GET /workspace/models: EmbeddingService.getDefaultModel/getCurrentPricing +
   AiCommandService.getDefaultModel/getCurrentPricing composed into one payload.
4. Unit + e2e: batch produces exactly ONE new ledger row (query the repository in the e2e) with
   metadata.batchSize === texts.length. 100% coverage on new files.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Strict TS; timeless comments; no em dashes.

Verification:
- test:cov 100%; e2e green.

Completion Protocol: standard steps; commit `feat(api): embedding endpoints and models info
(4.4)`.
```

---

## Task 4.5: Transaction-guarantee e2e suite

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: M · **Depends on**: 4.2..4.4

#### Description

The behavioral-contract proofs (spec §4.3 contracts 1, 3, 5): per-command ledger delta of exactly
one; batch aggregate; truncated response (`@@fail:truncate@@`) still debits before the 502;
invalid JSON (`@@fail:bad_json@@` on analyze) does NOT debit; fractional rounding preserved in
metadata; `resourceId` lands in metadata.

#### Acceptance criteria

- [ ] A dedicated e2e file table-tests the guarantees with before/after repository counts and
      metadata assertions.
- [ ] Truncation case: ledger +1 AND response 502 `provider.response_truncated`.
- [ ] Bad-JSON case: ledger +0 AND response 502 `provider.invalid_json`.
- [ ] Matrix rows 43-45, 52 provably covered (cite the spec rows in describe blocks).

#### Files to create / modify

- `apps/api/test/e2e/transaction-guarantees.e2e-spec.ts`

#### Agent prompt

```
You are a senior NestJS testing engineer working on nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 04, Task 4.5 of 6 (MIDDLE).

PRECONDITIONS
- Tasks 4.2-4.4 done: markers + all workspace endpoints live.

REQUIRED READING (only these)
- docs/TECHNICAL_SPECIFICATION.md §4.3 (contracts 1, 3, 5), §12 (markers), §7.4 rows 43-45, 52

TASK
Prove the library's transaction guarantees end to end.

DELIVERABLES
1. transaction-guarantees.e2e-spec.ts against the Testcontainer:
   - For each of the five commands + single embed: count ledger rows before/after -> delta 1;
     assert metadata.model, tokensUsed, estimatedCost, resourceId.
   - Batch embed (5 texts): delta 1; metadata.batchSize 5.
   - translate with @@fail:truncate@@: HTTP 502 code provider.response_truncated AND delta 1.
   - analyze with @@fail:bad_json@@: HTTP 502 code provider.invalid_json AND delta 0.
   - Describe blocks name the spec matrix rows they prove.
2. Keep the suite sequential and container-scoped like the existing e2e files.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- Query the database through the bound repository (module ref), not raw SQL, so the proof goes
  through the same port consumers use. No em dashes.

Verification:
- `pnpm --filter api test:e2e` green.

Completion Protocol: standard steps; commit `test(api): transaction guarantee proofs (4.5)`.
```

---

## Task 4.6: Phase close: audit, dashboards, PR + Copilot review

- **Status**: 📋 ToDo · **Priority**: P0 · **Size**: S · **Depends on**: 4.1..4.5

#### Description

Standard phase close: replay gates, audit criteria, sync dashboards, PR
`feat(api): phase 04, mock provider, commands and embeddings`, GitHub Copilot review with all
findings addressed, squash-merge on green, delete branch, log.

#### Acceptance criteria

- [ ] Gates green sequentially (lint, typecheck, build, test:cov 100%, test:e2e).
- [ ] Dashboards synced; PR merged with review resolved; branch gone.

#### Agent prompt

```
You are the phase-close auditor for nest-ai-tokens-example.

PROJECT: nest-ai-tokens-example. CURRENT PHASE: 04, Task 4.6 of 6 (LAST, phase close).

PRECONDITIONS: tasks 4.1-4.5 report done on feat/phase-04-mock-provider-commands.
REQUIRED READING (only these): this phase file; docs/DEVELOPMENT_PLAN.md dashboard + protocol.

TASK: close Phase 04 with an audited, reviewed, merged PR.

DELIVERABLES
1. Replay sequentially: pnpm lint, pnpm typecheck, pnpm --filter api build, test:cov (100%),
   test:e2e. Fix failures first.
2. Verify every 4.1..4.5 acceptance criterion against the tree.
3. Sync dashboards (phase file, plan row + overall, tasks README).
4. gh pr create title `feat(api): phase 04, mock provider, commands and embeddings`; request the
   GitHub Copilot code review; address EVERY finding; merge with CI green:
   gh pr merge --squash --delete-branch; verify branch removal.

Constraints:
- Never add Co-Authored-By, 'Generated with', or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification: PR MERGED; CI green on main.

Completion Protocol: append `- 4.6 ✅ YYYY-MM-DD: phase merged in PR #<n>`; commit
`docs(plan): mark phase 04 complete`.
```

---

## Completion log

<!-- append: - <id> ✅ YYYY-MM-DD: <one-line summary> -->

- 4.1 ✅ 2026-07-10: deterministic mock inference core (MockAiProvider + content protocol +
  app-owned presets + latency knob wired from MOCK_LATENCY_MS), 100% coverage.
- 4.2 ✅ 2026-07-10: failure-injection engine (9 markers: 6 throw with pinned HTTP statuses, 3
  degrade modes), marker-stripped token math, table-driven spec, 100% coverage.
- 4.3 ✅ 2026-07-10: five workspace command endpoints (Zod DTOs, thin controller, metering via
  MeteringService.record, billing semantics for truncation/invalid-JSON/partial translations)
  plus the updatedAt DB-default migration the raw-SQL store adapter requires; e2e happy paths.
