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
- No cap. A month of Log is rolled into one dated paragraph once nobody reads its entries.

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
- A job switch is two records in one batch, each validated at its own receipt in batch order:
  the phone must send `ended` before `started` (and mint their UUIDv7 ids in that order), or
  the start is rejected as overlapping an open session.
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
- Browse the demo with `POSTGRES_DB=trader_demo DATABASE_URL= TRADER_DEV_IDENTITY=enabled` on the
  web `dev` script as the demo admin: nothing is written. Signing in as `sam.carter` binds him.
- A protected call sets `lock_timeout` 5 s and `statement_timeout` 20 s in its own transaction
  (`core/trpc.ts`). A test that calls a procedure inside a rolled-back transaction with a short
  wait of its own must build its context with `waits: "inherit"` (`callerIn`, `appCallerIn` do),
  or the procedure's defaults replace the test's and it waits the full 5 s.
- Tests and the seed throw at start while `DATABASE_URL` is set (`assertLocalDatabase`). To run
  them, blank it; never point them at Neon.
- `next dev` sometimes enters an endless "Fast Refresh rebuilding" reload on the first page
  load after a start (seen 3 times in about 12 starts on 2026-11-11, with and without the
  response headers, never in a built app). Cause not found; one guess is another process
  touching the repository while Turbopack watches it. Restarting the dev server clears it.
- A table body built as `rows.map((r) => [<tr key>, <tr key>])` is keyed by position at the
  outer level: when a row moves, React remounts its editor and its state (the result note) is
  gone. Wrap the pair in `<Fragment key={r.id}>`.
- `pnpm --filter web …` matches no package and exits 0 without running anything; the package is
  `@trader/web`. Read the output, not the exit status.
- `trader_demo` is migrated when `pnpm demo` creates it: after a new migration, rebuild it with
  `pnpm demo --reset` before relying on it.
- tRPC runs a gate's middleware before input validation, so a call with no input answers the
  gate (UNAUTHORIZED, FORBIDDEN) or BAD_REQUEST without writing: the gate inventory test relies
  on it.
- Until their Stage 4 tasks land, code and comments still carry rules the `V1-Dnn` rows
  superseded: `approval.decide`, 0022, 0025 and 0026 treat an admin's own labor like
  anyone's (V1-D10 as amended); `materials.ts` describes an office writer that does not
  exist. The documents are right; correct each in its task and delete this note when the
  last is done.
- A push judges a labor event's time against the database clock, which no test can set: an
  event pushed as captured online more than five minutes before now is `clock_skewed` and
  pending. A test of a clean capture times its events inside the tolerance of `Date.now()`;
  a test about a calendar day pushes `capturedOffline: true` and expects `offline`. Fixtures
  inserted as the owner never pass through push. A fixture dated after today is refused.
- The demo's history is `captured_offline` for the same reason; `EXPECTED.decided` counts the
  backlog the demo admin approves, so a new seeded event changes it.
- `sync_diagnostics` references `users` and `companies`: a test's cleanup deletes its lines
  first, and any authenticated `sync.push` that fails or refuses a record on committed fixtures
  writes one — a bad-input call in the gate inventory included.
- The diagnostics write resolves its caller with `bind: false`. Resolving the ordinary way
  would make a failed push's diagnostics transaction perform the first sign-in the push
  itself gave up on (seen: "binding nothing" in `push-commit.test.ts` turned red).
- An unparseable body on `sync.push` reaches the sync procedure in tRPC 11.23.0 (input is read
  inside the call) and leaves a `request_failed` line; `apps/web/test/refusals.test.ts` pins it.
- The refused-entries screen states "30 days" in `strings.ts`: change it with `RETENTION_DAYS`.
- `audit_log` is append-only and references `companies` and the acting `users` row: once a
  roster write, a repair or a decision commits, its company and its admin can never be
  deleted. Tests call those seven procedures only in a rolled-back transaction or a
  `disposableDb()` (the web suite has its own in `apps/web/test/helpers.ts`). A manual check
  of one belongs in `trader_demo` (`pnpm demo --reset` rebuilds it); in the local database
  only `docker compose down -v` removes the rows.
- A grant is the whole database's: `withoutAuditInsert` (api helpers) revokes `trader_app`'s
  INSERT on `audit_log`, so it runs only in a disposable database, never the shared one.
- `pnpm --filter <pkg> test -- <file>` forwards the `--` and runs every suite; for one file,
  `pnpm exec vitest run <file>` from the package's directory.
- Postgres answers a `time` column with seconds (`07:00:00`): the assignment reads trim it
  to the wire's `HH:MM` (`toWallTime`), and a test reading the table directly sees seconds.
- `job_assignments` can be deleted, so its suites use rolled-back calls or committed fixtures
  with cleanup; only the lock-wait tests need a disposable database, because
  `waitForLockWait` counts every backend of its database.
