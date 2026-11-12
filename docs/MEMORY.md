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
  touching the repository while Turbopack watches it. Restarting the dev server clears it;
  on 2026-11-12 two restarts did not while the browser tab stayed on the looping page, and
  the third did after the tab was sent to `about:blank` first. The same day, later: two
  starts looped on every route; the third did not, after the tab was closed and the route
  was requested once with `curl` before the browser's first load.
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
- Until its Stage 4 task lands, `materials.ts` describes an office writer that does not
  exist (V1-D09). The documents are right; correct it in that task and delete this note.
- An admin's own labor has no approvals row (0032): a fixture that needs a pending labor
  approval uses a worker or a foreman, or an admin's event written by a different admin; a
  test that needs an admin's event to carry reasons has none to read. 0032's checks read
  `users.role` when they run, so a fixture that changes a role before firing them is judged
  by the new one.
- The ledger screen's explanatory sentences say a repair "waits for approval" on every
  ledger, the signed-in admin's own included, where it does not; only the saved note
  follows the server's answer. The screen does not know who is signed in.
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
- The office closeout screen commits a closeout, which can never be deleted: check it by hand
  only in `trader_demo` and run `pnpm demo --reset` after; its web test has a disposable
  database. The demo has no open session: to see the blocked submit, insert one `started`
  row into `trader_demo` as the owner before the check.
- A rolled-back test cannot tell whether a closeout holds its job's row: the exclusive
  field-write lock stops a second submit either way. Only the real-commit tests
  (`push-commit.test.ts`, waiting on `from "jobs" … for share`) go red when that lock is gone.
- A test fixture's event id is minted from its receipt time (`eventIn`), so id order always
  agrees with receipt order: a test of an ordering's receipt key against its id key writes
  the row itself with an id from a later instant (`labor/ledger.test.ts`).
- An office labor entry carries no location stamp, so the server flags it `location` as
  well: an appended entry's reasons are `user_timed`, `location`, and the queue and the
  ledger show that tag on every repair.
- A repair or a decision made by hand can never be removed: check `/approvals` and the
  ledger's repair only in `trader_demo`, then `pnpm demo --reset`. The demo has fewer than
  50 pending approvals, so "Show more" never appears there.
- `table.module.css`: the narrow separator rule and the `number` label rule must keep equal
  specificity, the `number` one last; a `:not()` added to one and not the other drops the
  label ("Hours") from narrow rows.
- The office table's narrow row labels only `number` cells: any other cell must read on its
  own without its column heading ("Entered by Dana Ortiz", not the name alone), and an
  empty one carries `data-empty` so its separator is dropped.
- `closeout.submit` holds the day's receipts `FOR SHARE` once it has the field-write lock
  exclusive (`submit.ts`, step 11): a real-commit test that needs a closeout stopped past
  that lock holds a receipt's row `FOR UPDATE` and waits on `from "materials" … for share`,
  not on the membership insert (`materials/cost-commit.test.ts`).
- `strings.ts` is one flat object: a new key that repeats an old one (`material`, `loggedBy`)
  is TS1117 at typecheck, not in the editor's first glance. Search the file before adding.

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

- **Did:** branch `dated-assignments` from `2a5a054`, ten commits. `job_assignments`
  (`0030`, `0031`); `mayStartOn` exported from `sync/scope.ts` unchanged; `assignment.create`,
  `update`, `remove`, `list`, `mine` with their gate lines; a planned week in the demo (20
  rows); `/assignments` under Work, checked in the browser on `trader_demo` at 390, 768 and
  1280 — a week planned in one action, a day moved out of the week with its row kept, a
  removal confirmed, no sideways scroll, no control under 48 pt narrow. Watched red: the
  CHECK, the tenant policy, the admin gate, the conflict target, the two refusals, the
  own-rows filter in `mine`, the flag and `mayStartOn` itself, the caller re-read in
  `update` and `remove`. One independent review of the branch: nothing critical; its input,
  ordering, test and screen findings fixed in two further commits. 897 tests.
