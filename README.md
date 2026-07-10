# nest-ai-tokens-example

The canonical reference application for [`@bymax-one/nest-ai-tokens`](https://github.com/bymaxone/nest-ai-tokens),
a NestJS 11 library for AI token metering and usage-based billing. This repository is a pnpm
monorepo being built toward a NestJS 11 API (`apps/api`) and a Next.js 16 dashboard (`apps/web`),
backed by Postgres 17, that together will demonstrate every public export and documented behavior
of the library against a deterministic mock AI provider. No real AI provider credentials are ever
required or used.

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

## Demo identity (simulation only)

The API resolves its caller from two plain request headers: `x-demo-user` (one of `ada`, `grace`,
`linus`, `root`) and an optional `x-tenant-id` override. **This is a simulation, not
authentication**: headers are not a trust boundary and nothing is verified. It exists so the
dashboard can switch identities without dragging an auth stack into a ledger example. A real
service must materialize `req.user` from verified credentials (for example JWT claims via
`@bymax-one/nest-auth`); that verified identity is exactly what the library's `scopeResolver`
should read. Unknown demo users receive a 401 listing the valid ids; requests without the header
proceed unauthenticated.

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

## Library consumption

The example consumes `@bymax-one/nest-ai-tokens` as an external package, never as a workspace
member, so it always validates the published API surface. Three linking modes, in order of
project maturity:

```bash
# (a) Before the library is on npm: local file link (the current mode).
#     apps/api/package.json -> "@bymax-one/nest-ai-tokens": "file:../../../nest-ai-tokens"
#     Requires the sibling checkout to be built once:
pnpm -C ../nest-ai-tokens install && pnpm -C ../nest-ai-tokens build

# (b) After publish: the real registry range.
#     "@bymax-one/nest-ai-tokens": "^0.1.0"

# (c) Iterative library development: watch rebuild on the library side + link.
pnpm --dir ../nest-ai-tokens build --watch &
pnpm link ../nest-ai-tokens
```

In CI the org-shared setup action clones and builds the library beside the workspace so the
`file:` dependency resolves identically. `node scripts/probe-subpaths.mjs` proves that both
published subpaths (`.` and `./shared`) resolve through the package's real `exports` map under
Node ESM; it runs as a dedicated CI job on every pull request. `openai` is intentionally not
installed anywhere in this repository: the example runs a custom deterministic provider, proving
the library's optional-peer claim.

## Quick start

The data layer is runnable today; the API and web apps land as the phased plan progresses:

```bash
pnpm install                              # resolves the file: library link
pnpm infra:up                             # Postgres 17 via docker compose (healthcheck-gated)
cp .env.example .env                      # local-only defaults
pnpm --filter api run prisma:migrate:dev  # create the reference schema
pnpm --filter api run prisma:seed         # deterministic demo data (idempotent)
node scripts/probe-subpaths.mjs           # verify the library link
```

Once the API and web app exist, `pnpm dev` boots both.

## License

[MIT](LICENSE)