- The demo plans the week after its two recorded weeks (`planWeek`, anchor + 14 days): with
  the default anchor that is the current week. The plan step runs before the deactivation
  step, since `assignment.create` refuses a deactivated person.
- A built app (`next start`) cannot be browsed locally: under `NODE_ENV=production` the pool
  keeps the compose superuser and the development identity is refused, so every call is a
  500 by design. Browser checks use `next dev`; a stale `next start` holding port 3000 moves
  `next dev` to 3001.
- A new audited action is a member of `AuditEntry` (`core/audit.ts`), a line in the inventory
  test's `WRITERS` and in the demo's `EXPECTED_AUDIT`, and a decision row; the compiler and
  the two tests fail until all three agree.

## Log

### 2026-10-09 → 2026-11-08 — rolled up

- 10-09 → 10-29: `archive/pre-rebuild` tagged, orphan `rebuild`, public repo, no trailers; six
  documents; D Sierra Painting mark, accent `#2808AC`; Compose Postgres 18 as `trader-local`,
  `.env.example`, Node 24: Stages 0–1 closed; Stage 2 lines 1–4: Drizzle, `pg` seam, core
  tables, `uuidv7()` office ids, `0002` guard, pay, approvals, voids, corrections; 53 tests.
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
- 11-08: Stage 4 line 4: `pnpm demo` writes a synthetic company into `trader_demo` through the
  real procedures; 770 tests. Owner: Figma is the exploration surface; UX review before line 5.

### 2026-11-09 — UX review, office shell, office list pattern

- **Did:** the review, measured in the browser on `trader_demo` at 390, 768 and 1280; DESIGN
  amended with its decision row; Figma file _TRADER — Office_ (tokens, screens as built). Shell:
  56 pt header, grouped navigation, `/` to Jobs, rows by a 720 px container query. List pattern:
  `page-header`, `field`, `note`, `row-editor`; roster at 390 from 3,547 px to 1,183; 770 tests.
- **Decided:** by the owner on 2026-11-09: plan K-1 to K-6, K-8, K-9 as recommended; K-7 not taken.
- **Next:** owner merges `ux-review`, `office-shell`, `office-list-pattern` in order; then TASKS.

### 2026-11-11 — Audit, then the V1 readiness pass

- **Did:** a read-only audit at `fbf2e5d` (eight specialist reviews, browser pass, catalog
  queries): no P0, six P1s. Then, on the owner's instruction, branch `v1-readiness`: API
  plumbing under `core/`, tests mirroring `src/`; one home each for the caller lock, server
  clock and closed-day query; pool bounds and error listener; default timeouts on protected
  calls; batch cap; bounded instants; tests and seed refuse `DATABASE_URL`; gate inventory
  test; typed lint; `0027`; office result notes, confirmed destructive actions, load retry,
  pinned edited row, error and not-found screens, baseline headers on built apps, online-only
  requests;
  caps removed; PRD, ARCHITECTURE, DESIGN, RULES revised; TASKS rewritten to a deployed V1.
  784 tests.
- **Decided:** by the owner on 2026-11-11, the rows of that date in ARCHITECTURE: event-time
  plausibility, `captured_offline`, rejected-record trace, pull extension, pay-period
  membership, hours rounding, credit memos, audit rows in V1, no document caps. Not done, and
  now TASKS lines: the client-safe contract export, the screen scaffold extraction,
  `status.get` without the adapter, the wider startup guard, the comment citations.
- **Next:** owner reviews and merges `v1-readiness`; then Stage 4's first open line,
  event-time plausibility in `sync.push` (plan first: sync).

### 2026-11-11 — V1 owner decisions D01–D21 written into the documents

- **Did:** branch `docs-v1-final-alignment` from `076fcd6`, documents only: PRD, ARCHITECTURE
  (sections Operational sync states, Office authority, Accounting and exports; one decision
  row per `V1-Dnn`), DESIGN (ten component rows), TASKS (Stages 4–8 open lines rewritten with
  their tests; every `**decide**` but the Neon owner role resolved). No code, no migration.
- **Decided:** by the owner on 2026-11-11, V1-D01 to V1-D21 (ARCHITECTURE, Decisions), and in
  the session an amendment to V1-D10: an admin's own labor never needs approval. Superseded
  rows of the same date: event-time ordering by `server_timestamp`, the two-minute
  `captured_offline` definition, the every-record trace, advisory-only sync states. Left to
  each task's plan: diagnostics retention, the reachability staleness bound, the restricted
  answer's wire shape, the adjustment basis stored at close.
- **Next:** independent review of the branch's diff, then the owner merges; then Stage 4's
  first open line, event time kept and judged (plan first: sync, fold, fingerprint version).

### 2026-11-11 — Event time kept and judged (V1-D01)

