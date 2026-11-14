# @trader/db — deployed database runbook

How a deployed database is migrated, given its application role, onboarded and restored.
Decisions live in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) (rows of 2026-11-12, Release
0.1 R3); this file is the procedure. Local development needs none of it: `pnpm db:up`,
`pnpm db:migrate`, `pnpm db:seed`.

On production every command here is run by the owner, from a terminal on the owner's
machine, with the connection string typed into that shell and nowhere else. On staging the
same commands are also run by Claude Code, through wrappers on the owner's machine that take
a connection string from the macOS Keychain, refuse any host but staging's and hand the
string to one fixed command (ARCHITECTURE, 2026-11-14 staging autonomy; RULES, Toolbox):

| Wrapper command         | Connects as                         | Approval                         |
| ----------------------- | ----------------------------------- | -------------------------------- |
| application-role `psql` | `trader_app`, pooled endpoint       | none                             |
| owner-role `onboard`    | the owner, direct endpoint          | none                             |
| owner-role `psql`       | the owner, direct endpoint          | each use                         |
| Neon CLI                | a key scoped to the staging project | restore, reset, delete: each use |

A connection string is never written into `.env`, the repository, a deployment's build or
CI, and never shown to an assistant's session.

## Two connections, two roles

| Used for                            | Endpoint                    | Role                    |
| ----------------------------------- | --------------------------- | ----------------------- |
| Migrations, onboarding, `pg_dump`   | direct (no `-pooler`)       | the database's owner    |
| The deployment's own `DATABASE_URL` | pooled (host has `-pooler`) | `trader_app`, its login |

The pooled endpoint is PgBouncer in transaction mode: it accepts no `SET`, no session
advisory lock and no startup `options`. The application needs none of them. Migrations and
`pg_dump` do, so they never go through it.

`trader_app` is created by migration `0013`, in SQL. Never create it, or any role the
application uses, in Neon's console, CLI or API: a role made there can bypass row-level
security. The owner role is the one Neon made with the project; on Neon it carries
`rolbypassrls` itself, which is why it can write under forced row-level security.

## Before the first migration of a database

1. The project's Postgres version is 18 (`select version()`): the schema uses `uuidv7()`.
2. `public` is empty: drop any sample table the console created.
3. The owner can do what the journal needs. Both of the owner's columns must be `t`:

   ```sql
   select rolname, rolsuper, rolbypassrls, rolcreaterole
   from pg_roles where rolname = current_user;
   ```

   If `rolbypassrls` is `f`, stop: onboarding and backups need a decision first.

## Migrating

```sh
cd <repository>
DATABASE_URL='<direct endpoint, owner>' pnpm db:migrate
```

- **Order against deploys: migrate first, then deploy.** Migrations are additive
  (ARCHITECTURE, invariant 8), so the code already running keeps working against the newer
  schema; the reverse order runs new code against a schema it does not have.
- **Pending migrations run in one transaction.** A failure leaves the database as it was.
- **A failed or wrong migration is rolled forward**: a new migration that corrects it. A
  migration that has run anywhere is never edited, and none is ever deleted from the journal.
- **`0021` precondition.** `0021` adds `NOT NULL` columns with no default to
  `work_session_events` and `materials`, so it runs only where both are empty — every new
  database. Before migrating any database that predates `0021`, count both; rows there need
  an authorized back-fill migration, never a delete.
- A deployment never migrates: not in its build, not at start. CI migrates only its own
  service container.

After migrating, confirm what the journal made:

```sql
select count(*) from drizzle.__drizzle_migrations;          -- the number of files in migrations/
select rolcanlogin, rolsuper, rolbypassrls, rolinherit
from pg_roles where rolname = 'trader_app';                 -- t, f, f, f
```

### Proving nothing differs from the journal

The first time a database is migrated, and after any migration with hand-written SQL,
compare its schema with a fresh local replay of the same commit:

```sh
POSTGRES_DB=trader_schema_check DATABASE_URL= pnpm db:migrate     # after `create database`
pg_dump --schema-only --no-owner --no-privileges -d '<local trader_schema_check>' > local.sql
pg_dump --schema-only --no-owner --no-privileges -d '<direct endpoint, owner>'    > deployed.sql
diff local.sql deployed.sql
```

Nothing but comment lines naming the server version may differ. Grants are compared
separately, since `--no-privileges` leaves them out:

```sql
select table_name, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where grantee = 'trader_app' group by table_name order by table_name;
```

Keep both dumps out of the repository; drop `trader_schema_check` afterwards.

## The application role's password

Once per database, after its first migration, in a SQL session as the owner:

```sql
alter role trader_app password '<generated>';
```

Generate it (`openssl rand -base64 32`); Neon refuses a weak one. It lives in the deployment's
`DATABASE_URL` and the owner's password manager, nowhere else. A console's query history
keeps the statement's text: delete that entry. The deployment's `DATABASE_URL` is the
**pooled** connection string with the role and password replaced by `trader_app` and this
one.

A deployment checks its own login: `GET /api/ready` answers 200 only when the connection
logged in as `trader_app`, which is neither a superuser nor able to bypass row-level
security, and every tenant table has row-level security forced. Pointed at the owner's
connection string it answers 503.

## Onboarding a company

A company, its invoice number counter and its first admin are written by one script, as the
owner, over the direct endpoint. Everyone after the first admin is invited from the office.

```sh
DATABASE_URL='<direct endpoint, owner>' pnpm --filter @trader/db onboard \
  --company '<name>' --timezone America/New_York \
  --next-invoice <n> --next-credit-memo <n> \
  --admin-name '<name>' --admin-phone +1XXXXXXXXXX [--admin-email <address>]
```

- **It is a dry run until `--apply` is added.** Without it every statement runs and is rolled
  back, and the script prints the database's name and the ids it would have written. Read
  the database's name before running it again with `--apply`.
- `--next-invoice` and `--next-credit-memo` are the next numbers to issue: where the
  contractor's own series continues. They cannot be lowered afterwards.
- `--admin-phone` is the number the admin signs in with, `+1` and ten digits, typed as it
  will be matched. An email is optional.
- It refuses a company name that exists, and a number or email already on any roster.
- It tells the identity provider nothing. Create the admin's user there with the same
  number; their first sign-in binds it to the row.
- It writes no audit row: record each onboarding in `docs/MEMORY.md`.

## Restoring

Release 0.1 relies on Neon's point-in-time restore of a project's root branch; the window
is the plan's (ARCHITECTURE, 2026-11-12 Release 0.1 backups).

1. Note the time to restore to, in UTC, before the fault.
2. Restore the branch to that time in Neon (Backup & Restore). Neon keeps the replaced
   state as a branch of its own; leave it until the restore is confirmed good.
3. Check `GET /api/ready` on the deployment, then one office screen. Roles and their
   passwords are stored in the database, so a restore to a time before `trader_app` was
   given its password would undo it: a 503 here after a restore means set it again (above).
   Whether Neon restores roles with a branch is confirmed by the first drill and written
   here then.
4. Record the start, the end and what was lost in `docs/MEMORY.md`.

A restore discards every write after the chosen time, in every company. It is the owner's
decision each time.
