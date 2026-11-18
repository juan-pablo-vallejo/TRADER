# TRADER — Memory

Read this first in every session. It holds what the other documents do not: how we got here,
what has bitten us, and what the next session starts with. Progress itself lives in
[TASKS.md](TASKS.md); what happened and what was decided when, in [LOG.md](LOG.md), whose
newest entry's **Next** is where a session resumes.

## How to write here

- A session's entry is appended to [LOG.md](LOG.md), in the format its header states.
- A gotcha goes under **Notes** when it will bite again; a note is deleted when its cause is
  gone.
- No cap.

## Context

- TRADER is built by one person, Juan Pablo Vallejo, in his own name. The design partner and
  first pilot is a painting contractor in RI/MA with about 30 people. The pilot is unpaid;
  payment follows "V1 complete" as defined in PRD.md.
- The project went through research, a specification, a Phase 0–1 build with a working
  cursor-based sync core, two independent architecture reviews and an adjudicated synthesis
  (October 2026), then this rebuild. The first decisions in [LOG.md](LOG.md) are the synthesis
  outcome; the archived documents predate it.
- No vendor account is in use yet. Apple Developer (individual) and Google Play Console
  (personal) are enrolled; Clerk, Neon, Vercel, Sentry, Resend and EAS are
  created by the owner on the Release 0.1 track (TASKS), PostHog after it.
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
  was requested once with `curl` before the browser's first load. On 2026-11-12, R1: two
  Turbopack starts looped with all of that done; `pnpm exec next dev --webpack` did not.
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
- A receipt the office entered on a closed-out day is pending for an admin who is not its
  author, and with one admin in the database nobody can decide it: the demo's stays pending
  by design. Check `/materials`' form only in `trader_demo`, then `pnpm demo --reset`; a
  closed-day entry made by hand in the local database is removed only by
  `docker compose down -v`.
- `materials.entered_by_office` has no default (0033): a fixture that inserts a receipt
  states it, and `materialIn` takes it as its last argument.
- Two ids from the test `uuidv7()` minted in one millisecond order either way: a test of a
  read that sorts by id compares by id, never by position.
- Never restore a file after a watched-red edit with `git checkout`: it discards the
  uncommitted work in that file. Copy the file aside first and copy it back.
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
  `next dev` to 3001. Since R3 it also refuses to start without its whole environment: for a
  header or `/sign-in` check, give the shell a placeholder `DATABASE_URL` (a Postgres URL
  nothing listens on), a placeholder `SENTRY_DSN`, `CLERK_AUTHORIZED_PARTIES` as the local
  origin and `TRADER_DEV_IDENTITY` blank; `/api/ready` then answers 503, as it should.
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
- An MCP server registered while a Claude Code session is open has no tools in that session;
  restart it. Until then `maestro mcp` answers MCP over stdio (`initialize`, `tools/list`,
  `tools/call`) from any script.
- Maestro's MCP has no tap or type tool: every action is `run` with inline YAML.
  `take_screenshot` takes about 25 s, the rest under a second; the first use leaves a
  `maestro-driver-ios` app on the simulator. `assertVisible` takes no `timeout`
  (`extendedWaitUntil` does), and a wrong key fails the whole flow before it starts.
- Two `eventIn` events of one worker at one instant order by their random ids: a fixture's
  job switch starts the second session a minute later, or the fold answers
  `session_already_open`.
- The demo's last step holds `job.cost` and `labor.hours` to `EXPECTED_COST` and
  `EXPECTED_HOURS` (`demo/content.ts`), worked out by hand; `run.test.ts` does the same for
  J2. A new seeded event, rate, receipt, cost or decision changes them.
- Maestro has no biometric command. The host answers the prompt instead: on the simulator
  `xcrun simctl spawn <udid> notifyutil -s com.apple.BiometricKit.enrollmentChanged 1`, post
  it with `-p`, then `-p com.apple.BiometricKit_Sim.fingerTouch.match` (or `.nomatch`); on
  the emulator `adb emu finger touch 1`, which needs a device PIN and an enrolled finger
  first. Neither has been tried against a real prompt: no app shows one yet.
- A link inside a sentence is one line of text tall (18 pt measured), under the 48 pt narrow
  target: a link is a line of its own (`.back`, `.links a`), or the first cell of a table
  row (`table.rowLink`), never a word in a paragraph.
- A name link in a wide table cell wraps where the bare name did: a 49 pt row there is two
  lines of name, not the link.
