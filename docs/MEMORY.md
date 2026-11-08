# TRADER — Memory

Read this first in every session; append to it last. It holds what the other documents do not:
how we got here, what has bitten us, and what the next session starts with. Progress itself
lives in [TASKS.md](TASKS.md); decisions live in [ARCHITECTURE.md](ARCHITECTURE.md).

## How to write here

- One entry per session, appended under **Log**, newest last:
  `### YYYY-MM-DD — one-line summary`, then three bullets — **Did**, **Decided** (or "nothing"),
  **Next** (a task in TASKS.md).
- A gotcha goes under **Notes** when it will bite again; a note is deleted when its cause is
  gone.
- Cap 200 lines. Within 20 lines of it, roll the oldest month of Log into one dated paragraph.

## Context

- TRADER is built by one person, Juan Pablo Vallejo, in his own name. The design partner and
  first pilot is a painting contractor in RI/MA with about 30 people. The pilot is unpaid;
  payment follows "V1 complete" as defined in PRD.md.
- The project went through research, a specification, a Phase 0–1 build with a working
  cursor-based sync core, two independent architecture reviews and an adjudicated synthesis
  (October 2026), then this rebuild. The decisions table in ARCHITECTURE.md is the synthesis
  outcome; the archived documents predate it.
- No vendor account is in use yet. Apple Developer (individual) and Google Play Console
  (personal) are enrolled; Clerk, Neon, Vercel, Sentry, PostHog and EAS are created in Stage 6.
- The archive: tag `archive/pre-rebuild` (35 commits) holds the previous repository in full —
  `docs/SPEC.md`, `LOGIC.md`, `DECISIONS.md`, `ROADMAP.md`, `ACCOUNTS.md`, `WORKLOG.md`, the
  Drizzle schema and migrations, the sync implementation, its tests, and both apps. Read it with
  `git show archive/pre-rebuild:<path>`. It is reference, not authority: it describes Stripe in
  V1, a keyset pull cursor, phone-number recovery and RLS deferred, all superseded.
- Worth salvaging when a stage needs it: the append-only trigger migration, the schema-invariant
  tests, the two-sided session validation and fold, the outbox reclamation logic, and the
  failure-injection tests for push and pull.

## Notes

- `work_session_events` is append-only by trigger and references `users` and `companies`, so
  fixtures can never be cleaned up: schema tests run in rolled-back transactions
  (`test/helpers.ts`), every statement on `tx`.
- Log roll-up: when headroom <30 after the session entry, roll the oldest entries one line
  each; Notes untouched.
- drizzle-kit never sees triggers or functions, or roles, grants, policies and FORCE. They live
  in `generate --custom` files, which start with a comment line to replace; a plain generate
  afterwards emits nothing. Separate statements with `--> statement-breakpoint`; pass flags
  without `--` (pnpm forwards them).
- Drizzle maintains `updated_at` through `$onUpdate` in the ORM, not the database: a raw SQL
  UPDATE leaves it stale. Write through Drizzle; `id` defaults in Postgres and needs nothing.
  Its stamp is the Node clock, `created_at` the database's: never assert one after the other.
- A BEFORE trigger answers before a CHECK: a fixture proving a CHECK must not trip a guard first.
- A JS Date holds milliseconds, `timestamptz` microseconds: a keyset cursor carrying a Date
  repeats rows; carry the row's id and read its timestamp back in SQL.
- A seed script may legitimately write `role` in an upsert; the same statement in a request
  path rewrites `role` and `active` on every sign-in. JIT provisioning reads a profile only when
  creating the row.
- The Neon serverless driver cannot reach a plain Postgres server; the driver seam selects `pg`
  locally.
