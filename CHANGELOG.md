# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-10

The complete reference application for `@bymax-one/nest-ai-tokens` v0.1.0.

### Added

- **`apps/api` (NestJS 11):** the full metered workspace over the library: five inference
  commands plus single/batch embeddings against a deterministic mock provider with failure
  markers; the append-only ledger surface (list, detail, credits, refund); effective-dated
  pricing (catalog, per-model history, admin window close, idempotent boot seed); usage
  analytics (balance, by-period/feature/model, top consumers, system costs); wallet and budget
  enforcement (hold/capture/release lifecycle, estimator lab, budget admin, combined access
  status); multi-tenant scope resolution with an optional strict mode; and a 26-code error
  catalog (15 library + 11 host codes) with on-demand triggers. 424 unit tests at 100% coverage
  on all four metrics and 198 Testcontainers e2e tests, including an exhaustive route inventory
  diffed against the live router.
- **`apps/web` (Next.js 16):** the eight-page dashboard (Overview, Playground, Ledger, Pricing,
  Usage, Quota Lab, Tenants, Errors) on the shared Bymax design system, driven by a typed api
  client built exclusively on the library's browser-safe `./shared` subpath (CI-enforced). 305
  tests at 100% coverage plus a shell integration suite; every spec §13 scenario is walkable in
  the browser.
- **Export audit gate:** `scripts/audit-library-exports.mjs` (`pnpm audit:exports`, a CI job)
  enumerates every real export of the installed library across its five subpaths and fails
  unless each is imported by the apps or explicitly justified in the spec's Feature Coverage
  Matrix; the gate's failure modes are themselves unit-tested, including a mutation of a copy of
  the real spec.
- **Persistence:** the library's reference PostgreSQL schema replicated verbatim via Prisma 7
  (BigInt nano-USD money, partial indexes), with the shipped `PrismaAiTokensStore` adapter bound
  as the single store and a deterministic, idempotent demo seed.
- **Repository foundation:** pnpm workspace, strict TypeScript, ESLint 9 flat config, Prettier 3,
  husky commit governance (lint-staged and commitlint), CI as a thin caller of the org-wide
  reusable pipeline (lint, typecheck, format, unit coverage, api e2e, web build, export audit,
  subpath probe, web import guard), and visibility-conditional CodeQL and OpenSSF Scorecard
  workflows that activate without edits when the repository goes public.
- **Documentation:** the technical specification with its reconciled, audit-enforced Feature
  Coverage Matrix; the phased development plan with per-phase task files and Reconciliation
  notes mapping the drafted design onto the shipped library surface; and the publishable README
  with quick start, scenario walkthrough, and curl tour.

[0.1.0]: https://github.com/bymaxone/nest-ai-tokens-example/releases/tag/v0.1.0