- `ON CONFLICT (id) DO NOTHING` names one arbiter index: when two copies of a row insert at
  once, the second passes the arbiter unchecked-for-now and then waits on any other unique
  that holds the id, such as `(company_id, id)`, and raises 23505 when the first commits
  (seen on `material.create`, 1 run in 30, gone with no target). Where every unique of a
  table holds the id, name no target; where a natural key must still raise, the writer
  must already hold a lock that keeps two copies apart. Not audited for that lock: the
  targets in `invoices/draft.ts`, `payments.ts`, `send.ts`, `assignments/write.ts`,
  `closeout/submit.ts`, `labor/repair.ts`.
- A closed pay period and its `pay_period_lines` can never be deleted, and they reference
  the company, the closer, the workers and the jobs: tests close periods only in a
  rolled-back transaction or a `disposableDb()`. Check `/pay-periods` by hand only in
  `trader_demo`, then `pnpm demo --reset`.
- A `pay_period_lines` fixture inserts its lines while the period is open and closes the
  period in the same transaction, counts stated (0036); the deferred seal fires in a
  rolled-back test only under `SET CONSTRAINTS ALL IMMEDIATE`, and a test that then repairs
  labor defers them again (`seal` in `pay-periods/close.test.ts`).
- Inserting a `pay_periods` row takes the company's pay-period lock in its trigger: a
  fixture that must leave the lock free inserts under `session_replication_role = replica`.
- An advisory transaction lock taken inside a savepoint that rolls back is released: a
  failed call in a rolled-back test proves nothing about a lock it took.
- After a test's `asOwner` the transaction's tenant setting is empty: a direct select as
  `trader_app` then sees no row. Read fixtures as the owner.
- Every event of a session has its own approval, and the session waits while any of them
  does: approving one event of a four-event day leaves the pay period's count unchanged.
- The demo closes week one, so `--anchor` must leave both recorded weeks ended: a later
  anchor fails at the close step with `not_ended`. `EXPECTED_PERIODS` (`demo/content.ts`)
  is worked out by hand like `EXPECTED_COST`.
- `RowToggle` reads "Close" when open; on a row where that word is an action of its own
  (a pay period), pass `closeLabel`.
- An eslint rule (`react-hooks/refs`) refuses `ref.current` inside a mutation's `onSuccess`
  written in render: move focus from an effect keyed on the state that changed.
- A sign-in number is matched across every company, and the suites commit fixtures side by
  side: a committed fixture takes its number from `testPhone()` (api helpers), never a
  literal. A disposable database or a rolled-back transaction may use one.
- `roster.invite` inserts with `ON CONFLICT DO NOTHING` and no target, on purpose: the email
  and the number each have a unique index and one target covers one. The id is the
  database's own, so nothing else can conflict; a writer that takes a client id must not
  copy it.
- To watch a constraint or policy test red, drop the constraint in the local database, run
  the test, and add it back with the migration's own statement; the journal is untouched.
- RLS alone already narrows a first sign-in to its invitations: removing the phone arm of
  `resolveUser`'s WHERE turns one test red, removing the `app.identity_phone` setting four.
- The browser's development sign-in takes an email only: a person invited by number alone is
  signed in with `curl` and the three development headers, or through an invitation that
  names both.
- Clerk reads its two keys from the environment itself. Handed to `clerkMiddleware` as the
  `secretKey` option, every request is a 500 asking for a third key, `CLERK_ENCRYPTION_KEY`.
- Clerk's `appearance` takes `colorPrimary` as a literal colour: given `var(--accent)` the
  form's Continue button draws blank (white on white), though the focus ring takes it.
- `@clerk/nextjs/server` is Next's server-only code and cannot load in vitest: a module the
  suites import reaches it by `await import(…)` at the point of use (`server/identity.ts`).
- The web suite deletes the Clerk variables after loading `.env` (`test/setup.ts`), so it never
  reaches Clerk whatever the owner's `.env` holds; a test that wants Clerk configured stubs them.
- `apps/web`'s vitest does not render JSX ("React is not defined"): a page test can assert
  what a server component throws before its JSX (`notFound()`), not what it draws.
- `apps/web` has no `zod` of its own; it validates through the schemas `@trader/api` exports
  (`signInEmailSchema`, `signInPhoneSchema`, `verifiedIdentitySchema`). Adding it is a TASKS line.