- **Decided:** by the owner on 2026-11-12 ("execute", the plan's eight recommendations), the
  row of that date in ARCHITECTURE and the DESIGN amendments (Assignments in the Work group;
  the Assignment row's words for an archived job and a deactivated person). Not done: no
  pull field (Stage 5), no audit row, no browser test, no Spanish office strings. Worth
  knowing: the native time control shows the browser's 12- or 24-hour form while the table
  shows `HH:MM` as written; the week bar starts at the browser's day, not the company's;
  `assignment.list` stops at 2,000 rows without saying so (the screen reads seven days).
  For the owner: PRD still says "any of the company's jobs" where the decision row now says
  not archived — the PRD sentence is the owner's to amend.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, admin
  closeout (V1-D08; plan first: closeout locks).

### 2026-11-12 — Admin closeout (V1-D08)

- **Did:** branch `admin-closeout` from `837c3f7`, four commits. `lockCloseoutScope` beside the
  foreman's scope; `closeout.review` gated to foreman and admin, `closeout.submit` admitting
  both in the procedure; no migration, no new procedure. `/closeout` under Work: job and
  date, the review, then one submit, checked in the browser on `trader_demo` at 390, 768 and
  1280 — a worked day submitted by keyboard, an archived crew-less job closed with its
  status kept, an open session blocking with its reason, a closed day shown locked, no
  sideways scroll, no control under 48 pt. Watched red: the review gate, the admin's
  self re-read, the missing-job refusal, the job lock (review and, through the real-commit
  push tests, submit), the role check in submit, a crew-less refusal, the id's version.
  918 tests.
- **Decided:** by the owner on 2026-11-12 ("execute", the plan's seven recommendations), the
  row of that date in ARCHITECTURE and the DESIGN amendment (Closeout in the Work group): a
  deactivated crew's job is in an admin's scope; no audit row; no read of a closeout as
  submitted; flags only from the review's own fields; no demo change. Changed from the plan:
  the push-first test answers `sessions_open`, as the foreman's does, not `review_stale`.
  Not done: no browser test, no Spanish office strings, no approval state in the review.
  Worth knowing: the role check in `submit.ts` is one of three that refuse a worker (the
  scope and `lockActiveSelf` are the others), so removing it alone turns no test red. For
  the owner: DESIGN's Closeout row reads as saying the status will not change for a job with
  no crew too, while ARCHITECTURE writes it for any job not archived; the screen says "will
  not change" only for an archived job. The DESIGN sentence is the owner's to amend. A
  `closeout.get` read of the day as submitted would need its own TASKS line.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, the worker
  ledger read.

### 2026-11-12 — Worker ledger read

- **Did:** branch `worker-ledger-read` from `7fd3107`, four commits. `labor.ledger`
  (`labor/ledger.ts`), admin-gated, with its gate line; the demo's corrected day read
  through it; `/ledger` under People, checked in the browser on `trader_demo` at 390, 768
  and 1280 — the corrected clock-out beside its replaced original, a deactivated person, an
  empty range, a range past 31 days refused under its field, no sideways scroll, no control
  under 48 pt. Watched red: the gate, the person lookup, the range filter and its bound, the
  zone of the work date, the receipt and id ordering keys, the decisions, the effect, the
  open-session pointer, the closeout match, `corrected`. No migration. 932 tests.
- **Decided:** by the owner on 2026-11-12 ("execute", the plan's seven recommendations), the
  row of that date in ARCHITECTURE and the DESIGN amendments (Labor ledger in the People
  group; Worker ledger): the screen in this line, the open-session pointer, 31 days with no
  pagination, no job or approval filter, `hasLocation` and no coordinates. Changed from the
  plan: `Still open` is a pill, as on the closeout screen; an entry entered by someone else
  says "Entered by" in its cell. Not done: no browser test, no Spanish office strings, no
  link to a queue or a repair (neither screen exists). Not seen in the browser, covered by
  the API tests only: the open-session line, a rejected session, a void.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, the approval
  queue screen and labor repair from the ledger screen.

### 2026-11-12 — Approval queue screen and labor repair from the ledger

- **Did:** branch `approval-queue-and-repair` from `e7e81f1`, seven commits. `approval.queue`
  answers `timezone` and a receipt's `receivedAt`. `zoned.ts` (wall time in a zone, both
  ways) and `ledger/repair-set.ts` (a draft to `labor.repair` operations, ids, the minter).
  `/approvals` under Work; the repair editors, Void session and "Add missing hours" on
  `/ledger`. Checked in the browser on `trader_demo` at 390, 768, 1024 and 1280 — both
  times on Luis's clock-skew day, approve by keyboard, reject in two presses, a corrected
  clock-out, a break added as a pair and refused alone, a void, missing hours, a skipped and
  a future time refused, the repairs then approved from the queue; no sideways scroll, no
  control under 44 pt wide or 48 pt narrow. Watched red: the zone and the receipt time, the
  earlier instant and the skipped hour, a correction's root, the kept ids and their order,
  the job of a corrected entry and of an added one. No migration, no new procedure.
  957 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its recommendations
  1 to 8), the row of that date in ARCHITECTURE and the DESIGN amendments (Approvals in the
  Work group; Approval row; Worker ledger, no longer read-only). Changed from the plan: the
  queue is read fresh on every visit instead of being invalidated by a repair; an
  `id_conflict` takes new ids; editor fields sit two to a row from 1024, not 768; `stamp`
  and `duration` moved to `format.ts`. Not done: no component or browser test, no Spanish
  office strings, no link from a queue row to the ledger. Not seen in the browser, covered
  by tests only: "Show more", an own entry, `already_decided`, a skewed receipt,
  `repair_stale`, the repeated hour. Open for the owner: the plan's question 9 — the
  request asked to keep independent approval of an admin's own labor, which is the code
  today and the rule the next line retires; confirm that line still stands.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, an admin's
  own labor needs no approval (V1-D10 as amended; plan first: schema, sync).

### 2026-11-12 — An admin's own labor needs no approval (V1-D10 as amended)

- **Did:** branch `admin-own-labor` from `2f4be42`, five commits. `0032`: one SQL rule,
  `labor_event_needs_no_approval`, and the deferred checks of 0022 and 0026 standing down
  for it. `sync.push` writes no approval for a worker who is an admin, the role read from
  the rows its scope locks; `labor.repair` writes none for the caller's own ledger. The
  ledger screen's saved note follows the answer. Checked in the browser on `trader_demo` at
  1280 and 390 — the demo admin's own missing hours `Counts` with "Approved by default" and
  nothing new on `/approvals`; the same for another person waits. Watched red: the rule
  never true, the rule without its initiator clause, the unconditional insert in push, the
  caller's resolved role in place of the locked worker's, a repair never own, the worker's
  role in place of the caller's own ledger, and the exemption broken at a true commit.
  973 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its three
  readings of the V1-D10 row), the row of that date in ARCHITECTURE: a foreman's push for
  an admin writes no approval; one admin's repair of another's is pending; rows already
  stored are left as they are. Changed from the plan: the saved note reads "These are your
  own hours, so they count without approval"; a closeout test that used an admin's push to
  carry a reason now gives the crew the job and pushes as a worker. Not done: the ledger
  screen's explanatory sentences (a Note), no `after_closeout` case for an admin's push,
  no browser test, no Spanish office strings, no check at 768 or 1024. Not seen in the
  browser, covered by tests only: an admin's own correction and void, a foreman's push for
  an admin, the promoted worker's `own_entry`.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, material
  cost entry by the office.

### 2026-11-12 — Material cost entry by the office

- **Did:** branch `material-cost-entry` from `f081ea6`, five commits. `material.list` and
  `material.setCost`, admin-gated, with their gate lines; three receipts priced in the demo;
  `/materials` under Work, checked in the browser on `trader_demo` at 390, 768, 1024 and
  1280 — an unpriced receipt priced by keyboard, the same cost sent again, a correction, a
  clear in two presses, a malformed amount refused under its field, a sealed receipt and the
  after-closeout one priced, the job filter, both empty states, no sideways scroll, no
  control under 48 pt narrow or 44 pt wide. Watched red: a second column in the update (on
  an open receipt and on a frozen one), the `unchanged` answer, the caller re-read, the
  field-write lock, the row lock, the unpriced filter, the cursor's read-back, the job
  refusal, both gate lines. No migration. 999 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its seven
  recommendations), the row of that date in ARCHITECTURE and the DESIGN amendments
  (Materials in the Work group; Material cost): the screen's home, currency required with
  no default, the field-write lock taken, clearing allowed, any standing priced, the demo's
  three costs, no column-level grant. Changed from the plan: the real-commit test stops the
  closeout at its `FOR SHARE` of the day's receipts, where it truly waits; no Note about
  hand-made costs, which bite nothing. Not done: no browser test in CI, no Spanish office
  strings. Not seen in the browser, covered by tests only: "Show more", the `Rejected` and
  `Voided` pills, a refusal from the server. Worth knowing: who priced a receipt is not
  recorded (V1-D20); the corrections-with-decisions query now has three copies (`queue.ts`,
  `pull.ts`, `list.ts`); if `job.list` fails the job filter offers only "All jobs".
- **Next:** owner reviews and merges the branch; then Stage 4's next open line,
  office-created material entries (V1-D09; plan first: schema).
