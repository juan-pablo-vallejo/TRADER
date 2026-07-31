# @trader/db

Postgres schema and client, via [Drizzle](https://orm.drizzle.team). Schema lives in
`src/schema/`, one file per table group.

_What_ the data model is → [SPEC.md §4](../../docs/SPEC.md).
_Why_ it is that way → [DECISIONS.md](../../docs/DECISIONS.md).
This file is _how to run it_.

## Local development

```sh
pnpm db:up        # start Postgres 18 in Docker
pnpm db:migrate   # apply migrations
pnpm db:seed      # create the company row; optionally promote an admin
pnpm -r test      # verify the schema invariants
```

Set `USE_LOCAL_POSTGRES=true` in `.env`. `pnpm db:down` stops the container; add `-v` to
the compose command to discard the volume.

## Three things that will bite you

**Two drivers.** `@neondatabase/serverless` speaks HTTP/WebSocket to Neon's proxy and
**cannot connect to a plain Postgres server**. `src/client.ts` therefore selects `pg` when
`USE_LOCAL_POSTGRES=true` and the Neon driver otherwise. Both are wrapped by Drizzle, so
queries are written once.

**Two connection strings on Neon.** `DATABASE_URL` is pooled, for the app at runtime.
`DATABASE_URL_UNPOOLED` is direct and is used _only_ by `drizzle-kit` — DDL through
PgBouncer in transaction-pooling mode misbehaves.

**One hand-written migration.** `migrations/0001_append_only_guard.sql` installs the
triggers that make `work_session_events` immutable. drizzle-kit does not generate triggers,
so **do not regenerate it**, and add any future hand-written migration to
`migrations/meta/_journal.json` by hand — the runner silently skips what is not listed.

## Migrations

```sh
pnpm db:generate                  # diff the schema, emit SQL
pnpm db:migrate                   # apply
pnpm --filter @trader/db check    # report drift
```

## Invariants under test

`test/schema-invariants.test.ts` asserts these against a real database, because none can be
enforced by TypeScript. If one fails, the schema is wrong — not the test. Each is a numbered rule
in [LOGIC.md](../../docs/LOGIC.md)'s STORE group; cite the identifier, not this list.

- `work_session_events` rejects UPDATE, DELETE and TRUNCATE (STORE-1).
- Every `*_cents` column is integer-family, never floating point (STORE-2).
- Every tenant-scoped table has a non-nullable `company_id` (STORE-3).
- `server_timestamp` is `timestamptz(3)` and carries no sub-millisecond component (STORE-4) —
  two assertions, because the column type and the values written can drift apart.