- **Did:** branch `event-time-kept-and-judged` from `d06c4f7`, five commits. The fold and the
  closeout day query read `client_timestamp` alone; fingerprint `v2.`. `judgeEventTime`
  (`sync/reasons.ts`) in `pushLaborEvent`: `clock_skewed` from the receipt comparison,
  `time_in_future`. Demo history as an offline backlog the admin approves, one claimed-online
  day. Citations by date and subject in `fold.ts`, `day.ts`, `sync/labor.ts`. No migration, no protocol
  change. Each guard watched red: the old ternary, the old day query, version 1, the future
  guard, the flag merge. 800 tests.
- **Decided:** by the owner on 2026-11-11 ("execute", the plan's recommendations): receipts
  are not compared; the demo treatment; the citation cleanup. Rows of that date in
  ARCHITECTURE: fingerprint `v2.`, closeouts sealed under the old fold, the receipt
  comparison as built, the demo fixture. Consequences of V1-D01 worth knowing: a phone more
  than five minutes fast has every fresh event refused until the office repairs it; a
  truthful online capture delivered more than five minutes late is flagged.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, rejected-record
  diagnostics (V1-D04; plan first: the store and the retention period).

### 2026-11-11 — Rejected-record diagnostics (V1-D04)

- **Did:** branch `rejected-record-diagnostics` from `2e8b12d`, six commits. A request id per
  HTTP request in the context and the error report. `sync_diagnostics` (`0028`, `0029`):
  tenant policy, SELECT, INSERT, DELETE. The push loop notes refusals, the record it stopped on
  and the identifiable records behind it; the sync procedure writes them after the call
  settles, guarded, with a bounded delete of expired lines and a per-caller cap.
  `diagnostic.list` and its gate line; `/refusals`, checked in the browser on `trader_demo` at
  390 and 1280. Watched red: the client-supplied id, the bind, the prune, the cap, the write's
  guard, the rest-of-batch note, the read's retention and zone filters. 832 tests.
- **Decided:** by the owner on 2026-11-11 ("execute", the plan's recommendations), the five
  rows of that date in ARCHITECTURE: the table as the store, 30 days, the receipt time in a
  line, the request id in `ErrorReport`, DELETE on this one table, `/refusals`. Found while
  building and not in the plan: the non-binding resolve (its own row). Not done: the daily
  cross-tenant delete, now a Stage 6 line; no request id is returned to the client.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, audit rows
  (V1-D20).

### 2026-11-12 — Audit rows (V1-D20)

- **Did:** branch `audit-rows` from `3781aea`, seven commits. `recordAudit`
  (`core/audit.ts`) on the mutating branch of `roster.invite`, `setRole`, `deactivate`,
  `reactivate`, `setPayRate`, `labor.repair` and `approval.decide`, in each one's own
  transaction; no migration, no procedure, no screen. The three roster suites and the web
  roster test moved to disposable databases first. Inventory test (static) and the demo's
  per-action counts (dynamic); `pnpm demo --reset` checked by query: 8 invitations, 5 rates,
  1 repair, 249 decisions, 1 deactivation, 1 demotion, one actor. Watched red: a dropped
  call, a row written on a duplicate, an email in a row, a swallowed insert failure, an
  unlisted writer. 847 tests.
- **Decided:** by the owner on 2026-11-12 ("execute", the plan's recommendations), the four
  rows of that date in ARCHITECTURE: row contents, one row per repair call, the stamp from
  the clock, no read path. Not changed and worth knowing: `roster.invite` and
  `roster.setPayRate` take no lock on the caller, so an admin demoted mid-call still
  completes and is audited as the actor.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, dated
  worker-job assignments (V1-D07; plan first: schema).

### 2026-11-12 — Dated worker-job assignments (V1-D07)

- **Did:** branch `dated-assignments` from `2a5a054`, seven commits. `job_assignments`
  (`0030`, `0031`); `mayStartOn` exported from `sync/scope.ts` unchanged; `assignment.create`,
  `update`, `remove`, `list`, `mine` with their gate lines; a planned week in the demo (20
  rows); `/assignments` under Work, checked in the browser on `trader_demo` at 390, 768 and
  1280 — a week planned in one action, a day moved out of the week with its row kept, a
  removal confirmed, no sideways scroll, no control under 48 pt narrow. Watched red: the
  CHECK, the tenant policy, the admin gate, the conflict target, the two refusals, the
  own-rows filter in `mine`, the flag and `mayStartOn` itself. 894 tests.
- **Decided:** by the owner on 2026-11-12 ("execute", the plan's eight recommendations), the
  row of that date in ARCHITECTURE and the DESIGN amendments (Assignments in the Work group;
  the Assignment row's words for an archived job and a deactivated person). Not done: no
  pull field (Stage 5), no audit row, no browser test, no Spanish office strings. Worth
  knowing: the native time control shows the browser's 12- or 24-hour form while the table
  shows `HH:MM` as written; the week bar starts at the browser's day, not the company's.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, admin
  closeout (V1-D08; plan first: closeout locks).