- Clerk's `POST /v1/users`, read on the development instance 2026-11-12: a number alone is
  accepted and marked verified; an address another user holds is 422
  `form_identifier_exists` with `meta.param_name`; an email with no number is 422
  `form_data_missing`; Clerk lower-cases an email and rewrites a typed number to E.164; a
  user id is `user_` and 27 letters and digits.
- Clerk's script takes several seconds to draw `/sign-in` on a development instance, longer
  right after a recompile; a screenshot taken at once shows the shell and an empty column.
- `next dev` on Clerk needs `TRADER_DEV_IDENTITY` blank in the shell; the development
  identity and Clerk never run together, and each one's sign-in route is 404 under the other.
- A `createContext` call names its `directory`: `localDirectory` in every suite and the demo,
  and a recording one where a test reads what the provider was told (`roster/invite.test.ts`).
- The office shell stays mounted across a sign-out and the next sign-in: whatever a query
  answered for the last person is still drawn for the next. `ClerkSessionReset`
  (`clerk-session.tsx`) empties every query when Clerk's user changes; a new per-person
  cache outside the query client needs its own reset.
- Clerk's test numbers are `+1 XXX 555-0100` to `-0199` only, code `424242`, and send
  nothing; `555-0000` is outside the range and is a real, undeliverable SMS. A check of
  sign-in runs on a throwaway database (`create database`, `db:migrate`, `db:seed`, the seed
  admin given a test number as the owner), with the Clerk users made and deleted through
  `POST` and `DELETE /v1/users`.
- Clerk's phone field answers "Identifier is invalid." when Enter follows the last digit at
  once (seen twice from a script); the Continue button a moment later is accepted.
- Clerk's form stuck once on its code step, "needs_first_factor not supported yet", with the
  sign-in in fact made (2026-11-12, one of six sign-ins, straight after a hot reload of
  edited files; not reproduced over the same steps). Reloading the page showed the office.
- Next compiles `instrumentation.ts` for the edge runtime too. A dynamic import there is
  followed unless it sits inside `if (process.env.NEXT_RUNTIME === "nodejs") { … }`; an early
  `return` on the opposite test is not enough, and the build warns of `node:crypto` in the
  Edge Runtime from deep inside `packages/api`. Everything it does lives in `server/start.ts`.
- `register()` does not run during `next build` (seen: a build with nothing set passes, and
  `next start` on the same build answers 500 to everything with the variables named).
- `pnpm --filter <pkg> add` relinks that package alone. `@sentry/nextjs` brought
  `@opentelemetry/api`, an optional peer of `drizzle-orm`, which re-keyed `drizzle-orm` for
  every importer: `tsc` saw two copies ("separate declarations of a private property") until
  a root `pnpm install`. After adding any package, install at the root.
- Sentry's SDK takes an event's type from `error.name`, not the class: a subclass that sets
  no `name` is reported as `Error`. It adds `sdk` to an event after `beforeSend`. At start it
  warns unless `enableRuntimeChannelInjection` is `false`, and warns of `beforeSendTransaction`
  under its default trace lifecycle: neither option is needed with tracing off.
- Sentry 11 collects headers, cookies, bodies and the user by default; `sendDefaultPii` is
  deprecated. `sentry-event.ts` switches each `dataCollection` key off by name: a key a later
  version adds is on until it is listed there, and only the allow-list stands behind it.
- An invalid `TRADER_SYNC_MODE` on a deployment now stops the start, before Sentry is
  initialised, so it sends nothing. To force a report on staging with nothing changed: as
  `trader_app`, in one transaction, set `app.company_id`, hold the fixture customer's row
  `FOR UPDATE` for 40 s and roll back, and run the browser suite meanwhile. Its save waits
  out the 5 s `lock_timeout`, the call answers a 500, and Sentry receives
  `request customer.update` with `sqlstate 55P03`; the suite is red at "Saved." by design
  and green on the next run.
- `neon branches create` prints the new branch's connection string, password included,
  unless given `--no-secrets`. A branch from a point in time is
  the timestamp alone as `--parent` (the default branch is implied; `<branch>@<timestamp>`
  is refused as an unknown branch); `branches restore` rewrites a branch in place.
