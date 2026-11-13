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
- An MCP server registered while a Claude Code session is open has no tools in that session;
  restart it. Until then `maestro mcp` answers MCP over stdio (`initialize`, `tools/list`,
  `tools/call`) from any script.
- Maestro's MCP has no tap or type tool: every action is `run` with inline YAML.
  `take_screenshot` takes about 25 s, the rest under a second; the first use leaves a
  `maestro-driver-ios` app on the simulator. `assertVisible` takes no `timeout`
  (`extendedWaitUntil` does), and a wrong key fails the whole flow before it starts.
- `materials/cost.test.ts`, "prices an open receipt…", asserts `updated_at` changed: the
  fixture's insert and the save can share a millisecond of the Node clock (seen once on
  2026-11-12, red in a full `pnpm check`, green on the rerun). Rerun; the fix is its own line.
- `roster/pay-rates.ts` and `roster/list.ts` import each other: a module that loads
  `pay-rates.ts` first finds `rate` undefined at load. Pure consumers import
  `roster/rate-on.ts`; a query on `pay_rates` elsewhere selects the table itself.
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
- `materials/create-commit.test.ts`, "answers the same entry sent twice at once…", failed
  once on 2026-11-12 in a full `pnpm check` of a documents-only tree, and passed 15 reruns
  alone: 23505 on `materials_company_id_id_unique` from `material.create`'s insert
  (`create.ts`, step 6). Its `ON CONFLICT` names `id`, and `materials` has a second unique
  on `(company_id, id)`, which a conflict target does not cover — the likely cause, not
  proven. One of two identical entries sent at once would answer a failure and write
  nothing, and its resend `duplicate`. Rerun; the fix is its own line.
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

### 2026-11-12 — Maestro chosen for native UI flows; documents only

- **Did:** branch `maestro-e2e-decision` from `499ac50`, documents only. A read-only
  evaluation: no mobile app and no Playwright exist yet, so nothing can be driven today; on
  the Mac, Xcode 26.6 with iOS 26.2 and 26.5 simulators, Android Studio with one API 36.1
  emulator and its bundled JDK 21, no Maestro, no system JDK. Three Stage 5 lines in TASKS
  (the CLI and MCP, the development sign-in with its smoke flow, the flow suite), the
  emulator line moved to the Mac, one decision row, the `testID` rule in RULES. No code, no
  dependency, no CI change. 999 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its six
  recommendations), the row of that date in ARCHITECTURE. Not done: Maestro is not
  installed and its MCP server is not registered — the session's permission classifier
  refused the Homebrew tap and the `~/.zshenv` edit, so both are the owner's to run and the
  new CLI line stays open. Not yet proven, and that line's to prove: that Maestro 2.12
  drives iOS 26.x simulators and an API 36.1 emulator (its docs list older ones), that it
  runs on Android Studio's runtime as `JAVA_HOME`, and whether a flow can answer a biometric
  prompt. Read on Maestro's pages that day: physical iPhones are not supported, and
  `setAirplaneMode` works on Android only.
- **Next:** owner installs Maestro and registers its MCP server, then reviews and merges the
  branch; then Stage 4's next open line, office-created material entries (V1-D09; plan
  first: schema).

### 2026-11-12 — Maestro's MCP proven on the iOS 26.2 simulator and the API 36.1 emulator

- **Did:** on `maestro-e2e-decision`, no code. Maestro 2.12.1 (installed by the owner) on
  Android Studio's JDK 21, driven through `maestro mcp` over stdio. On iPhone 17 Pro, iOS
  26.2, and on `Medium_Phone_API_36.1` (Android 16, arm64): `list_devices`,
  `take_screenshot`, `inspect_screen`, a flow that opens Settings, taps a row and asserts
  the next screen, and the same flow red on a wrong assertion. `setAirplaneMode` on and off
  on the emulator, read back with `adb`. Both devices shut down after; the emulator ran
  with `-no-snapshot-save`. The CLI line in TASKS ticked. 999 tests.
