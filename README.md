# TRADER

Phone-first daily closeout and job costing for small painting contractors. A field crew records
labor, materials and job progress on their phones — offline if necessary — and the office
approves, exports payroll, and invoices from the same record.

In build, pre-pilot. Where it stands → [docs/TASKS.md](docs/TASKS.md).

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
POSTGRES_DB=trader_demo DATABASE_URL= TRADER_DEV_IDENTITY=enabled pnpm --filter web dev
```

## Layout

| Path           | Holds                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| `apps/web`     | The office web app (Next.js) and the API's HTTP host                      |
| `packages/api` | The tRPC API: `core/` request plumbing, one folder per domain, `routers/` |
| `packages/db`  | Drizzle schema, migrations, seed and the database invariant tests         |
| `assets/brand` | The mark and the icon                                                     |
| `docs`         | The six documents below                                                   |

The field app (`apps/mobile`) is not built yet; it is Stage 5 of [docs/TASKS.md](docs/TASKS.md).

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