- CI runs on a pull request into `main` and on `main` only: a pull request stacked on
  another feature branch gets no `check` until its base is `main`. Retargeting it to
  `main` starts no run either (seen on #93: "waiting for status"); the next push does.
- A native client's Clerk token carries no `azp`, and Clerk refuses such a token once
  `authorizedParties` is set: a phone check against a local API proves nothing about a
  deployment unless `CLERK_AUTHORIZED_PARTIES` is set in that shell (`partiesFor`,
  `admitsParty`).
- The phone sends no call while Clerk is loading or cannot mint a token (`token.ts`): a
  call with no header is a 401, which the app reads as "sign in again".
- To sign in on the phone through Clerk locally: `pnpm demo --db trader_demo_<name>`, give
  the unbound demo worker (Sam Carter, on no crew) a Clerk test number that a development
  user already holds, `next dev --webpack` with `TRADER_DEV_IDENTITY` blank, Metro with
  `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and no development identity. The demo's other people
  are bound to `dev:` subjects and can never sign in through Clerk.
- `eas` run from the repository's root finds no project and leaves an `app.json` there:
  run it from `apps/mobile`.
- Clerk's publishable key is `pk_test_` or `pk_live_` and base64 of its Frontend API host
  with a closing `$`; the policy's Clerk host is read from it (`csp.ts`), so a changed key
  changes the policy with no other edit.
- Clerk's script posts usage to a host of its own from a development instance; the policy
  refuses it, so the provider is given `telemetry={false}`. Its server notice still prints.
- Neon's pooled endpoint takes no startup `options`, no `SET` and no session advisory lock;
  the direct one does. Neon's console leaves a sample table, `playing_with_neon`, in a new
  database when its first sample query is run: drop it before the first migration.
- A mutation check that removes a rollback commits its rows: after watching
  `runOnboarding`'s dry run red, delete the `Onboard Co …` company, its counter and its
  admin from the local database by hand.
- Staging credentials are Keychain items read by wrappers in `~/.config/trader/` (RULES,
  Toolbox): call a wrapper by its absolute path so its permission rule matches. A wrapper
  answering "no Keychain item named …" means the owner has not created that item yet, not
  that the command is wrong.
- The DNS wrapper is `~/.config/trader/staging-dns`, on the Keychain item
  `trader-cloudflare-dns-token` (one Cloudflare token: DNS read and edit on the zone):
  `list` (the staging mail subtree), `plan` (what `apply` would do; writes nothing),
  `apply` (the four fixed records), `inspect` (every record of the zone) and
  `inspect <name>` (that name and under it, with two resolvers' answers). `inspect` sends
  only GETs. The file before `inspect` is kept beside it as `staging-dns.bak-20261117`.
  The zone on 2026-11-17: ten records — the four staging mail records, the staging
  host's CNAME to Vercel, Cloudflare's own mail routing (three MX, an SPF and a DKIM
  TXT) — and none at the apex, `app` or `www`: no production routing exists.
- A permission rule that asks beats one that allows, whatever their order or length: never
  add a broad "ask" for a wrapper whose narrower forms should run unprompted.
- A session's safety classifier refuses `git push` while `CLAUDE.md` says not to push, and
  an explicit allow rule for `git push origin` is what lets it through.
- Playwright's `extraHTTPHeaders` go to every host a page talks to, Clerk's included. The
  suite sends Vercel's bypass once, to the preview, with `x-vercel-set-bypass-cookie`, and
  the browser carries the cookie. A trace or a video would store it: both are off.
- `staging-e2e` takes the URL Vercel reported and asks `staging-vercel owns` before it
  reads the bypass: staging's project builds previews only, so no URL of it is
  Production's. Run it on the branch alias, which is what `CLERK_AUTHORIZED_PARTIES`
  names; a hashed URL passes the wall and then fails Clerk's origin check.
- Clerk's sign-in form opens on the email address when both are enabled; the number is
  behind its "Use phone" link, and typing a number into the email field stops at the
  browser's own format check with no request made.
- The unpinned `vercel` commands are no longer allowed: every Vercel command goes through
  `staging-vercel`, by its absolute path. Its `inspect --json` is the CLI's own shape and
  carries no alias; read a deployment's aliases through Vercel's connector.
- pnpm's quarantine does not cover `npm install -g`: read `npm view <pkg> time` and pin a
  version a day old by hand (Neon CLI 9.4.0, not 9.5.0, on 2026-11-14).
- The Clerk CLI reads the repository's `.env` keys by itself when run inside it
  (`clerk whoami` says `keySource: .env`); `clerk deploy`, `clerk env` and
  `clerk impersonate` are denied by rule. Its telemetry is off (`clerk telemetry status`).
- `gh run list --commit` wants the full SHA; a short one answers nothing.
- A Vercel project's first deployment is Production's, whatever is asked: the CLI refuses a
  Preview outright, and a pushed branch's first build is assigned to Production, which the
  staging project's ignored build step then cancels. After that one cancelled record,
  Previews deploy.
- That ignored build step also cancelled a deploy hook's build (promotion 44218631940, first
  attempt, "Canceled by Ignored Build Step"): `git.deploymentEnabled` does not stop a hook,
  the project's own setting did. It reads "Automatic" since 2026-11-18 and the re-run built.
- A Preview made by the CLI has no alias, only its own hashed URL, which changes on every
  redeploy; a Preview Vercel builds from a pushed branch has the branch's alias. An origin
  that must be known before the deployment starts (`CLERK_AUTHORIZED_PARTIES`) is the
  alias, read from Vercel after the first build.
- A branch pushed at a commit the repository already pushed starts no build on the staging
  project: `staging-preview`, made at `main`'s own commit, had no deployment minutes later,
  only `main`'s cancelled Production record of that commit (2026-11-14). Its first Preview
  comes with its first new commit, the fast-forward after the next merge (seen: the
  push of `975027e` was READY in 39 s).
- A branch's first Preview is built before its branch-scoped `CLERK_AUTHORIZED_PARTIES`
  can exist, since the alias is read from that build: set the variable, then
  `staging-vercel redeploy` it. A redeploy of a Preview Vercel built from a branch keeps
  the branch's alias and moves it to the new deployment (seen twice on `staging-preview`).
- `staging-preview`'s alias is a host name, so it is written nowhere in this repository:
  read it from Vercel's connector (the deployment's aliases) each time it is needed.
- `has_table_privilege` answers false for a table on which a role holds only column grants:
  the grant matrix lists `companies` as SELECT alone, and its UPDATE columns have a test of
  their own (0041). A new `companies` column the application must write needs its own grant.
- A BEFORE trigger answers before a foreign key too: a trigger that looks its parents up must
  look inside the row's own company, or it judges another tenant's row the key would refuse.
- A shift locked by a clock-in can never be deleted, and its event never is: a test that
  locks a shift runs in a rolled-back transaction or a `disposableDb()`.
- `0040` was reordered by hand: drizzle-kit emitted the foreign keys to
  `job_assignments (company_id, id)` before that unique existed. Read a generated file for
  the order of a key and what references it.
- `companies.schedule_enforced` is written by the database's owner alone; on staging that is
  owner-role SQL with a key, through its wrapper. No procedure writes it.
- Two calls started at once on one rolled-back transaction share its one connection, and the
  second's rejection is unhandled before it is awaited: vitest reports "Unhandled Rejection"
  with every test green. In a loop over calls, hold thunks and call each in turn; read a
  run's "Unhandled" line, not only its counts.
- A schedule write is judged over the person's whole day under that day's advisory lock
  (`assignments/day.ts`): a test of two writers on one day needs real commits, and a writer
  of `job_assignments` or `shift_overrides` that skips `lockPersonDays` breaks the rule
  silently — the database holds none of it.
- `assignment.create` answers per day inside `{ result: "planned", days }`; a refused day
  is not a failed call. Count `created` among the days, never trust the outer result.
- A push at a fixed past instant must be `capturedOffline: true` (the clock rule above), and
  under schedule enforcement an offline start the schedule does not admit is stored, not
  refused: a test of `not_scheduled` pushes online, timed now, with no shift that could
  admit it at any minute. `judgeStart` itself takes any instant and is tested directly.
- A push with no location stamp carries `location` among its reasons: a schedule test's
  admitted offline start answers `["offline", "location"]`.
- `waitForLockWait` matches the statement's text as sent, with `$1` for a parameter: a
  pattern naming a parameter's value never matches, and the probe gives up after 5 s —
  longer than a push's 2 s `lock_timeout`.
- To turn enforcement on for a company in a test, update `companies.schedule_enforced` as
  the owner; `trader_app` is refused (42501).
- A mutation that turns no test red is a finding, not a nuisance: in S5 it showed two
  checks another check already made (removed) and a fingerprint half nothing tested (a test
  added). Read the "failed: 0" lines of a mutation run first.
- A foreign key added to a table widens the TRUNCATE … CASCADE set of everything it
  references: `job_assignments.locked_by_event_id` put `job_assignments` and
  `shift_overrides` into `work_session_events`' set, and its TRUNCATE test deadlocked
  (40P01) on CI only, where the suites interleave differently — green locally five times.
  After adding a foreign key, widen every `lockExclusive` list that names the referenced
  table. A TRUNCATE test writes its fixtures first and runs nothing but the TRUNCATE once
  it holds its locks.
- A modal `<dialog>` opened with `showModal()` in an effect must not be closed in that
  effect's cleanup: React mounts effects twice in development, the cleanup's `close()`
  fires `close`, and the drawer reports a dismissal nobody made. Unmounting is enough.
- An eslint rule (`react-hooks/refs`) refuses reading `ref.current` during render: an id
  minted once for a form is `useState(() => uuidv7())`, not `useRef(uuidv7())`.
- The browser imports the schedule's pure rules from `@trader/api/eligibility`; a value
  import from `@trader/api` itself in a client component would bundle the server.
- A schedule check by hand writes shifts, overrides and history: do it in `trader_demo`
  and `pnpm demo --reset` after. A locked shift there is made as the owner (an event row
  and the two lock columns); nothing in the demo clocks in under enforcement.
- A mutation run restores each file from a copy; after one, run `pnpm lint` and read
  `git diff` of the files it touched before going on. Once a restore did not hold and a
  check was gone from `invoices/draft.ts`; lint caught it only because the line's two
  names went unused. Keep the copies in the scratchpad, never `/tmp`.
- An issued invoice can never be deleted: check `/invoices` by hand only in `trader_demo`
  and `pnpm demo --reset` after; tests issue only in a rolled-back transaction or a
  `disposableDb()`.
- A draft editor keyed on anything a save changes is remounted by its own save and drops
  the note that said so: key it on the invoice's id alone.
- Never ask `error instanceof DrizzleQueryError` to recognise a database refusal: the web
  build holds a second copy of drizzle-orm, the check is false there, and a refusal the
  database named becomes a 500 on the deployed route while every suite is green. Read it
  with `pgFailure` (`core/pg-error.ts`). Found in the browser, never by a test: a refusal
  that reaches the user must be seen through the route once.
- `invoice_payments` is append-only and references `invoices` and `users`: a payment
  recorded by hand can never be removed. Check payments only in `trader_demo`, then
  `pnpm demo --reset`.
- The API's rate limit counts by address only where the platform set one
  (`x-vercel-forwarded-for`, then `x-forwarded-for`): `next dev` and the suites send none,
  so nothing local is counted by address and no run can limit the next. A test of the
  address limit sends the header itself, with an address no other run uses.
- A test that calls the real route with an address commits a row to `rate_limit_windows`:
  delete it by its key at the end.
- A `Request` built in a test has no `content-length`, and the route answers 411 to a
  state-changing request without one: build a test's POST with `jsonBody(body)`
  (`apps/web/test/helpers.ts`), as `mutate` does. Run the whole `pnpm check` after a change
  to the route, not the files it seemed to touch.
- The development client opens on its launcher sheet, not the app: a flow opens
  `exp+trader://expo-development-client/?url=<Metro's URL, encoded>` with
  `&__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1`
  after it. Maestro's `openLink` cuts an Android link at the first `&`, so
  `apps/mobile/.maestro/run.sh` starts the Android app with `adb` and the flow's own
  launch step runs on iOS only. An `env` block in a flow file beats `-e` on the command
  line: the flow has none.
- Metro started with `CI=1` does not watch files and served a stale bundle after an edit:
  start it plainly for a flow run, with `--clear` when in doubt.
- `apps/mobile/ios` and `android` are prebuild output, 1.4 GB and 1.3 GB, ignored by git,
  eslint and prettier each in its own file: a new generated folder there turns
  `pnpm format:check` red (seen: 173 files) until `.prettierignore` names it.
- The Android emulator reaches the Mac's `next dev` and Metro through
  `adb reverse tcp:3000` and `tcp:8081` (`run.sh` sets both); the smoke flow needs
  `next dev --webpack` on `trader_demo_e2e` with `TRADER_DEV_IDENTITY=enabled` and Metro
  with `EXPO_PUBLIC_DEV_IDENTITY=enabled`. With the API stopped it is red at `job-list`.
- `apps/mobile` pins `react` 19.3.0, the version React Native 0.88.1 asks for, while
  `apps/web` has its own: the two never share a React, and a package both import must not
  bring one.
- `expo run:ios` and `run:android` prebuild only when `ios/` or `android/` is missing: after
  a plugin is added to `app.json`, run `pnpm exec expo prebuild --no-install` first, or the
  native project lacks it (seen: no location usage description, a fatal on the first read).
- Maestro's `launchApp` grants every permission unless told, and on iOS the location takes
  `inuse` or `never`, not `allow`. The simulator and `pm grant` both keep a permission
  across a cleared app: `run.sh` sets it per run, and `parts/location.yaml` answers the
  system's sheet by its words, the one selector that is not a `testID`.
- The Android emulator has no network location and hands a GPS fix only to an app already
  asking: balanced accuracy answers "Current location is unavailable" there, high accuracy
  works, and `run.sh` keeps sending `geo fix` while a flow runs.
- `lsof -ti :3000` lists clients of the port too: with `adb reverse` in place that is the
  emulator, and killing the list shuts it down. Kill listeners: `-sTCP:LISTEN`.
- A tap must read the outbox before the snapshot (`sync/provider.tsx`): a cycle writes its
  snapshot and then prunes the records it shows, so the other order can see neither the
  record nor its session and capture nothing (seen once in the suite: a switch not made).
- `apps/mobile/.maestro/suite.sh` rebuilds `trader_demo_e2e`, starts and stops `next dev`
  itself and needs port 3000 free and Metro running; about ten minutes a device, 135
  seconds of it a wait for the reachability reading to go stale.
- `apps/mobile` tests cannot load a module that imports `expo-sqlite` or any native module:
  what is tested lives in files with nothing native beneath them (`sync/engine.ts`,
  `sync/clock.ts`, `ids.ts`, `i18n/preferred.ts`), and the store has an in-memory twin in
  `test/memory-store.ts`. The device store itself is covered by the flows alone.
- The catalog test fails an entry that reads the same in both languages: a string with no
  words of its own (`start–end`, `job: hours`) is written in the screen, not the catalog.
- Playwright loads a spec and what it imports as CommonJS here (`apps/web` states no module
  type): `import.meta` or a top-level await in such a file is "No tests found". Node itself
  runs the same `.ts` file as a module, with a warning.
- A `TMPDIR` as long as the session scratchpad breaks `tsx` (its socket path is too long,
  `listen EINVAL`): never export it for a command that runs `pnpm demo`.
- `@clerk/expo` brings `@clerk/react`, which requires `react-dom`; left to pnpm it resolves
  the office's (19.3.1) beside the phone's React (19.3.0) and the bundle stops at
  "Incompatible React versions". `apps/mobile` pins `react-dom` to its own React. It also
  brings two install scripts that only print (`core-js`, `browser-tabs-lock`): unlisted,
  `pnpm install --frozen-lockfile` exits 1, so `pnpm-workspace.yaml` denies both by name.
- `expo install` rewrites `pnpm-workspace.yaml` with a placeholder for a package whose
  install script it will not run: read the file's diff after any `expo install`.
- The flow suite leaves `trader_demo_e2e` with schedule enforcement on: a single flow run
  by hand after it sees no job list. Start from `suite.sh`, which rebuilds the database.
- `pdf-lib` deflates a page's content and writes each string as hex: a test reads the page
  by inflating every `stream` and decoding `<…> Tj` (`test/invoices/pdf.test.ts`, `drawn`).
  It stamps a new document with the clock unless both dates are set: a same-bytes test
  must move the clock between its two renders, or it passes inside one second.
- A test value that equals another on the same page proves nothing about either: the PDF
  test's line amount once equalled its subtotal, and swapping price for amount stayed green.
- Invoice quantities are stored with three decimal places (`8.000`): whatever shows one to
  a person trims it (`quantityText`).
- `invoice_sends` is append-only and references `invoices`, `users` and `companies`: a
  send made by hand, a failed one included, can never be removed. Check the invoice page's
  email section only in `trader_demo`, then `pnpm demo --reset`. With no `RESEND_API_KEY`
  in the shell it fails closed and still writes its row.
- `invoice.send` holds the invoice's row while the mailer is asked (up to 8 s): a void or a
  payment of that invoice waits behind it, and gives up at its own 5 s `lock_timeout`.
- Outside production `mailerFor` sends only to `INVOICE_EMAIL_ALLOWLIST`: on staging a send
  to anyone else answers `recipient_not_allowed` and is recorded as failed. That is the
  rule working, not the service failing.
- A Vercel variable changed for `staging-preview` waits for that branch's next deployment:
  a session's redeploy of it may be refused by the session's classifier, and the promotion
  that follows a merge is what carries it.
- An event made with a workflow's own `GITHUB_TOKEN` starts no other workflow (read on
  GitHub's page, 2026-11-16); whether Vercel builds a branch pushed with it is unproven
  until P1's first promotion.
- Never register this Mac as a self-hosted Actions runner: the repository is public, and a
  pull request's workflow would run beside the Keychain. The Mac polls (LOG,
  2026-11-16, native tests).
