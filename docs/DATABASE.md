# Database

Postgres via [Drizzle](https://orm.drizzle.team). Schema lives in
`packages/db/src/schema/`, one file per table group.

## Running locally

Local development uses Docker Postgres, not Neon. Set `USE_LOCAL_POSTGRES=true` in `.env`.

```sh
pnpm db:up        # start Postgres 18 (docker compose)
pnpm db:migrate   # apply migrations
pnpm db:seed      # create the single company row; optionally promote an admin
pnpm --filter @trader/db test    # verify the invariants below
```

`pnpm db:down` stops it; add `-v` to the compose command to discard the volume.

### Why two drivers

`@neondatabase/serverless` speaks HTTP/WebSocket to Neon's proxy and **cannot connect to a
plain Postgres server**. `packages/db/src/client.ts` therefore selects `pg` (node-postgres)
when `USE_LOCAL_POSTGRES=true` and the Neon driver otherwise. Both are wrapped by Drizzle, so
queries are written once.

### Why two connection strings on Neon

`DATABASE_URL` is the **pooled** string, used by the app at runtime — many short-lived
serverless invocations. `DATABASE_URL_UNPOOLED` is the **direct** string and is used only by
`drizzle-kit`. Running DDL through PgBouncer in transaction-pooling mode is a known foot-gun:
session-scoped state that migrations depend on does not survive statement-level pooling.

## Migrations

```sh
pnpm db:generate   # diff the schema and emit SQL
pnpm db:migrate    # apply
pnpm --filter @trader/db check   # report drift
```

`migrations/0001_append_only_guard.sql` is **hand-written** — drizzle-kit does not generate
triggers. Do not regenerate it. New hand-written migrations must be added to
`migrations/meta/_journal.json` by hand, or the runner will silently skip them.

## Enforced invariants

These are asserted by `packages/db/test/schema-invariants.test.ts` against a real database,
because none of them can be enforced by TypeScript.

**`work_session_events` is append-only.** UPDATE, DELETE and TRUNCATE all raise. SPEC §5
states that no role — _including admin_ — may mutate a submitted labor record, and this is
what payroll trust rests on. It is a trigger rather than a permission because the application
owns these tables and could re-grant itself anything; a trigger fires regardless of who asks.
TRUNCATE needs its own guard, as it bypasses row- and statement-level UPDATE/DELETE triggers.

Corrections are therefore new `voided` or correcting events referencing the original through
`payload`. There is deliberately no corrections table and no in-place edit.

**Money is integer-family.** Every `*_cents` column must be `bigint`/`integer`, never
`numeric` or floating point. `bigint` rather than `integer` because int4 caps at ~$21.4M in
cents. Material and line-item _quantities_ are `numeric` by contrast — they are multiplied by
unit costs to produce money, so binary rounding error there would leak into job costs.

**Every tenant-scoped table has a non-nullable `company_id`.** This is the seam RLS attaches
to when a second tenant onboards (SPEC §4). It is carried even where derivable — on
`crew_members` and `invoice_line_items` — because a policy that has to join to find the tenant
is a policy that gets written wrong.

## Not stored, by design

- **`work_date`** — derived server-side from `client_timestamp` in the company's timezone
  (SPEC §3). Never a column, never user-editable.
- **Current session** — a fold over the event stream, never a mutable row.
- **`payments` / `payouts` / `client_portal_access`** — designed for in SPEC §4, created in
  Phase 5. They attach to existing tables; nothing here restructures.

## Known gap

`users.pay_rate_cents` is mutable, so editing it retroactively changes historical job costs.
SPEC §8 flags this; effective-dated rates or a rate snapshot at session time must replace it
before payroll history can be trusted. Due by Phase 2 and tracked in
[DECISIONS.md](DECISIONS.md).