- **Decided:** nothing. Not done: the tools were not called through Claude Code's own
  binding — `claude mcp list` shows the server connected, but it was registered after the
  session began (Notes); iOS 26.5 was not booted; no flow is committed. Not provable until
  `apps/mobile` exists: a `testID` reaching Maestro's `id`, the New Architecture, and a
  biometric prompt answered end to end — the host channels exist on both platforms (Notes),
  and the emulator has no PIN or enrolled finger, left so on purpose.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line,
  office-created material entries (V1-D09; plan first: schema).

### 2026-11-12 — Office-created material entries (V1-D09)

- **Did:** branch `office-material-entries` from `e3f653c`, seven commits. `0033`:
  `materials.entered_by_office` and its CHECK, back-filled `false`. `material.list`,
  `approval.queue` and `closeout.review` answer the provenance. `material.create`, admin-gated,
  with its gate line; one office receipt in the demo; the form on `/materials` and "Entered
  by the office" on `/materials`, `/approvals` and `/closeout`, checked in the browser on
  `trader_demo` at 390, 768, 1024 and 1280 — an open-day entry by keyboard, a closed-day
  one with its approval sentence and its row in the queue as the admin's own, an archived
  job, an empty form, a zero quantity, a malformed amount and a future date refused under
  their fields, no sideways scroll, no control under 48 pt narrow or 44 pt wide. Watched
  red: the CHECK, the dropped default, push's provenance clause and its literal, the three
  read fields, the gate, the caller re-read, the job lookup, the future refusal, the
  field-write lock, the approval insert, create's provenance clause and literal, noon, the
  raced answer. No dependency. 1,028 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its seven
  recommendations), the row of that date in ARCHITECTURE and the DESIGN amendment (Material
  entry): archived jobs admitted; noon of the named day in the company's zone; a future day
  refused, no lower bound; an open-day entry counts without approval; the back-fill; the
  demo's entry; no audit row. Changed from the plan: no second read of the id after the
  field-write lock — the insert's conflict answers it, and a test of the same entry sent
  twice at once pins that; a closeout and an entry on one job meet on the job's row, before
  the field-write lock; a correction's queue item also carries its receipt's logger. One
  extra commit fixed a test of mine that compared two receipts by position. Not done: no
  browser test in CI (its own TASKS line), no Spanish office strings, no pull change.
  Not seen in the browser, covered by tests only: `id_conflict`, a `duplicate` resend, a
  correction of an office receipt in the queue, a second admin deciding an entry. Worth
  knowing: the office row's `logged_at` is a convention, so nothing should sort or judge
  office receipts by time of day; a company with one admin can never decide its own
  closed-day entry.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, hours and
  cost aggregation (V1-D13).

### 2026-11-12 — Hours and cost aggregation (V1-D13)

- **Did:** branch `hours-cost-aggregation` from `cd28d90`, seven commits. `labor/hours.ts`
  (the one rounding, cells per worker, job and work date), `roster/rate-on.ts`, the money
  arithmetic in `jobs/cost.ts`, `materials/standing.ts` (the receipt read `material.list`
  had inline), `readDayHours`; `labor.hours` and `job.cost`, admin-gated, with their gate
  lines; the demo's last step and `run.test.ts` hold both jobs to figures worked out by
  hand, and `pnpm demo --reset` was checked by query. No migration, no screen, no
  dependency. Watched red: the half-up hour, rounding per session, an open session
  counted, a voided one kept, the zone, both gates, the person and job lookups, both range
  ends, both edges of the worker window, the decisions, the job filter, the 31-day bound,
  the half-up cent, a total across currencies, the rate of the day, unrated as zero,
  pending labor and pending, rejected and voided receipts folded in, another job's cells
  and receipts, a free receipt read as unpriced. 1,063 tests.