- To run a `packages/db` script against the local database without a session reading
  `.env`: `DATABASE_URL= node --env-file=../../.env --import tsx src/<script>.ts` from the
  package's directory. `NODE_OPTIONS` refuses `--env-file`.
- `btree_gist` (0004) puts about two hundred functions of its own into `public`: a catalog
  listing meant to describe the journal leaves out what an extension owns
  (`pg_depend.deptype = 'e'`), or it compares server builds.
- The promotion workflow cannot be tried from a branch: its environment admits `main`
  alone, and GitHub reads a `workflow_run` workflow from the default branch. A change to
  it is proven by its first run after the merge; say so in its pull request.
- The browser suite has no default company or number: a run not given `E2E_COMPANY_ID`,
  `E2E_ADMIN_PHONE` and `E2E_WORKER_PHONE` stops at "refusing to run" before a test loads.
  The promotion reads them as variables of the `staging` environment (`vars.`), not
  secrets; a run from this machine needs all three in its environment too.
- A merge into `main` starts a promotion and changes the commit an approval code is bound
  to: while migrations wait on the owner's dispatch, merge nothing, or the code the owner
  holds is dead and the next run prints another.
- `gh pr merge` is denied in the owner's local settings file, which a session does not
  edit: a session merges only once the owner has lifted that rule there.
