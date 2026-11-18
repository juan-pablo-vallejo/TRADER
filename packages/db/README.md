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
the `check` job, and never shown to an assistant's session. Staging's two migrator strings
— its default branch's and the rehearsal branch's, each the direct endpoint as the owner —
are also secrets of the GitHub environment `staging`, which only the promotion workflow on
`main` can read (ARCHITECTURE, 2026-11-16, staging credentials). Production's is in neither.

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
TRADER_MIGRATE_PURPOSE=owner DATABASE_URL='<direct endpoint, owner>' pnpm db:migrate
```

- **A deployed database is never migrated by accident.** With `DATABASE_URL` set, every
  `drizzle-kit` command refuses to run unless `TRADER_MIGRATE_PURPOSE` says who is asking:
  `promotion` (the workflow below) or `owner` (this runbook, for a database the workflow
  does not serve — production). Staging is the workflow's alone.

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
- A deployment never migrates: not in its build, not at start. The `check` job migrates
  only its own service container.

### Staging: the promotion workflow

Staging is migrated by `.github/workflows/promote-staging.yml` and by nothing else
(ARCHITECTURE, 2026-11-16, staging promotion and migration gate). After a merge into `main`
whose `check` passed it reads both databases' applied migrations against the commit's
journal, applies the pending ones to the rehearsal branch, and holds that branch to the
journal exactly and to the schema of a fresh replay (`src/promotion/fingerprint.ts`: the
catalog as sorted lines, no owner, no data). Only then, and only when every pending
migration is past the owner's gate (`OWNER_GATED_THROUGH`, `src/promotion/plan.ts`) and the
reading flags none of them (`src/promotion/reading.ts`), it runs the same command against
staging and checks staging the same way.

Then it deploys (ARCHITECTURE, 2026-11-17, two branches and a release by pull request).
The `deploy` job calls the staging project's deploy hook, a secret of the `staging`
environment (`STAGING_DEPLOY_HOOK`), which builds `main`'s head as that project's
Production deployment. A hook takes no commit, so the job calls it only while `main`'s head
is the run's commit; when `main` has moved on it deploys nothing and the newer commit's run
does. The `verify` job waits until the host's `/api/ready` names the run's commit, and only
then runs the browser suite. The `report` job writes the outcome as the commit's `staging`
status, which a release later requires:

```sh
gh api repos/<owner>/<repo>/commits/<sha>/status --jq '.statuses[] | select(.context == "staging")'
```

Nobody dispatches anything for this: a merge is the whole of it. A red run names
where it stopped: `before-staging-change`, `migrated-not-deployed` or `deployed-failing`.
After `migrated-not-deployed` staging runs the earlier code on the newer schema, which
additive migrations allow; the next merge, or a re-run of the failed jobs while `main` is
still at that commit, deploys it.

Anything else stops before staging changes, and the run's summary names the pending
migrations, their flags and the dispatch that would apply them. That dispatch is the
owner's, from the Actions page or a terminal:

```sh
gh workflow run promote-staging.yml --ref main -f mode=rehearse-only
gh workflow run promote-staging.yml --ref main -f mode=promote -f authorize_through=<the report's code>
```

The first never migrates staging. The second is refused unless the repository's owner
started it, the rehearsal branch already holds the journal from an earlier run, and the
code is the one that run's summary printed: it is made from the commit and from every
pending migration's tag and content hash, so a commit merged since, an edited migration or
a different pending set each need a new report. An authorized run never rehearses. Before
either, the plan step holds each migrator string to the endpoint id stated for it in the
`staging` environment (`STAGING_ENDPOINT_ID`, `REHEARSAL_ENDPOINT_ID`, the direct
endpoint's id as Neon prints it): a pooled string, another endpoint or one id stated twice
stops the run before any connection. A flag is a reason to read
the migration, not a verdict: an `ALTER TYPE … ADD VALUE`, a dropped constraint and a
`REVOKE` are all flagged. The rehearsal branch is never reset by the workflow; a branch
that no longer stands between staging and the journal stops the run, and its reset is
approved one at a time.

After migrating, confirm what the journal made:

```sql
select count(*) from drizzle.__drizzle_migrations;          -- the number of files in migrations/
select rolcanlogin, rolsuper, rolbypassrls, rolinherit
from pg_roles where rolname = 'trader_app';                 -- t, f, f, f
```

**The staging Vercel project, set once by the owner.** "Production" below is Vercel's word
for the project's main branch; every value is staging's, and nothing of the customer-facing
application is ever entered there.

1. Production branch: `main` (as it is).
2. Every variable applies to Production as well as Preview: `DATABASE_URL` (the pooled
   `trader_app` string of the staging database), both Clerk keys of the development
   instance, `SENTRY_DSN`, `RESEND_API_KEY`, `MAIL_FROM`, `INVOICE_EMAIL_ALLOWLIST`;
   `CLERK_AUTHORIZED_PARTIES` for Production is the staging host's origin;
   `TRADER_ENVIRONMENT` is `staging` for both.
3. Ignored Build Step: none. (`apps/web/vercel.json` already stops a push to `main`
   building; a pull request's branch still gets its Preview.)
4. One deploy hook, for `main`; its address is the secret `STAGING_DEPLOY_HOOK` of GitHub's
   `staging` environment and is kept nowhere else.
5. The staging host is the project's Production domain, with its Deployment Protection
   exception; every other deployment stays behind the wall.

### A change that cannot ship in one step

The schema moves before the code, and for a while the earlier code runs on the newer
schema — minutes on staging, as long as the owner chooses on production. An additive
migration is safe by construction. A rename, a narrowed type, a new requirement on old rows
or a removed column is three merges, each verified on staging before the next: **expand**
(add the new shape beside the old, written by both), **move** (the code reads and writes
the new shape alone), **contract** (drop the old; flagged by the reading, so it waits for
the owner's code). No migration is ever written against the code of the same merge alone.

### Releasing to production

Owned by the owner end to end; a session prepares a release and stops (RULES, Git and CI).
None of it exists yet, and nothing here is run by a workflow of staging's.

A release:

1. Choose a commit of `main` whose `check` passed and whose `staging` status is `success`,
   after the owner's own testing on staging.
2. Branch `release/<short sha>` at exactly that commit and open a pull request into
   `production`. `main` moving on changes nothing in it; a newer commit is a new candidate.
3. The pull request's description states the commit, the changes since the last release,
   every migration production has not had with the reading's flags, and how each is undone.
4. The required checks pass for that commit: `check`, and `release`, which holds the head to
   a commit of `main` carrying a successful `staging` status (TASKS P6: not built yet;
   until it is, the owner reads the status with the command above).
5. The owner migrates the production database (`TRADER_MIGRATE_PURPOSE=owner`, the direct
   endpoint, Order against deploys above), then merges. The production Vercel project
   builds `production`; the owner reads `/api/ready` and the error reports.

Setting production up, in the order that cannot deploy early. Existing on 2026-11-17: the
repository, `main`'s protection, the DNS zone, and a second Vercel project on this
repository that builds nothing. Everything else is missing.

1. **Ruleset `production`** (GitHub, Settings → Rules; target branch `production`):
   restrict deletions; block force pushes; require a pull request before merging, with 0
   required approvals; require status checks `check` and `release`; no bypass list. `main`
   already has its equivalent as branch protection: pull request, `check`, administrators
   included, no force push, no deletion, 0 approvals. No rule requires a second reviewer:
   one person owns this repository.
2. **GitHub environment `production`**, deployment branch `production` alone, for whatever
   a production workflow later needs. No pull request's workflow reads it.
3. **Neon production project**, separate from staging's: its owner role, the journal
   applied by the owner as above, `trader_app` given its login (The application role's password, below). Paid
   history for restores is a cost decision.
4. **Clerk production instance** on its own keys and domain records. SMS codes need the
   paid plan: a cost decision.
5. **The production Vercel project**: Production branch `production`; its own variables —
   the production database's pooled `trader_app` string, the production Clerk keys,
   `CLERK_AUTHORIZED_PARTIES`, its own `SENTRY_DSN`, mail's three, and
   `TRADER_ENVIRONMENT=production` — entered for Production only, so no Preview or pull
   request ever holds them; the customer domain attached last.
6. **Then the branch**: `production` is created by the first release above, from a
   staging-verified commit, never from `main`'s head by hand.

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
- It writes no audit row: record each onboarding in `docs/LOG.md`.

## Restoring

Release 0.1 relies on Neon's point-in-time restore of a project's root branch; the window
is the plan's (ARCHITECTURE, 2026-11-12 Release 0.1 backups).

1. Note the time to restore to, in UTC, before the fault.
2. Restore the branch to that time in Neon (Backup & Restore). Neon keeps the replaced
   state as a branch of its own; leave it until the restore is confirmed good.
3. Check `GET /api/ready` on the deployment, then one office screen. Roles and their
   passwords are stored in the database, so a restore to a time before `trader_app` was
   given its password would undo it: a 503 here after a restore means set it again (above).
   The first drill (2026-11-14, a branch made from a past instant of staging) carried
   `trader_app` with its login attribute and its grants; a login with its password on the
   restored state was not tried.
4. Record the start, the end and what was lost in `docs/LOG.md`.

A restore discards every write after the chosen time, in every company. It is the owner's
decision each time.