- **Decided:** by the owner on 2026-11-12, in the plan's two questions and its approval:
  a cost line is rounded half-up to the cent and totals are sums of lines; a session that
  counts but is still open adds nothing until it ends. The row of that date in
  ARCHITECTURE. Changed from the plan: `rateOn` is a file of its own and the rates query is
  in `jobs/cost.ts`, not `pay-rates.ts` (Notes, the import cycle); the money helper is
  `byCurrency`; pending labor also reports its unrated hours. Not done: no screen and no
  browser check (the next line's); `queue.ts` and `pull.ts` keep their own copies of the
  receipt read. Worth knowing: both reads fold the whole ledger of every worker involved,
  with no limit; a pending session whose void waits shows zero pending hours, as the queue
  does; who has no rate is unrated, never free. Open for the owner: `TASKS.md` line 14,
  "Resync every other clone", is still unticked in Stage 0 — a human action, to tick or
  strike.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, the
  reconciliation view and job cost on the job screen.

### 2026-11-12 — Job cost on the job page, and the reconciliation view

- **Did:** branch `reconciliation-and-job-cost` from `a7cd4e0`, four commits. `labor.hours`
  also answers `workers` and `totals`, sums of its rounded cells. `/jobs/<id>`, linked from
  the job's name on the jobs list: job cost to date from `job.cost`, what is in no total
  listed apart, labor by day. `/reconciliation` under People: approved hours per person by
  day and job for up to 31 work dates, and the days with something waiting, rejected or
  open apart. Pure view modules (`cost-view.ts`, `reconcile-view.ts`) and `format.hours`.
  Checked in the browser on `trader_demo` at 390, 768, 1024 and 1280 — the first job against
  `EXPECTED_COST` to the cent, a job with nothing recorded, an unknown id, a non-id address,
  the demo's two weeks with Priya's 6.50 h day and Elena's 8.50 h waiting, an empty range,
  a backward and a 32-day range refused under the field with no request made, the job link
  and the form by keyboard; no sideways scroll, no control under 48 pt narrow or 44 wide.
  Watched red: a sum that skips a cell, a total rounded again from milliseconds, the worker
  order, a dropped line beside the total, pending labor judged by hours, the line order,
  hours through a float, approved cells unfiltered, a person's total recomputed in the
  browser, rejected left out of unresolved. No migration, no new procedure. 1,079 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its four
  recommendations), the row of that date in ARCHITECTURE and the DESIGN amendments
  (Reconciliation in the People group; Job cost; Reconciliation): the view reads a range of
  work dates now, and its period picker and carried adjustments moved to the pay-period
  line in TASKS; totals come from the server. Changed from the plan: the two links under
  "Not in these hours" are lines of their own, not words in the sentence; an id the server
  will not parse reads "There is no job at this address". Not done: no browser test in CI,
  no Spanish office strings, no receipt list on the job page, no link that opens the ledger
  or the queue on the entry, Figma's screens as built. Not seen in the browser, covered by
  tests only or not at all: two currencies, the open-session and rejected- or
  voided-receipt lines, "No hours are approved on these days yet", the load-failure banner,
  a worker's or foreman's refusal. For the owner: `TASKS.md` line 14, "Resync every other
  clone", is still unticked; and the last `pnpm check` of this branch was red once on a
  race in `material.create` from the previous line (Notes), green on the rerun — a fix
  needs its own TASKS line.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, pay periods
  (V1-D03; plan first: schema, money).

### 2026-11-12 — Pay periods (V1-D03)

- **Did:** branch `pay-periods` from `fe0fea8`, ten commits. `0034`–`0036`:
  `pay_period_lines`, the close's unresolved counts, the pay-period lock, a period inserted
  open and never earlier than a closed one, lines sealed at the close. `pay-periods/lines.ts`
  (pure: the close's subtraction), `payPeriod.list`, `open`, `update`, `read`, `close` with
  their gate lines; two periods in the demo, week one closed with an entry waiting.
  `/pay-periods` under People and the period picker with adjustments on `/reconciliation`,
  checked in the browser on `trader_demo` at 390, 768, 1024 and 1280 — week one at 272.00 h,
  week two at 200.00 h carrying +6.50 h, the close by keyboard with the box ticked, a stale
  count refused with the new one, a close already made elsewhere, the next period opened,
  its dates moved, a 32-day period refused under its field; no sideways scroll, no control
  under 48 pt narrow or 44 wide. Watched red: every 0035 and 0036 guard, the lock, the
  caller re-read, each refusal, the acknowledgment's two comparisons, the stored counts,
  `exported` left out, the earlier-period filter, a closed period derived again, the
  preview's carrier, the view rules. 1,156 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its nine
  recommendations), the row of that date in ARCHITECTURE and the DESIGN amendments (Pay
  periods in the People group; Reconciliation; Pay-period close). Changed from the plan:
  three migrations, not two — access (`0035`) apart from guards (`0036`), as 0030 and 0031;
  no `overlaps` answer, since contiguity already refuses it as `not_contiguous`; ten
  commits, not nine, one of them a fix found in the browser (the toggle read "Close" beside a period;
  closing dropped focus to the page). Not done: the payroll CSV (next line), no browser
  test in CI, no Spanish office strings, no audit row, no field-write lock. Not seen in the
  browser, covered by tests only: `earlier_open`, an open session in the acknowledgment, a
  negative adjustment, an open period that is not the next to close, the load-failure
  banner, a worker's refusal. Worth knowing: a close folds every worker's whole ledger in
  one statement, with no limit; a session moved by correction onto a date in no period
  leaves a negative adjustment and no positive one; the second of two closers waits up to
  5 s; the first `pnpm check` of the screen commit ran before its one added format test.
  For the owner: `TASKS.md` line 14, "Resync every other clone", is still unticked; the
  Stage 6 Neon line says "29-file journal" and the journal now has 37.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, the
  payroll-hours CSV (V1-D18; columns decided in its plan).