- A permission rule sees a command, not a pull request's base branch: no rule on
  `gh pr merge` can admit `main` and refuse `production`. That half is a rule a session
  follows; read the base (`gh pr view --json baseRefName`) before every merge.
- Playwright disposes a request context's responses with the context: after `dispose()` a
  response's `status()` still answers and its `json()` throws "Response has been
  disposed". Read the body first (`e2e/readiness.ts`). A stand-in context in a unit test
  disposes nothing: test such code with `request` from `@playwright/test` against a local
  server (`test/e2e-readiness.test.ts`).
- Re-running a promotion's failed job runs that run's own commit again: a suite fault is
  fixed by a merge, whose promotion finds nothing pending, migrates nothing, deploys the
  new commit and runs the suite with fresh tickets.
- The migration reading flags by text and widely (`reading.ts`): a trigger's `BEFORE
TRUNCATE`, a quoted word and a function's body are not flags, a dropped constraint, a
  REVOKE and an enum value are. A flag sends the migration to the owner; it is not a fault.
- A Vercel deploy hook takes no commit: it builds its branch's head at the moment it is
  called, and answers `{ job: { id, state } }` with no deployment in it. The promotion
  calls it only while `main`'s head is the run's commit and learns what was built from
  the host's `/api/ready` alone. Anyone holding the hook's address can deploy with it.
- `apps/web/vercel.json` is read by every Vercel project rooted there, production's
  included: `git.deploymentEnabled` for `main` stops both building `main` on a push.
- `pnpm audit` can turn red with nothing changed here: on 2026-11-17 a high advisory
  against `picomatch` (GHSA-fc5q-39xc-vjpf, `<=4.0.7`) named `4.0.8` as patched while the
  registry's newest was `4.0.7`. An override cannot hold what is not published. It is
  excepted by name under `audit.ignore` in `pnpm-workspace.yaml` (pnpm 11's key;
  `auditConfig.ignoreGhsas` is the deprecated one), which also drops it from the counts:
  read `pnpm audit --prod --json` for where an advisory reaches before excepting any.
- "Production" means two things. The staging Vercel project's Production deployment is
  staging, with `VERCEL_ENV=production`: nothing may read `VERCEL_ENV` to decide what a
  deployment is. `traderEnvironment` (`apps/web/src/server/environment.ts`) reads
  `TRADER_ENVIRONMENT`, and a deployment without it refuses to start — a pull request's
  Preview included, so the variable is set for Preview too.
