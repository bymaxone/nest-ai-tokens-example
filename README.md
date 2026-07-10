# nest-ai-tokens-example

The canonical reference application for [`@bymax-one/nest-ai-tokens`](https://github.com/bymaxone/nest-ai-tokens),
a NestJS 11 library for AI token metering and usage-based billing. This repository is a pnpm
monorepo containing a NestJS 11 API (`apps/api`) and a Next.js 16 dashboard (`apps/web`), backed
by Postgres 17, that demonstrates every public export and documented behavior of the library
against a deterministic mock AI provider. No real AI provider credentials are ever required or
used.

## Status

Under construction. This project is being built phase by phase; see
[`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) for the roadmap and progress dashboard, and
[`docs/tasks/README.md`](docs/tasks/README.md) for the per-phase task breakdown.

## What this demonstrates

- The append-only token transaction ledger, versioned effective-dated pricing, prepaid wallets,
  and multi-dimension quota enforcement provided by `@bymax-one/nest-ai-tokens`.
- A multi-tenant AI workspace where commands, embeddings, and system jobs debit a ledger backed
  by Postgres and Prisma, with a dashboard that renders every capability in real time.
- The copy-paste-grade integration patterns other projects can lift directly: the module wiring,
  both Prisma repository implementations, a custom `IAiProvider` adapter, and the dual-subpath
  (`.` and `./shared`) shared-types pattern.

See [`docs/TECHNICAL_SPECIFICATION.md`](docs/TECHNICAL_SPECIFICATION.md) for the full technical
blueprint.

## The Bymax One reference family

This project is one of a family of reference applications, each dogfooding a `@bymax-one/*`
NestJS library end to end:

- [`nest-auth-example`](https://github.com/bymaxone/nest-auth-example)
- [`nest-logger-example`](https://github.com/bymaxone/nest-logger-example)
- [`nest-cache-example`](https://github.com/bymaxone/nest-cache-example)

## Documentation

- [`docs/TECHNICAL_SPECIFICATION.md`](docs/TECHNICAL_SPECIFICATION.md): the normative technical
  blueprint (architecture, feature coverage matrix, API surface, testing strategy).
- [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md): the phased execution plan and progress
  dashboard.
- [`docs/tasks/README.md`](docs/tasks/README.md): the per-phase task breakdown.

## Quick start

Application code and a runnable quick start land as the phased plan progresses. Once the API and
web app exist:

```bash
pnpm install
pnpm infra:up
pnpm dev
```

## License

[MIT](LICENSE)