### 2026-11-12 — Release 0.1 fast-track planned; its decisions written into the documents

- **Did:** a read-only readiness assessment at `6a2da5e` (code, documents, tooling,
  accounts, the stores' and vendors' pages), then branch `release-0.1-track`, documents
  only: six decision rows, ARCHITECTURE's stack, identity, accounting and domain sections,
  PRD Access, Invoicing and the release definitions, the Release 0.1 track at the head of
  TASKS with the stage lines it changes. No code, no migration, no dependency. Found: no
  `apps/mobile`, no Clerk, no deploy configuration, invoices as schema only; the API is a
  route handler whose every call is one transaction, so it runs on Vercel with no second
  host; `eas whoami` not signed in; `jpteq.app` delegated to Cloudflare with no record
  resolving; no Sentry configuration anywhere to reuse.
- **Decided:** by the owner on 2026-11-12 (the fast-track brief, the publisher-identity
  note, and the plan approved with its recommendations), the Release 0.1 rows of that date
  in ARCHITECTURE: SMS-code sign-in for the crew and email code for the office, passkeys
  not built; both stores from the individual accounts; recorded payments and invoice email;
  one deployment on `app.jpteq.app` and the apex, no `api.` host; Neon point-in-time restore
  for the release; the outbox, the location stamp and Spanish kept in the first field
  build. Not done: nothing is installed or created — the accounts and the Claude Code
  connectors are the owner's two lines in the track; MEMORY's log was not rolled up. Not
  verified, each named on its line: the Play account's creation date, whether store or Expo
  records exist, Neon's restore window, how a store reviewer passes an SMS code on a
  production Clerk instance. For the owner: `TASKS.md`, "Resync every other clone", is
  still unticked.
- **Next:** owner reviews and merges the branch and works the two owner lines; then track
  line R1, phone identity (plan first: schema, auth).

### 2026-11-12 — Phone identity (Release 0.1, R1)

