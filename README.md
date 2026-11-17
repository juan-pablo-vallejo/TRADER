# TRADER

Phone-first daily closeout and job costing for small painting contractors. A field crew records
labor, materials and job progress on their phones — offline if necessary — and the office
approves, exports payroll, and invoices from the same record.

In build, pre-pilot. Where it stands → [docs/TASKS.md](docs/TASKS.md).

## How it fits together

One TypeScript monorepo. The phone app captures events offline into a local outbox and syncs
them; the office app reviews, approves, closes pay periods and invoices; both talk to one tRPC
API, served by the web app's route handler, over one Postgres database with row-level
security per company.

| Path           | Holds                                                                      |
| -------------- | -------------------------------------------------------------------------- |
| `apps/web`     | The office web app (Next.js) and the API's HTTP host; `e2e/` browser flows |
| `apps/mobile`  | The field app (React Native, Expo): clock, schedule, outbox; `.maestro/`   |
| `packages/api` | The tRPC API: `core/` request plumbing, one folder per domain, `routers/`  |
| `packages/db`  | Drizzle schema, migrations, seed, staging promotion, invariant tests       |
| `assets/brand` | The mark and the icon                                                      |
| `docs`         | The six documents below                                                    |

Stack, invariants, the sync protocol, environments and every decision →
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it locally

Needs Node 24, pnpm and Docker. Nothing here touches a deployed service.

```sh
cp .env.example .env        # then set POSTGRES_PASSWORD to anything
pnpm install
pnpm db:up                  # Postgres 18 in Docker, on 127.0.0.1:5432
pnpm db:migrate
pnpm db:seed                # one placeholder company and its admin
pnpm check                  # typecheck, lint, format check, tests
pnpm demo                   # a populated demo company in its own database, trader_demo
```

To browse the office app against the demo data, start it with the demo database and the
development sign-in on, then sign in at `/dev-signin` as `office@demo.invalid`:

```sh
POSTGRES_DB=trader_demo DATABASE_URL= TRADER_DEV_IDENTITY=enabled pnpm --filter @trader/web dev
```

The field app needs Xcode or Android Studio and runs as a development build, never Expo Go:

```sh
pnpm --filter @trader/mobile ios        # or: android
apps/mobile/.maestro/suite.sh           # the device flows, against a local API
```

## Commands

| Command                         | Does                                                                |
| ------------------------------- | ------------------------------------------------------------------- |
| `pnpm check`                    | Typecheck, lint, format check and every test; run before a commit   |
| `pnpm test`                     | Tests alone; they need the local database and refuse a deployed one |
| `pnpm format` · `pnpm lint:fix` | Rewrite formatting; apply lint fixes                                |
| `pnpm build`                    | Build every package and the web app                                 |
| `pnpm db:generate`              | A new migration from a schema change                                |
| `pnpm demo --reset`             | Rebuild the demo database after a migration or a manual check       |
| `pnpm e2e:staging`              | The browser flows against a staging deployment                      |

One test file: `pnpm exec vitest run <file>` from its package's directory.

## Configuration

[.env.example](.env.example) is the whole contract: every variable, with a safe placeholder
and what reads it. Local work needs only the database password. Deployed values live with
their platforms and are never committed.

## Contributing

One change per branch and pull request into `main`; the `check` job must pass; the owner
merges. A merge is migrated and deployed to staging and verified there by a workflow, with
no further step. A release is a pull request from a staging-verified commit of `main` into
`production`, merged by the owner. Commit, review and release rules →
[docs/RULES.md](docs/RULES.md); the runbook → [packages/db/README.md](packages/db/README.md).

## Documentation

Each fact has one home; this README links and does not restate.

| Document                                     | Owns                                                             |
| -------------------------------------------- | ---------------------------------------------------------------- |
| [docs/PRD.md](docs/PRD.md)                   | What it is for: problem, goals, users, V1 features               |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it is built: stack, invariants, sync, folder tree, decisions |
| [docs/RULES.md](docs/RULES.md)               | How work is done: principles, standards, structure, git, CI      |
| [docs/DESIGN.md](docs/DESIGN.md)             | How it looks: principles, palette, type, components              |
| [docs/TASKS.md](docs/TASKS.md)               | The build order and what is done                                 |
| [docs/MEMORY.md](docs/MEMORY.md)             | Project memory: context, gotchas, session log                    |
| [CLAUDE.md](CLAUDE.md)                       | The session contract for Claude Code                             |

## License

© 2026 Juan Pablo Vallejo. All rights reserved. Public for transparency; no license to use,
copy or redistribute is granted. See [LICENSE](LICENSE).