- pnpm quarantines packages published within the last 24 hours
  (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`). Wait it out; never disable it.
- `@types/node` tracks the Node runtime, not the newest release. Change `node-version` in CI and
  `engines` first.
- `gh pr checks --watch` straight after `gh pr create` returns before the run registers; wait on
  the run by SHA: `gh run list --commit <sha>` then `gh run watch <id>`.
- Passkeys run in neither Expo Go nor an Android emulator; they need a development build on a
  physical device (iOS 16+ / Android 9+).
- A required status check must equal the literal CI job name; renaming the job silently
  disarms branch protection.
- Postgres 18 images take one mount at `/var/lib/postgresql`, data in a major-version
  subdirectory; the pre-18 `/var/lib/postgresql/data` mount makes the container refuse to start.
- `POSTGRES_PASSWORD` applies only when the volume is initialised. Changing it in `.env` later
  needs `docker compose down -v`, which also discards the data.
- Pending migrations run in one transaction (a fresh database replays the whole journal in one),
  so a label added by `ALTER TYPE … ADD VALUE` is unusable (55P04) in any CHECK, DEFAULT or index
  predicate in the journal, a Drizzle `check()` included. Name it in plpgsql, resolved at run time.
- A cascaded DELETE reaches the child's BEFORE DELETE trigger after the parent row is gone; a
  child trigger that looks its parent up must permit a missing parent (0010's line guard).
- `current_setting('app.company_id', true)` is `''`, not NULL, once any earlier transaction in
  the session set it locally, and `''::uuid` raises 22P02. Read it only via `app_company_id()`.
- The compose and CI user is a superuser and bypasses RLS whatever FORCE says; so does any Neon
  role made in the Console, CLI or API (`neon_superuser` has BYPASSRLS). RLS tests
  `SET LOCAL ROLE trader_app`.
- `SET LOCAL` takes no bind parameter; `set_config(name, $1, true)` does.
- Drizzle's `onConflict` target takes columns only; an expression unique index such as
  `lower(email)` needs a raw `ON CONFLICT`.
- FORCE with no policy for a role denies it every row: whatever writes as the owner needs
  `rolsuper` or `rolbypassrls` on the role itself (attributes are not inherited).
- A request clears `app.company_id` and both identity settings first, resolves the user under
  the identity settings, clears them, then sets `app.company_id` — all on one `tx`. The 0015
  guard refuses any update while an identity setting is present, except the bind itself.
- tRPC v11 `next()` never throws: a failed procedure returns `{ ok: false }`, and a middleware
  that returns it from inside `db.transaction` commits. Rethrow `result.error`. Its `ctx` is
  merged (`{ ...ctx, ...next.ctx }`): drop a field by passing it `undefined`.
- API tests commit fixtures, and the db and api suites run at once: anything global — an
  `identity_subject`, an email across companies — carries the run's suffix.
- A test pool takes `trader_app` by the startup parameter `-c role=trader_app`; `RESET ROLE`
  then restores it, so becoming the owner again is `SET ROLE NONE`.
- Every labor writer runs READ COMMITTED: `loadWorkerTimeline` (lock, read, `receivedAt`),
  `validateEvent`, insert, in one `tx`; it writes `receivedAt` as `server_timestamp`, so the
  schema's "now() is transaction time" comment is stale for pushes. Lock workers in id order.
- Duplicates are push's: `INSERT … ON CONFLICT (id) DO NOTHING RETURNING id`, then re-select;
  equal client columns (not stamp or skew) is `duplicate`, anything else `id_conflict`.
- A job switch in one batch with equal device times falls to `id` order: the phone must emit
  `ended` before `started` with a monotonic UUIDv7, or the start is rejected.
- Deferred constraint triggers never fire in a rolled-back test: `SET CONSTRAINTS … IMMEDIATE`
  fires them. TRUNCATE refuses a table with pending trigger events (55006).
- A foreign key naming a row another transaction has not committed fails at once (23503).
- plpgsql resolves `NEW.<column>` when the expression runs: a CASE naming two tables' columns
  fails 42703 on one of them; branch with IF.
- Procedures writing append-only rows are tested by calls inside a rolled-back owner transaction
  (api `helpers.ts`, "Rolled-back calls"); a failed call's savepoint also undoes its tenant.
- The review fingerprint's tuple is pinned by a golden vector recomputed outside the code; any
  change to the tuple, the fold or `workDate` is a new version, never an edit of v1.
- Row locks never catch a phantom: a material inserted or moved onto a day by a writer that skips
  the shared field-write lock escapes a closeout. Every material, sync and office writer takes it.
- The first sign-in bind updates `identity_subject` (a unique column), so it holds the caller's
  users row `FOR UPDATE`, which blocks foreign-key `KEY SHARE`: a future writer inserting rows
  that name that user while holding the field-write lock shared can deadlock with that caller's
  first closeout. Postgres aborts one; the call is retried. A first-sign-in `material.correct`
  waiting on the field-write lock behind such a closeout is the same case.
- `SET CONSTRAINTS x IMMEDIATE` lasts to the transaction's end: a second insert in the same
  transaction then fires the check before its partner row exists. Defer it again after firing.
- TRUNCATE … CASCADE locks its tables in turn and deadlocks (40P01 at ~1 s) with a suite that
  holds one and wants another; a TRUNCATE test takes its whole cascade set first with
  `lockExclusive` (NOWAIT, retried). day_closeouts' cascade reaches approvals.
- A constraint trigger queues a deferred event for every row it covers, even one it would
  pass; a queued event makes TRUNCATE fail 55006 before an append-only guard answers. Give it a
  WHEN that names the rows it checks (0022).
- `SELECT … FOR SHARE` needs UPDATE on the table: trader_app has none on `crew_members`, so push
  reads membership unlocked (ARCHITECTURE, push authority).
- `closeout.submit` locks the job row before the field-write lock, so a push on that job queues
  on the row, not the advisory lock, and gives up at its 2 s `lock_timeout` (omitted, retried).
- `pg` Pool `end()` resolves before the server's backends exit; `DROP DATABASE … FORCE` then kills
  them mid-close and the client raises an unhandled 57P01. `disposableDb` waits them out first.
- Real-commit tests run in `disposableDb()` (api helpers): the journal replayed into a new
  database, dropped after. Savepoint tests never prove a commit or a released lock.
- `0021` adds NOT NULL columns with no default to `work_session_events` and `materials`: it runs
  only where both are empty — every environment as of 2026-11-05. Count both before migrating any
  other database; rows need an authorized backfill migration, never a delete.
- `onConflictDoNothing()` with no target swallows every unique violation, not only the id's:
  where the table has a natural key, name the id as the target.
- `DrizzleQueryError`'s message holds the SQL and its params: never log or report `message`;
  report only through `reportFailure`.
- A Vercel env change reaches only a new deployment, and a rollback restores the old one's env:
  re-check `status.get` after any deploy or rollback.
- Comments written before the Stage 7/8 swap say `Stage 8` for invoicing, now Stage 7:
  `seed.ts:59`, `invoices.ts:77,112`, `invoice-line-items.ts:46,48,67`, `credit-memos.ts:60`
  (`packages/db/src`). Correct each when its file is next touched, in that task; delete this note
  then.
- A dev sign-in as the seed admin binds the seeded row, and `seed.test.ts` then fails on
  `identity_subject`: `DELETE FROM users WHERE email = 'admin@jpteq.app'`, then `pnpm db:seed`.
- `@trpc/*` peers are exact (`@trpc/client@11.23.0` wants `@trpc/server@11.23.0`): the three
  move together, pinned without a caret; a bump is one TASKS line naming all three.
- Under the quarantine pnpm resolves a caret to the newest version older than 24 h, not to
  `latest`: read `npm view <pkg> time` before stating the version a range will install.
- `seed.test.ts` counts the seed company's users: delete a manual check's rows there — memberships,
  jobs, crews, customers, `pay_rates`, then the invited users — before `pnpm check`, then reseed.
- A piped `pnpm check` reports the pipe's exit status: run it unpiped before committing.
- Drizzle's `db.transaction` runs on a client from `pool.connect()`, never through `pool.query`:
  a spy on the pool misses it, and pg's `connect` has a callback form and a promise form.

## Log

### 2026-10-09 → 2026-11-07 — rolled up

- 10-09 → 10-29: `archive/pre-rebuild` tagged, orphan `rebuild`, public repo, no trailers; six
  documents replace DECISIONS/ROADMAP/WORKFLOW/ADRs (Stripe, Resend, Inngest out); D Sierra
  Painting mark, accent `#2808AC`, `brand` red for the mark only; Compose Postgres 18 as
  `trader-local` (pre-rebuild volume untouched), `db:up`/`db:down`, `.env.example`, `.nvmrc`
  Node 24: Stages 0–1 closed; Stage 2 lines 1–4: Drizzle, `pg` seam, CI migrates, core tables,
  `uuidv7()` office ids, `0002` guard (23000), pay, approvals, voids, corrections; 53 tests.
- 11-03: Stage 2 lines 5–8: billing tables; `audit_log` (API-written, empty in V1); `trader_app`,
  grants, FORCE RLS on 17 tables, startup guard; owner-only seed; Stage 2 closed at 136 tests.
- 11-04: Smart Clock-In scoped in PRD (post-pilot), Stage 9; `rv.sh` retired. Stage 3 lines 1a–6:
  `0015` identity binding; tRPC, adapters, `me.get`; role gates; fold, `validateEvent`; `0016`–`0018`
  closeout, seal, freeze, field-write lock; fingerprint `v1.`; `0019`/`0020` corrections; 432 tests.
- 11-05: Stage 3 lines 7–10: `0021`–`0026` approval facts, `sync.push`/`sync.pull` (`3c97d4f` on a
  red run, flake fixed in `a807875`), approval queue and accounting, `labor.repair`; `report.ts`
  (minimized `ErrorReport`, `logReporter`, `reportingOnError`, reporter required in the context);
  `status.get` public, four states from `TRADER_SYNC_MODE` and minimum builds; 669 tests.
- 11-06: repair/push race pinned by queue order (670 tests). Pilot-scope documents: five decision
  rows, Stage 3 ticked, `row N` pinned to `779894f`, Stages 7 and 8 swapped; open: worker sign-in
  without email, credit ceiling and void, archived-job closeout, admin's own entries, assignment
  rules. Stage 4 line 1: `apps/web` host, route handler, cookie dev sign-in, shell; 683 tests.
- 11-07: Stage 4 line 2: `roster.*`, `me.update`, last-admin guard under one locking statement,
  race-tested; web tRPC client, `/roster`, `/profile`; 712 tests; `6c1a9fc` on a red run. Line 3:
  `customer.*`, `crew.*`, `job.*` under the crew and job row locks, the membership race proven
  against a real push; `sync.pull` led crews by role; `/customers`, `/jobs`, `/crews`; 754 tests;
  `2cb77de` on a red run. Owner: B7.1–B7.17 as recommended; open: office receipt entry.

### 2026-11-08 — Stage 4 line 4: demo fixture

- **Did:** `seed(executor, company = SEED)`; `pnpm demo` (`tsx` in `packages/api`): a pattern-locked
  database of its own, bootstrapped by the seed, every other write a persona's caller on an
  app-role pool; 32 steps, 259 events, 18 closeouts, 11 approvals, five reasons; refusal, `--reset`
  and partial-failure paths tested in disposable databases; 770 tests; one guard watched red.
- **Decided:** by the owner on 2026-11-08: plan v2's I-1 to I-10 as recommended; Figma is the
  exploration and review surface, written into DESIGN.md (Design tooling) with its decision row;
  the UX review is its own TASKS line before Stage 4 line 5.
- **Next:** the UX review line (TASKS:49), then Stage 4 line 5 (TASKS:50).