- **Did:** branch `phone-identity` from `7ba46db`, seven commits. `0037`:
  `users.sign_in_phone`, E.164 `+1` by CHECK, unique per company. `0038`:
  `app_identity_phone()`, two more identity policies, the guard counting the phone setting.
  `0039`: `email` nullable, one sign-in address required. The adapter carries a verified
  email, a verified number or both; a third development header; `resolveUser` binds on
  either, exactly one row or nobody; `roster.invite` takes a number, an email or both and
  answers `phone_taken`; `me.get` and `roster.list` answer `signInPhone`. `/roster` and
  `/profile`, checked in the browser on `trader_demo` at 390, 768 and 1280 — an invitation
  by number by keyboard, by both, by neither, a foreign number, `phone_taken`,
  `email_taken`, the Sign-in column, the profile's read-only number, no sideways scroll, no
  control under 48 pt; a phone-only caller bound with `curl`, a second login with its
  number 401. Watched red: both column constraints, the presence check, both policies, the
  guard's phone rule, the setting set and cleared, the exactly-one rule, the adapter's
  refinements, the development header, each invite refusal, the normalisation, the stored
  number, the cookie bridge. No dependency. 1,189 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its seven
  recommendations), the three rows of that date in ARCHITECTURE and the DESIGN amendments
  (Profile form; Roster): a column of its own; no path to add or change a sign-in address
  after the invitation; per-company uniqueness, ambiguity fails closed; no role rule on the
  address; the browser's development sign-in stays email-only; the Sign-in column; `+1`
  only. Changed from the plan: the invite form also refuses a malformed number before any
  request; the demo and seed are untouched, so no demo person has a number. Not done: no
  browser test in CI, no Spanish office strings, no check at 1024. Not seen in the browser,
  covered by tests only: a person with a number and no email on `/profile`, the load
  failure. Not verified, R2's to read on Clerk's pages: that Clerk reports numbers in
  E.164, and how a session shows a verified number and email to the adapter. Worth knowing:
  a two-address cell makes a wide roster row two tight lines in 49 pt; a row bound in a
  local or demo database by a `dev:` subject can never be rebound to a provider's. For the
  owner: `TASKS.md`, "Resync every other clone", is still unticked; the Stage 6 Neon line
  says "29-file journal" and the journal now has 40.
- **Next:** owner reviews and merges the branch; then track line R2, Clerk behind the
  identity seam (plan first: auth; needs the owner's Clerk application).

### 2026-11-12 — Clerk behind the identity seam (Release 0.1, R2): built, not yet signed in to

- **Did:** the owner created the Clerk application (development instance, Hobby): invite-only,
  email and SMS codes, a number required, passwords, passkeys, usernames and SSO off, no
  self-service address change or deletion, 7-day sessions. Branch `clerk-identity-seam` from
  `f8e0243`, six commits. `IdentityDirectory` in every context and `roster.invite` admitting
  through it, a number now required; `@clerk/nextjs` 7.9.25 in `apps/web`; the claims adapter,
  the identity mode, `proxy.ts`, Clerk's provider, `/sign-in`, sign-out and the
  not-on-a-roster state; the Clerk directory over `POST /v1/users`; `.env.example`, three
  decision rows, DESIGN, TASKS. No migration, no new procedure. Seen: a build with no Clerk
  key passes; in the browser at 1280 and 390, `/sign-in` drawing Clerk's form with no
  sign-up; by `curl` on `next dev`, each mode's sign-in route 404 under the other, `me.get`
  401 with and without the development headers, `status.get` 200. Watched red: the invite's
  admission, its order and the required number; the flag rule, the mode rule and the
  adapter's catch; the sign-in 404; four rules of the directory. 1,213 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its seven
  recommendations, and "phone required" set by hand in Clerk), the three rows of that date in
  ARCHITECTURE. Changed from the plan: the directory creates the user by number alone when
  only the email is already held at Clerk, which the plan had counted as admitted; the
  proxy passes no key option (Notes); `apps/web` validates without `zod` (Notes); the
  sign-in page's other two states are not unit-tested (Notes). Not done: **R2 is not
  ticked** — nobody has signed in through Clerk. The four session claims are not on the
  instance yet (a probe token carried none), so every Clerk session is 401 until the owner
  pastes them (`.env.example`); after that, unseen and still owed: a sign-in end to end, the
  bind to Clerk's user id, an invitation creating a user from the screen, sign-out, the
  not-on-a-roster state, how the four claims render, a tab asleep past 60 s, the built
  app's 404 and 401 by `curl`. Not done at all: Spanish office strings, a browser test in
  CI, a session from the phone (R5). For the owner: PRD Access still says "an office admin
  is invited by their own email address", and the code now requires a number of everyone —
  the PRD sentence is the owner's to amend; `/sign-in` is drawn inside the office shell,
  navigation included, where DESIGN's Brand section speaks of a sign-in screen on its own;
  Pro is needed before a production instance (SMS, 30-day sessions), not before; `TASKS.md`,
  "Resync every other clone", is still unticked.
- **Next:** owner pastes the four claims into Clerk (Sessions, Customize session token) and
  creates one test admin there; then R2's end-to-end check on a throwaway database, and the
  tick.
