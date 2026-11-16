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

### 2026-11-12 — R2 signed in end to end and ticked

- **Did:** the owner pasted the four session claims into Clerk. A real token then carried
  them as the adapter reads them: the flags as booleans, the number in E.164, a missing
  email as `null`. On a throwaway database and Clerk test numbers, in the browser on
  `next dev`: the seed admin signed in by code and was bound to Clerk's user id; the roster
  loaded; an invitation from the screen wrote the row, its audit row and the Clerk user;
  sign-out; a Clerk user no roster names read the not-on-a-roster state and signed out
  from it; the admin signed in again with no reload. On a built app with
  `TRADER_DEV_IDENTITY=enabled`, by `curl`: `/dev-signin` 404 to GET and POST, `/sign-in`
  200, `me.get` 401 with no session, with the development headers and with the cookie. One
  more commit on `clerk-identity-seam`, found by that check: the header kept the last
  person's name after a sign-out (Notes). The database dropped and the three test users
  deleted after. 1,213 tests.
- **Decided:** nothing. Not done: a tab left asleep past Clerk's 60-second token was not
  tried — a headless tab never sleeps; `CLERK_AUTHORIZED_PARTIES` was left blank
  throughout, so the option was never exercised against a real token; the session reset and
  the sign-in page's two drawn states have no unit test; nothing was checked at 768 or 1024;
  email-code sign-in was not tried, only the number. Seen once and not explained: Clerk's
  form stuck on its code step (Notes). For the owner, unchanged from the entry above: the
  PRD Access sentence, `/sign-in` inside the shell, Pro before production; and one test
  user of the owner's own, `+1 201 555 0000`, is still on the development instance.
- **Next:** owner reviews and merges the branch; then track line R3, the production path
  on staging (plan first: CI, auth).

### 2026-11-12 — Production path on staging (Release 0.1, R3): built, staging begun, not ticked

- **Did:** branch `production-path-staging` from `c8e7209`, seven commits. `assertLoginRole`
  beside the runtime guard. `pnpm --filter @trader/db onboard`, a dry run unless `--apply`.
  The environment checked at start (`deploy-env.ts`, `instrumentation.ts`, `start.ts`).
  `GET /api/ready`. The content security policy per request in `proxy.ts` and transport
  security in `next.config.ts`. `@sentry/nextjs` 11.12.0 in `apps/web` behind
  `ErrorReporter`, server only, every outgoing event rebuilt from an allow-list.
  `packages/db/README.md`; six decision rows; `.env.example`. No migration, no procedure, no
  CI change. Seen locally on a built app: a build with nothing set passes and the same
  build refuses to start, naming `DATABASE_URL`, `CLERK_AUTHORIZED_PARTIES`, `SENTRY_DSN`;
  with placeholders, the four baseline headers and the policy on `/sign-in`, all 18 scripts
  carrying the request's nonce, Clerk's form drawn in a browser with one refusal in the
  console, its telemetry, since switched off; `/api/ready` 503 against no database, reported.
  Watched red: both login comparisons and the guard behind them; onboarding's bypass
  refusal, both duplicate refusals, the name's case and spacing, input validation, the
  stated counters, the rollback; each start-up requirement and both runtime checks;
  readiness's login check, its report and its status; the policy's host check, closing mark,
  `'strict-dynamic'` and nonce length; the allow-list, an exception's message, the message
  rule, the tag list, the integrations and collection switches, the reporter's address check
  and its deferral. 1,295 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its nine
  recommendations, and three answers: `@sentry/nextjs`, staging in a Neon project of its
  own, the journal replayed as it stands), the six rows of that date in ARCHITECTURE.
  Changed from the plan: the forced error for Sentry is a failed readiness check, not an
  invalid `TRADER_SYNC_MODE`, which now stops the start (Notes); Clerk's client telemetry is
  off; the start-up work is in `start.ts` (Notes); readiness sets no statement timeout, the
  pool's 5 s connection timeout standing alone; the policy leaves out
  `upgrade-insecure-requests`, which transport security covers. Staging, by the owner that
  evening: a Neon project on Postgres 18.7 in `aws-us-east-1`, its owner read as
  `rolbypassrls` and `rolcreaterole` true and not a superuser, its sample table dropped; a
  Sentry organization and project; a Vercel project rooted at `apps/web` on Hobby, whose
  first build of `main` passed in 55 s with no variable set; the vendors' Neon, Vercel and
  Sentry plugins in Claude Code. Not done: **R3 is not ticked.** Staging is not migrated,
  `trader_app` has no password, no Preview variable is set, nothing has signed in on a
  deployment, no report has reached Sentry, no restore has been timed and the window is not
  recorded (the project read 6 hours of history on the free plan). Unseen and owed on the
  deployment: Sentry receiving anything at all — the SDK was run only against a recording
  transport — and `after()` holding a function open for it; `onRequestError` on a real
  error; the policy under a signed-in office, Clerk's challenge frame and its image host;
  HSTS as Vercel serves it; the pool behind PgBouncer; `assertLoginRole` on a real login,
  which no test can make. Not done at all: a browser SDK, source maps, rate limits, the
  `Origin` check, the per-transaction `session_user` check, `attachDatabasePool`. For the
  owner: Vercel's terms keep Hobby to non-commercial use, and the restore drill needs a
  Neon plan with instant restore — both are approvals at their step; once this merges, the
  Production deployment refuses to start until R9 sets its variables, by design; the Vercel
  plugin sends its vendor a daily ping and the names of its own skills unless
  `VERCEL_PLUGIN_TELEMETRY=off`; PRD Access still says an admin is invited by email, and the
  onboarding script, like `roster.invite`, requires a number — the PRD sentence is the
  owner's to amend; `TASKS.md`, "Resync every other clone", is still unticked.
- **Next:** owner migrates staging over the direct endpoint, sets `trader_app`'s password
  and Vercel's Preview variables (`packages/db/README.md`); then the staging checks, the
  restore drill, and the tick.

### 2026-11-13 — R3 staging acceptance begun; written on 2026-11-14 from what can still be read

- **Did:** no entry was written that day; this one states only what the repository and
  the vendors still show. Commits `d0cb6a2` (the release named in the Sentry SDK test, red on
  CI before it) and `00679b2` to `56f13dc` (the operator-access TASKS line, onboarding
  printing a connection failure's own code, the runbook through the Keychain wrapper, the
  decision row, the Sentry tidy-up line). Five Preview variables on Vercel, each scoped to
  `production-path-staging`. On staging's database: the journal's 40 migrations, one
  company `R3 Staging Co`, an admin and a worker with fictional numbers, both bound to a
  Clerk user, one audit row, `trader_app`'s grants in place. Sentry `trader-web`: three
  events at 22:06 UTC from the preview of `d0cb6a2`, `customer.list` twice and `job.list`
  once, each `sqlstate 42501` — the forced error. Not readable any more, so not claimed:
  which browser checks were made and what they showed.
- **Decided:** by the owner, the row of that date in ARCHITECTURE (staging operator
  access), since amended by the 2026-11-14 rows.
- **Next:** the restore drill and R3's record.

### 2026-11-14 — Staging autonomy, tools and the browser suite: built; staging runs wait on four Keychain items

- **Did:** `production-path-staging` pushed (PR #92 at `56f13dc`). Branch
  `staging-autonomy` from it, nine commits: three TASKS lines; `.gitignore`;
  `@playwright/test` 1.65.0 with `apps/web/e2e` (configuration and one serial flow) and
  the `e2e:staging` scripts; three decision rows; RULES (Toolbox, the agent's push and pull
  request); `CLAUDE.md`; the database runbook; `.env.example`. Outside the repository:
  wrappers `staging-app`, `staging-e2e`, `staging-neon`, `sentry-read` beside the two of
  2026-11-13; the permission rules rewritten in three tiers; Neon CLI 9.4.0, Sentry CLI
  3.8.2 and Clerk CLI 4.1.0 installed; Clerk's MCP server registered. Seen: `pnpm check`
  green four times (1,295 tests), the suite listed by Playwright and refusing to load
  without its two values; each wrapper refusing a bad call; `gh pr merge` and
  `vercel env pull` refused by rule, `vercel whoami` and the application-role wrapper
  running unprompted. Sentry reassessed, read-only: all three events of `TRADER-WEB-1` and
  `TRADER-WEB-2` carry a tag list, the release, a request id, `user.geo` (Ashburn, the
  sending server's city, with every user field null), a `trace` context and
  `error_names` `k>e>DatabaseError`; nothing about a person, and exactly the three items
  of the open tidy-up line. Both issues left unresolved.
- **Decided:** by the owner on 2026-11-14 (plan v2 approved, and eight answers), the three
  rows of that date in ARCHITECTURE: split by role, with only owner-role SQL and Neon's
  destructive commands prompting; `.env` kept as the local file, no staging file;
  previews kept behind Vercel's protection, reached with the automation bypass, no custom
  domain; the suite run on demand, not in CI; the four tools; this work on its own branch.
  Changed from the plan: the suite sends the bypass once and keeps its cookie instead of a
  header on every request (Notes); `staging-e2e` takes a branch name, not a URL; a fourth
  wrapper, `sentry-read`; `vercel alias` stays denied, since no domain is used; the first
  push was refused by the session's classifier and went through once the rule was written.
  Not done: **nothing has run against staging.** The suite has never met Clerk's form or
  the wall, so its selectors are unproven; the application role's connection, the Neon
  and Sentry CLIs and Clerk's MCP have answered nothing; no variable was set and no preview
  redeployed; Playwright's browser is not downloaded; no Maestro flow was run (its devices
  were listed); `staging-app web-dev` untried. The restore drill was not run and no
  Sentry issue was changed, by instruction. For the owner, the smallest set: Vercel's
  automation bypass secret generated and stored as `trader-staging-vercel-bypass`; the
  pooled `trader_app` string as `trader-staging-app-url`; a Neon key scoped to the staging
  project as `trader-staging-neon-key`; a Sentry read token as `trader-sentry-token`; the
  five Preview variables widened to every preview branch; Clerk's MCP sign-in in a new
  session; the two stray keys in `.env`. EAS is not signed in. `TASKS.md`, "Resync every
  other clone", is still unticked.
- **Next:** owner creates the Keychain items; then the browser suite on the
  `production-path-staging` preview, R3's record, and the restore drill on the owner's
  separate word.

### 2026-11-14 — Staging moved to a Vercel project of its own; the browser suite green on it

- **Did:** on `staging-autonomy`, four commits. The owner created a second Vercel project
  for staging (Node 24.x, rooted at `apps/web`, protected on every deployment, previews
  only), its bypass secret, four Preview variables and the Keychain items. Outside the
  repository, installed by the owner from files this session wrote: `staging-vercel`,
  pinned to that project's ids and checking them with Vercel before every command, and
  `staging-e2e` taking a deployment URL; the nine unpinned Vercel rules removed. Watched
  refusing: `deploy --prod`, a URL of the other project, a secret variable's name, the
  suite on the other project's host. Seen: the project's first record assigned to
  Production and cancelled unbuilt by its ignored build step; a CLI Preview READY with no
  alias; the pushed branch's Preview READY on the branch alias;
  `CLERK_AUTHORIZED_PARTIES` set for the branch to that origin and the redeploy taking the
  alias; 302 without the bypass. The suite red once at Clerk's email field, then all five
  steps green in 15 s on the alias. After it: one customer in the staging database with
  the run's stamp, no runtime error on the project, no new Sentry issue. Each credential
  answered a known read with no value shown. One `pnpm check` red on the
  `material.create` race (Notes), green on the rerun. 1,295 tests.
- **Decided:** by the owner on 2026-11-14, the row of that date in ARCHITECTURE: staging's
  own project, and its Preview deployments Claude Code's without asking each time.
  Changed from the plan: the first Preview came from the pushed branch, since the CLI
  refuses a Preview as a project's first deployment; the suite runs on the branch alias,
  not on a CLI deployment's URL; the wrapper also takes `env update` and `project`; the
  session's classifier refused the wrapper's install and the permission edit, so the
  owner ran both. Not done: **R3 is not ticked.** Of its three criteria: the office runs
  on the staging deployment as `trader_app` — seen, readiness 200 behind the wall and the
  flow green; a forced error reaching Sentry — seen on 2026-11-13 from the earlier
  project's preview, not forced again from this one, so this project's DSN is unproven;
  the timed restore — not run. Not seen: a `staging-vercel env rm` prompting, the
  wrapper's `logs --deployment`, the suite at any other branch. For the owner: the
  earlier project still builds a preview of every pushed branch and still holds the five
  staging-wired Preview variables for `production-path-staging`, left untouched by
  instruction; `TASKS.md`, "Resync every other clone", is still unticked.
- **Next:** owner reviews and merges the pull requests; then a forced report from this
  project's preview, and the restore drill on the owner's separate word, for R3's tick.

### 2026-11-14 — Sentry proven from the staging project; the restore drill prepared, not run

- **Did:** on `staging-autonomy`, documents only. A forced report from the staging
  project's Preview, with nothing changed on staging: a rolled-back row lock held as
  `trader_app` while the suite saved the fixture customer (Notes). Seen: the save refused,
  one `trader_error` line in the Preview's log, and one new Sentry issue carrying the
  environment `preview`, the release of the deployed commit, the request id, the path
  `customer.update` and `sqlstate 55P03` — no message, input, address or person; the same
  three extras as the open tidy-up line (`user.geo` of the sending server, a `trace`
  context, shortened class names). The lock read as rolled back and the suite green
  after. Read: staging's Neon project keeps 7 days of history (it read 6 hours on
  2026-11-12); pull request #93 has no `check` because its base is not `main` (Notes).
- **Decided:** nothing. Not done: **R3 is not ticked** — the timed restore is prepared
  and waits for the owner's word: a branch made from a past instant of staging's default
  branch, timed from the command to its first answered query, read back against a value
  the suite rewrote after that instant; the default branch is not rewritten, and the drill
  branch's deletion is a second approval. `staging-neon` does not yet pass `--no-secrets`
  on `branches create` (Notes); a corrected wrapper is written for the owner to install,
  and no branch is created before it is. For the owner: a third Vercel project on this
  repository, made minutes after the staging one, has no variable, builds every pushed
  branch and holds a Production deployment of this branch that answers 500 on a public
  `vercel.app` host; nothing of it was changed.
- **Next:** owner installs the corrected `staging-neon` and approves the drill; then
  R3's record and tick. Owner merges #92, then #93 once its `check` has run.

### 2026-11-14 — Restore drill timed on staging; R3 ticked

- **Did:** on `staging-autonomy`, documents only. The owner installed the corrected
  `staging-neon` (it adds `--no-secrets` to every `branches create`; `--secrets` watched
  refused). The drill, on the owner's word: an instant noted from the database clock
  (20:26:12 UTC), the suite run after it so the fixture customer's notes changed, then
  a branch of staging's default branch made from that instant. From the command to the
  branch's first answered query: 4 s. The drill branch read the notes as they stood
  before the instant, 40 migrations, two users, one audit row, and `trader_app` with its
  login attribute and grants; the default branch read the later notes, untouched. R3
  ticked on its three criteria: the office on the staging deployment as `trader_app`, a
  forced report in Sentry with nothing of a person, a point-in-time restore timed.
- **Decided:** by the owner on 2026-11-14 ("proceed", on the recommendation put to him):
  the drill is a branch from a past instant, not a restore of staging's default branch in
  place. Not done, and worth knowing: 4 s is the time for a database of one company and
  one customer and says little about a full one; an in-place restore was not rehearsed,
  nor a deployment pointed at restored state, nor a login as `trader_app` on it; the
  drill branch `restore-drill-20261114` and its compute still exist — deleting it is the
  owner's approval. For the owner: ARCHITECTURE still reads "The restore is not yet
  rehearsed" under its production-readiness list, the owner's sentence to amend; the
  third Vercel project and `TASKS.md`, "Resync every other clone", as before.
- **Next:** owner merges #92, then #93 once its `check` has run; then track line R4, the
  field app skeleton.

### 2026-11-14 — The drill written into ARCHITECTURE; #93 on `main` with its `check`

- **Did:** on `staging-autonomy`, documents only, after the owner merged #92 and #93
  retargeted to `main`. ARCHITECTURE: the readiness list states the rehearsal as an
  isolated recovery timed at 4 s and names what was not rehearsed, with a decision row
  for the drill's form. The pull request's description rewritten to what was verified.
  The required `check` had no run after the retarget; the next push started one (Notes).
- **Decided:** by the owner on 2026-11-14, the row of that date in ARCHITECTURE (the
  restore drill is an isolated recovery). Not done: the drill branch
  `restore-drill-20261114` still exists; the third Vercel project still builds every
  push; `TASKS.md`, "Resync every other clone", is still unticked.
- **Next:** owner merges #93; then track line R4, the field app skeleton.

### 2026-11-14 — Permanent staging branch created; no Preview of it yet, acceptance waits

- **Did:** `staging-preview` pushed at `main`'s commit `856b456` by an ordinary push.
  Read first: the staging project protected on every deployment, its ignored build step
  building only Previews, `CLERK_AUTHORIZED_PARTIES` set for `staging-autonomy` alone.
  Vercel started no build of the new branch (Notes), so nothing after the push could be
  done: no deployment, no alias, no variable, no browser run. Branch
  `staging-preview-branch`, documents only: the TASKS line, the Stage 6 decision narrowed
  to a staging domain, one decision row, RULES (Git and CI; Toolbox). 1,295 tests.
- **Decided:** by the owner on 2026-11-14, the row of that date in ARCHITECTURE (staging
  has a permanent branch): fast-forward only, moved by a session, no event-triggered
  workflow; deletion and force-pushes to be blocked at GitHub by the owner, no pull
  request required of it. Not done: **the TASKS line is not ticked** — none of its three
  runs exists. Owed after this branch merges: the fast-forward, the Preview of the new
  commit confirmed as the staging project's, its alias read from Vercel, the branch-scoped
  `CLERK_AUTHORIZED_PARTIES`, a redeploy, the suite; a second redeploy and the suite
  again; then a record of it, which is a later pull request and a second fast-forward.
  Unproven until then: that a fast-forward push builds, and that a redeploy keeps the
  alias on this branch. For the owner: the GitHub ruleset for `staging-preview`;
  `staging-autonomy` and its branch-scoped variable are left, each removal an approval of
  its own; the drill branch `restore-drill-20261114` is kept; `TASKS.md`, "Resync every
  other clone", is still unticked.
- **Next:** owner merges this branch; then the fast-forward of `staging-preview` and the
  permanent staging line's acceptance. R4 after it, plan first.

### 2026-11-14 — `staging-preview` fast-forwarded, authorized and green twice; not ticked

- **Did:** after the owner merged #94, `staging-preview` moved from `856b456` to `975027e`
  by the ordinary push in RULES. Seen: Vercel built that commit as a Preview of the
  staging project, READY in 39 s, its git ref `staging-preview`; the wrapper's `owns`
  answered for it; its one alias read from Vercel's connector; `CLERK_AUTHORIZED_PARTIES`
  added for the branch with that origin; a redeploy READY in 44 s with the alias moved to
  it; the suite's five steps green in 17.9 s on the alias. Then a second redeploy, READY
  in 43 s, the same alias on it, and the suite green again in 17.2 s. Around both runs:
  302 on `/api/ready` without the bypass, the project's protection still on every
  deployment, no runtime error on the project in the hour, no new Sentry issue (the
  three listed are of 2026-11-13 and of the forced report at 20:18 UTC). Branch
  `staging-preview-acceptance`, this file only. 1,295 tests.
- **Decided:** nothing. Not done: **the permanent staging line is not ticked.** Its third
  run, the suite on what a fast-forward builds, has been seen only through a redeploy:
  the build the push made had no authorized origin yet and was never run against. With
  the variable now in place, the next fast-forward is the first to show it unaided. Not
  seen: the suite red and then recovered on this alias; a session finding the branch
  behind at its start. Nothing was removed: `staging-autonomy`, its branch-scoped
  variable, the merged branch `staging-preview-branch` and the drill branch
  `restore-drill-20261114` all stand. For the owner: the GitHub ruleset for
  `staging-preview` (deletion and force-pushes blocked, no pull request required); each
  removal above is an approval of its own; `TASKS.md`, "Resync every other clone", is
  still unticked.
- **Next:** owner merges this branch; then the fast-forward, the suite on the Preview it
  builds with no redeploy, and the tick. R4 after it, plan first.

### 2026-11-14 — `staging-preview` green on a fast-forward's own build; the line ticked

- **Did:** after the owner merged #95, `staging-preview` moved from `975027e` to `6a9a149`
  by the ordinary push in RULES. Seen: Vercel built that commit from the push as a
  Preview of the staging project, READY in 18 s, its git ref `staging-preview`; the
  branch's alias on it with nothing asked; the wrapper's `owns` answering for it; 302 on
  `/api/ready` without the bypass; the suite's five steps green in 17.9 s on the alias,
  with no redeploy and no variable touched. Branch `staging-preview-tick`: the permanent
  staging line ticked on its three runs (2026-11-14: on the alias, after a redeploy,
  after a fast-forward), and this entry. 1,295 tests.
- **Decided:** by the owner on 2026-11-14: the evidence is sufficient for the tick, and a
  routine fast-forward gets no pull request of its own — its run is recorded in the next
  session entry that has other work to carry. Not done, the owner's: the GitHub ruleset
  for `staging-preview` (deletion and force-pushes blocked, no pull request required);
  the removals, each an approval of its own — `staging-autonomy` and its branch-scoped
  variable, the merged branches `staging-preview-branch`, `staging-preview-acceptance`
  and this one; the drill branch `restore-drill-20261114` is kept; `TASKS.md`, "Resync
  every other clone", is still unticked.
- **Next:** owner merges this branch; then the fast-forward and the suite, unrecorded
  unless red. Then track line R4, the field app skeleton, plan first.

### 2026-11-14 — Staging closed out: ruleset, last sync, old authorization and branches gone

- **Did:** read, and one approved removal; branch `staging-closure-record`, this file only.
  The owner made a GitHub ruleset for `staging-preview` — active, that branch alone, rules
  `deletion` and `non_fast_forward`, no bypass actor — and merged #96. `staging-preview`
  then moved from `6a9a149` to `733afd3` by the ordinary push, accepted under the
  ruleset; Vercel built it from the push as a Preview of the staging project, READY in
  15 s, the branch's alias on it; the suite's five steps green in 18.2 s with no redeploy.
  On the owner's word for that one item, `staging-vercel env rm` removed
  `CLERK_AUTHORIZED_PARTIES` scoped to `staging-autonomy`: read after it, the
  `staging-preview` value and the four Preview-wide variables stood, the deployment was
  the same one, and the suite was green in 14.1 s. The owner deleted the remote branches
  `staging-autonomy`, `staging-preview-branch`, `staging-preview-acceptance` and
  `staging-preview-tick`. Last read: `main` and `staging-preview` both at `733afd3` and
  the only remote branches; the suite green in 14.0 s; 302 without the bypass; no runtime
  error on the project and no Sentry issue later than the forced report of 20:18 UTC;
  Neon's `restore-drill-20261114` still there. Each staging tool answered one read: the
  Neon CLI (branches), the Sentry CLI (issues), the Clerk CLI and Clerk's MCP server
  (who it acts as; the development instance). 1,295 tests.
- **Decided:** nothing new. Production, as far as it was observed: the staging project
  protects every deployment and builds Previews only, and on #94 to #96 the other
  project's status read "Canceled by Ignored Build Step"; that project's own settings,
  variables and deployments were not read, by rule. Not ticked, and why: "Staging
  autonomy" — a destructive command prompting is the owner's to have seen (`env rm` is
  in the rules' ask list and ran once approved; a session cannot see its own prompt);
  "Staging tools" — every tool answered, but the Toolbox names no job for Clerk's MCP
  server, whose grant includes managing applications and users, and naming one changes
  what a session may do: a plan of its own; "Resync every other clone" — no other clone
  was inspected; `~/work/TRADER` is absent from this Mac. For the owner: local branches
  of the merged work remain in this clone.
- **Next:** owner merges this branch; then the routine fast-forward and the suite. Then
  track line R4, the field app skeleton, plan first.

### 2026-11-15 — Weekly schedule decisions written into the documents (S0)

- **Did:** a read-only assessment at `d05d655` (the prototype's files, the assignment and
  push code, the five documents), then branch `a03-schedule-documents`, documents only:
  nine decision rows of 2026-11-15 and the Office authority, Audit trail and pull passages
  in ARCHITECTURE; PRD, Weekly schedule; DESIGN's `compact` style and six component rows;
  track lines S0 to S9. No code, no migration, no dependency. Read of the prototype's
  fourth revision, kept outside the repository: 47 of its 48 checks pass and the one
  failure is the circular three-shift choice, which its pairwise rule leaves with half an
  hour nobody may clock in on; it is one HTML file that simulates every rule, and its
  punch lock is two sentences of text. 1,295 tests.
- **Decided:** by the owner on 2026-11-15, the rows of that date: a shift authorizes a
  clock-in under an enforcement switch that is off by default; exactly one eligible shift
  at every scheduled moment; 15 minutes early; the lock by a punch; the override history;
  a start captured offline stored for review; Copy Last Week; the words Schedule, Shift
  and Jobsite. Left to each line's plan and not decided: how eligibility is computed, the
  tables, the history's store, the locks, where the switch lives, how the server tells a
  start the schedule changed under from any other unscheduled one, and the interaction of
  the drawer overlay and of employee navigation on a phone. Not done: nothing is built, so
  `/assignments`, push and the built tests are as they were; 28 of the prototype's 49
  screenshots were not looked at; staging's `job_assignments` rows were not counted; the
  branch is not pushed. Worth knowing: there is still no `apps/mobile`, so S7 and S8 wait
  on R4 and R5; the V1-D07 line stays ticked and S3 and S4 name what they retire of it;
  whether Release 0.1's go/no-go requires enforcement on is not said anywhere.
- **Next:** owner reviews the branch; then track line S1, the eligibility rules as a pure
  module, plan first.

### 2026-11-15 — Schedule eligibility rules as a pure module (S1)

- **Did:** after the owner merged #98, `staging-preview` was moved to `8ca877d` by the
  ordinary push (read: both remote branches at that commit; by the owner's report, its
  Preview built and the suite green). Branch `s1-schedule-eligibility` from `8ca877d`, four
  commits. `assignments/eligibility.ts`, pure: `resolveDay` (one person's shifts and
  overrides on a day, to the one eligible shift at every covered minute or the issues that
  refuse it) and `admitStart` (scheduled, early within 15 minutes, or none). Tests with no
  database: every order of two and of three overlapping shifts, the boundary minutes,
  touching shifts, each refusal, and every accepted day held to one eligible shift at every
  minute — over every day of up to three shifts on six cuts, every fully decided day of
  four, and 400 generated days from fixed seeds, each also checked against the rules
  written a second way. Watched red: the overlap test, the excluded end, the missing
  decision, the conflict, the winner, the starved shift, the circle, the issue order, each
  structural check, 15 against 16, scheduled before early. No migration, no procedure, no
  dependency. 1,341 tests.
- **Decided:** by the owner on 2026-11-15 (the plan approved, its six recommendations): no
  property-testing library; a leftover override refused; every issue of the failing stage
  answered; seconds dropped by the caller; the file's name; the decision row of that date.
  Changed from the plan, found by the exhaustive test: the plan held that a circle always
  leaves time uncovered, and it does not — a fourth shift can hold all the time the three
  share. A circle is refused there too, so it is a check of its own before the stretches,
  and `circular_precedence` names three shifts and the time they share, not an uncovered
  stretch. Issues of one kind are ordered by time, then ids. Not done: nothing consumes the
  module; no zone conversion, switch, lock or procedure (S3, S4); the branch is not pushed.
  For the owner: the masked circle could instead be admitted, since every minute has one
  eligible shift — say so before S3 if that is the rule wanted; the prototype's own
  three-shift fixture was not read, so the half-hour test uses times of its own; local
  branches of merged work and a stale `origin/a03-schedule-documents` ref remain.
- **Next:** owner reviews the branch; then track line S2, the schedule schema, plan first.

### 2026-11-15 — Release 0.1 mandate: one plan for the track, written into the documents

- **Did:** an audit at `1c94b64` (`main`, `staging-preview` and staging's Preview all at
  it, CI green; staging's database at 40 migrations with no `job_assignments` row; no
  `apps/mobile`, no contract export, no invoice procedure, no payments table, no rate
  limit; `eas whoami` not signed in; the schedule prototype's file not on this Mac). Then
  branch `r01-mandate`, documents only: seven decision rows of 2026-11-15, PRD, DESIGN,
  RULES, `CLAUDE.md`, and five new track lines in TASKS. No code. 1,341 tests.
- **Decided:** by the owner on 2026-11-15 (the mandate and four answers), the rows of that
  date: the track worked without per-line approval; the payroll CSV and a plain invoice
  CSV in the release; an Overview and a Developer console with no new role; the
  navigation's names; enforcement on staging by a session after its gates; the
  `release-0.1` integration branch; one public staging host for the phones if the plan
  allows it at no cost. Order agreed: S2, S3, S4, S5, S6 with A01, payroll CSV and D01,
  R6 and R7, the edge line and the public host, R4, R5 with S7 and S8, staging
  enforcement and the integrated run, the device builds. Not done: everything after the
  documents. The owner's, each asked for at its step: `eas login` and the Expo project
  (R4), Resend's domain, key and one test recipient (R7), Clerk's native API on the
  development instance (R5), Apple sign-in and device registration for an ad hoc build.
- **Release 0.1 state** (kept current in the newest entry; a new session resumes here):
  branch `r01-mandate` from `1c94b64`; `release-0.1` not yet made; staging's Preview is
  `staging-preview`'s at `1c94b64`; last green: `pnpm check` on this branch; blockers:
  none; risks: the schedule screen is built from DESIGN's text, not the prototype; the
  public host's exemption, Clerk SMS to a real number on the development instance,
  Maestro offline on iOS and ad hoc provisioning are each unverified until their step.
- **Next:** S2, the schedule schema, on a branch from this one.

### 2026-11-15 — Schedule schema (S2)

- **Did:** branch `s2-schedule-schema` from `r01-mandate`. `0040`, `0041`: the exact-shift
  key, the punch lock and its guards, `copy_id`, `shift_overrides`,
  `shift_override_history`, `companies.schedule_enforced` under a column grant.
  `assignment.create` and `update` name the new key; three API tests restated under it.
  Watched red, each by removing it in the local database and restoring it with the
  migration's own statement: the exact-shift key, the mutation, insert and truncate
  triggers, the lock pair check, the override trigger, pair key, both checks and its
  foreign key, the history's three append-only triggers and two checks, both policies, the
  switch's grant and the history's. Counted first: staging holds no `job_assignments` row.
- **Decided:** in this line's plan, as the 2026-11-15 autonomous-execution row allows; the
  as-built row of that date in ARCHITECTURE: a history table of its own; the switch as a
  per-company column only the owner writes; the lock as two columns on the shift. Not
  done, and S3's and S4's: overlap, override need and "what authorized a start" are judged
  by no database guard; no writer takes an override or writes history yet; nothing sets a
  lock. Worth knowing: until S3 an office create of one job twice in a day at other times
  succeeds, overlapping or not.
- **Release 0.1 state:** branches `r01-mandate` (#100) and `s2-schedule-schema`, stacked;
  staging's database still at 40 migrations and its Preview at `1c94b64`; `release-0.1`
  is made from this branch next, then staging is migrated to 42. Blockers: none.
- **Next:** S3, the validated shift writers and the week read.

### 2026-11-15 — Validated shift writers and the week read (S3)

- **Did:** branch `s3-shift-writers` from `s2-schedule-schema`. `assignments/day.ts`: the
  person-day lock, the day's load, `judgeDay`, the history writer, the issues on the wire.
  `write.ts` rewritten: `assignment.create` with the browser's ids and a decision per
  overlap, answered day by day; `update`, `remove`; `assignment.decide`; each override
  write with its history entry. `assignment.week`, Monday to Sunday, with each shift's
  eligible hours, its lock and the week's overrides. Gate lines for both new procedures.
  The demo's plan step and the old `/assignments` screen moved to the new shapes. Watched
  red, by mutation: the authorization check, the schedule check, the day lock, the history
  write, both locked answers, the resend answer, the override dropped with its overlap,
  the holder inside the pair, the Monday rule, the week's eligible hours, a taken override
  id. 1,376 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. What is
  compared for "what authorized that start": after any write to a day, a start at the
  minute each locked shift's clock-in was recorded must still be admitted on that same
  shift. An override is never removed alone, only with its overlap. No `audit_log` row:
  the history table is the record. Not done: nothing sets a lock yet (S4), so the locked
  and authorization answers are reached only by fixtures; no copy (S5); the old screen
  shows a refusal in one sentence and offers no decision (S6 replaces it); the old screen
  was not opened in a browser after the change. Worth knowing: `assignment.list` and
  `mine` are unchanged; a day written before these writers that does not resolve reads
  `eligible: null` in the week and refuses every further write to that day until its
  overlap is decided.
- **Release 0.1 state:** branches `r01-mandate` (#100), `s2-schedule-schema` (#101),
  `s3-shift-writers`, stacked; `release-0.1` moves to this branch next and gets its first
  Preview; staging's database then goes from 40 to 42 migrations. Blockers: none.
- **Next:** S4, clock-in eligibility and the punch lock behind the switch.

### 2026-11-15 — Clock-in eligibility and the punch lock, behind the switch (S4)

- **Did:** branch `s4-clock-in-eligibility` from `s3-shift-writers`. `0042`: the approval
  reason `unscheduled`. `sync/schedule.ts`: the switch read, `judgeStart` under the
  person's day lock, the lock write. `sync.push`: with the switch on, a `started` judged
  by the schedule after validation, the shift locked in the event's transaction, an
  offline start the schedule does not admit stored pending with `unscheduled`, an online
  one refused `not_scheduled`. `sync.pull` answers `scheduleEnforced`. Seen on real
  commits: with the switch off a push completes while `job_assignments` is locked against
  every reader; an edit committed first leaves the start stored for review; a start
  committed first leaves the edit `locked`. Watched red, by mutation: fourteen rules
  (enforcement, crew not required, the archived job, the admin's exemption, the stored
  start, the admin worker, the lock, the lock once, the shift's job, the day lock, the
  schedule unread when off, the pull flag, the reason, the refusal's name). 1,395 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. The
  server tells the two cases apart by the record's own `captured_offline`: an offline
  start the schedule does not admit is stored for review whatever changed, and one
  captured with a connection is refused. The reason is `unscheduled`, the refusal
  `not_scheduled`. An unscheduled offline start for an admin worker is refused, since an
  admin's labor takes no approval to wait on. An archived job refuses a start under
  enforcement as without it. Not done: `assignment.list`'s `mayClockIn` still answers by
  crew under enforcement (S6 decides what the screen says); a lock stays when the admin
  later rejects the start that set it; the new tag was not seen in a browser; the phone
  (S7). The switch is off everywhere.
- **Release 0.1 state:** branches `r01-mandate` (#100), `s2-schedule-schema` (#101),
  `s3-shift-writers` (#102), `s4-clock-in-eligibility`, stacked, CI green on the first
  three; `release-0.1` has a Preview on the staging project with its own authorized
  origin, the browser suite green on it; **staging's database is still at 40 migrations**
  — the owner-role wrapper has no migrate command, and a version that adds one waits for
  the owner to install it; until then the schedule endpoints fail on that Preview.
- **Next:** S5, Copy Last Week.

### 2026-11-15 — Copy Last Week (S5)

- **Did:** branch `s5-copy-last-week` from `s4-clock-in-eligibility`. `assignments/copy.ts`:
  `assignment.copyPreview`, `copyConfirm`, `copyUndo`, with their gate lines; `day.ts`
  gained a loader for a range of days and one lock order for several people's days. No
  migration: the mark is S2's `copy_id`. Seen on real commits: two admins confirming one
  preview leave one copy and the other is answered the plan as it now stands; one
  confirmation sent twice at once is `copied` and `duplicate`; a statement made to fail on
  its third row writes nothing. Watched red, by mutation: the fingerprint compared and
  what it covers, the resend answer, the day locks, each reason for leaving a shift out,
  the copy's mark, the day carried from one copied shift to the next, undo's lock refusal
  and its history. 1,410 tests; the first full run was red once on the `updated_at`
  flake of `materials/cost.test.ts` (Notes), green on the rerun. Then red on CI: a deadlock
  in the db suite between S2's new foreign key and an older TRUNCATE test (Notes), which
  S2's own CI runs had not hit; fixed here in a commit of its own.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. The
  source is the week before the one named. A shift is left out for a deactivated person,
  an archived job, the same shift already there, an overlap, or a clock-in's leave it
  would take; of two that overlapped last week the earlier is copied. The fingerprint
  covers what is created and what is left out with its reason. A copy is known by the
  browser's id for it. Undo removes shifts edited since the copy too, with the history of
  any decision made on them. Not done: no screen (S6); undo's `stale` answer has no test;
  a copy of a week of about thirty people was not timed.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `s4-clock-in-eligibility`
  (#103) and this one, stacked, CI green on the first four; `release-0.1` moves here
  next. **Staging's database is still at 40 migrations** and waits for the owner to
  install the wrapper's migrate command; the journal is now 43.
- **Next:** S6, the Weekly Schedule screen, with A01's navigation.

### 2026-11-15 — Weekly Schedule screen (S6): built and checked in the browser; not ticked

- **Did:** branch `s6-weekly-schedule-screen` from `s5-copy-last-week`. `/schedule` under
  the name "Schedule", `/assignments` redirecting to it and the old screen removed:
  `schedule-view.ts` (pure, 12 tests), the grid, the drawer, the shift forms with overlap
  decisions and the day shown before a save, the Copy Last Week dialog with undo.
  `assignment.week` also answers the company's zone, each shift's copy, and who decided
  each override and when; `@trader/api/eligibility` exported for the browser. Checked in
  the browser on `trader_demo` at 390, 768, 1024 and 1280: a shift added from a cell; an
  overlap blocked with its hours, overridden with a reason, the day previewed, saved, and
  its card reading "Clock in 15:30–17:00"; the decision read back with who and when, then
  turned round; a third shift whose two choices close a circle refused in words with the
  save disabled; Escape closing the drawer and focus returning to the button that opened
  it; a locked shift read-only with its link to Labor; next week copied (20 created, 2
  left out with their reasons), copied again (nothing to create), undone (20 removed);
  by jobsite with its people counted; one day at a time and one employee when narrow; no
  sideways scroll with a drawer open or closed; no control under 48 pt narrow or 44 wide;
  the day headings held at the top on scroll when wide; no console error. 1,422 tests.
- **Decided:** in this line's plan, the DESIGN amendment (Weekly Schedule, as built): the
  drawer is a native modal dialog; narrow is one day from seven day buttons, with an
  employee filter at every width. **Not ticked**, and why: its done-criterion asks for one
  pass with a screen reader and about 24 people, and neither was done — the demo has nine
  people and no screen reader was run. Also not done: the prototype's fourth revision was
  not at hand, so the screen follows DESIGN's rows and is not reconciled with it; no
  browser test in CI; no Spanish office strings; `mayClockIn` and `blockedBy` are not
  shown (they answer by crew, which enforcement retires); a shift moves only within the
  week on screen; the write refusals `stale` and `authorization` were not seen in the
  browser, only in tests.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `s5-copy-last-week` (#104) and
  this one, stacked, CI green on the first five; `release-0.1` moves here next.
  **Staging's database is still at 40 migrations** — the journal is 43 — and waits for
  the owner to install the wrapper's migrate command; the schedule screen will fail on
  that Preview until then.
- **Next:** A01, the navigation's groups and the Overview; then the payroll CSV and D01.

### 2026-11-15 — Overview and the office navigation (A01)

- **Did:** branch `a01-overview-navigation` from `s6-weekly-schedule-screen`.
  `overview.get`, admin-gated, with its gate line: approvals waiting, sessions with no
  clock-out, refused entries inside their 30 days, shifts in the company's week.
  `/overview`, which `/` now opens; the navigation regrouped to Overview, Jobsites,
  Schedule, Labor, Employees, routes unchanged. Checked in the browser on `trader_demo`
  at 1280 and 390: `/` opening the Overview with 13 to approve and 20 shifts, the demo's
  own figures, each line a link 72 pt or taller, the groups as named, no sideways scroll.
  Watched red, by mutation: pending only, the retention, both ends of the week, the
  Monday, the open-session figure. 1,424 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. One
  read, not four: the queue is paged and the refused-entry read asks for a person and a
  day, so neither can be counted from the browser. "Sessions with no clock-out" is the
  labor derivation's own figure, which leaves a session still waiting for approval among
  the approvals. Not done: Invoices and Developer are not in the navigation until their
  screens exist; invoices still owed is not counted until R6; not checked at 768 or 1024.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `s6-weekly-schedule-screen`
  (#105) and this one, stacked, CI green on the first six; **staging's database is still
  at 40 migrations** of 43 and waits for the owner to install the wrapper's migrate
  command. S6 is built and not ticked: a screen-reader pass and about 24 people are owed.
- **Next:** the payroll-hours CSV, then D01.

### 2026-11-15 — Payroll-hours CSV

- **Did:** branch `payroll-hours-csv` from `a01-overview-navigation`. `payPeriod.export`,
  admin-gated, with its gate line; `core/csv.ts`; the button in a closed period's details.
  The file is `payPeriod.read`'s figures for a closed period: a header, one row for each
  employee, job and work date of the period's own hours, then one for each adjustment with
  its original date and its sign; ids beside the names. Tests: the file inside the
  existing byte-identity test, so a later approval, correction, repair and rate leave it
  the same bytes; its totals equal the read's for two closed periods; an open period is
  `not_closed`; the text itself (quoting, a name that looks like a formula, signed hours).
  Seen in the browser on `trader_demo`: the closed week's file saved, 34 rows and 272.00
  hours, the screen's own figures; the open week offers no file. Watched red, by
  mutation: the open period's refusal, the adjustment rows, the formula guard, the
  quoting. 1,430 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE: the
  columns; hours as decimals with two places; a typed cell that begins like a formula is
  led by an apostrophe; no file for an open period; the button in the period's details
  until the export screen exists (DESIGN, Export panel). Not done: no pay, rate or
  overtime column, by rule; not opened in a spreadsheet or a payroll product; checked at
  1280 only.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `a01-overview-navigation`
  (#106) and this one, stacked, CI green on the first seven; **staging's database is
  still at 40 migrations** of 43, waiting for the owner to install the wrapper's migrate
  command. S6 built and not ticked (screen reader, about 24 people).
- **Next:** D01, the developer console; then R6, invoices.

### 2026-11-15 — Developer console (D01)

- **Did:** branch `d01-developer-console` from `payroll-hours-csv`. `developer.get`,
  admin-gated, with its gate line; `configuredStatus` beside `serviceStatus`;
  `/developer`, last in the navigation: commit, environment, the readiness check's
  status, field sync, minimum builds, protocol, schedule enforcement, the database role,
  refused entries in 30 days and in 24 hours, and the twenty newest lines. Seen in the
  browser on `trader_demo` at 1280 and 390: the eleven facts, readiness Ready, the role
  `trader_app`, no control on the page, no sideways scroll. 1,433 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. The
  commit and environment are read by the server page from the platform's own variables,
  which are not secrets; readiness is the public check's status and nothing of its body;
  no migration count, since the application role cannot read the migrator's journal. Not
  done: no write of any kind, by rule — the sync mode, the minimum builds and the
  enforcement switch are still changed where they live; nothing with a refused entry was
  seen in the browser (the demo has none); not checked at 768 or 1024.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `payroll-hours-csv` (#107) and
  this one, stacked, CI green on all eight; **staging's database is still at 40
  migrations** of 43, waiting for the owner to install the wrapper's migrate command.
  S6 built and not ticked (screen reader, about 24 people). Done of the plan: steps 0 to 6. Open: R6 and R7 (invoices, payments, PDF, email, invoice CSV), the edge line and the
  public staging host, R4, R5 with S7 and S8, enforcement on staging, the device builds.
- **Next:** R6, invoices: drafting and issue.

### 2026-11-15 — Invoices: draft, issue, void (R6)

- **Did:** branch `r6-invoices` from `d01-developer-console`. `0043`: the issue transition
  changes nothing but the issue and is never also a void. `invoices/`: `invoice.create`,
  `save`, `remove`, `suggest`, `issue`, `void`, `list`, `read`, admin-gated, with their
  gate lines. `/invoices` and `/invoices/<id>`, Invoices in the navigation. Seen on real
  commits: fifty drafts issued at once take 1042 to 1091, none twice and none skipped;
  one invoice issued five times at once takes one number. Seen in the browser on
  `trader_demo` at 1280: a draft started for a jobsite, a labor day drawn as a line with
  its hours and no price, the save refused until a price is typed, amounts and totals as
  typed, saved, issued as Invoice 1 after its question, no field left, voided, the list;
  no sideways scroll at 390 or 768. Watched red: the 0043 guard, by restoring 0010's
  function; eleven rules by mutation. 1,454 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. A
  draft's lines are replaced whole by each save; a line's amount is quantity times price,
  half-up to the cent, in integers, as the database's check computes it; a suggestion is
  words and a quantity and never a price; labor is offered one line a work date, every
  worker's approved hours together; an issue sent again answers its number; a void gives
  no number back; no audit row. Not done: payments, the PDF, email and the CSV (R7);
  credit memos (Stage 7); the currency is USD on the screen, though the API takes any;
  no browser test in CI; no Spanish office strings; the screens were not checked at 1024
  and their controls were not measured.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `d01-developer-console` (#108)
  and this one, stacked; **staging's database is still at 40 migrations** of 44, waiting
  for the owner to install the wrapper's migrate command. S6 built and not ticked. Done
  of the plan: steps 0 to 6 and R6. Open: R7, the edge line and the public staging host,
  R4, R5 with S7 and S8, enforcement on staging, the device builds.
- **Next:** R7, payments, the PDF, email and the invoice CSV (needs the owner's Resend
  domain and key, and one approved test recipient).

### 2026-11-15 — Payments, what is owed and the invoice CSV (R7, first half)

- **Did:** branch `r7-payments-csv` from `r6-invoices`. `0044`, `0045`: `invoice_payments`,
  append-only, with its guards. `invoice.recordPayment`, `reversePayment`, `exportCsv`
  with their gate lines; the reads answer `paidCents`, `owedCents` and the payments; a
  void is refused while a payment stands; `overview.get` counts invoices still owed.
  `core/pg-error.ts`. The invoice screens: payments, owed, the CSV button. Seen in the
  browser on `trader_demo` at 1280: an overpayment refused in words, a part payment, a
  void refused while it stands, paid in full with the form gone, a reversal leaving both
  rows and the amount owed again, the list's Owed column, the file saved, the Overview's
  count; no sideways scroll at 390. Watched red: every 0045 guard in the database; ten
  rules by mutation. 1,472 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. No
  overpayment: the payments that stand never total more than the invoice. A payment is
  never edited or removed; a second row reverses it and neither counts. An invoice with a
  standing payment is not voided. The CSV's columns. **Found and fixed, beyond this
  line:** a database refusal recognised by `instanceof` was a 500 through the web route
  (Notes) — the overpayment here, the missing number series of R6 (#109), and the
  first-sign-in bind conflict in `resolve-user.ts`, which is identity code and was changed
  only in how it reads the same error. Not done: the PDF and its email, which need the
  owner's Resend domain, key and one approved test recipient; credit memos; a payment's
  date is not checked against the issue date; not checked at 768 or 1024.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r6-invoices` (#109) and this
  one, stacked; **staging's database is still at 40 migrations** of 46, waiting for the
  owner to install the wrapper's migrate command. S6 built and not ticked; R7 half built.
  Open after this: the PDF and email, the edge line and the public staging host, R4, R5
  with S7 and S8, enforcement on staging, the device builds.
- **Next:** the edge line (rate limits, body limit, `Origin` check), which needs nothing
  from the owner; then R4.

### 2026-11-15 — Edge protection for a public host

- **Did:** branch `edge-protection` from `r7-payments-csv`. `0046`, `0047`:
  `rate_limit_windows`, a hash and a count, not tenant data. `core/rate-limit.ts`: a
  fixed window counted in one statement on the database's clock. `server/edge.ts` in
  front of the route: a body over one mebibyte 413, of unstated length 411; a
  state-changing request from another site's `Origin` 403; 600 requests a minute an
  address, 300 a signed-in identity, each 429 with `Retry-After`; a limiter that fails
  refuses nobody and is reported. Read on Vercel's pages that day: `x-forwarded-for` is
  the client's address and is overwritten by the platform; Deployment Protection
  Exceptions and WAF rate limiting are on every plan, the first a dashboard action with a
  typed confirmation. Seen on `next dev`: a foreign-origin POST 403, an oversized one 413,
  a shift added and removed from the browser. Watched red, by mutation: twelve rules.
  The first full check was red on 29 web tests whose hand-built POSTs stated no length
  (Notes); 1,486 tests after.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE: the
  limit lives in the application and Postgres, not in the platform's firewall, so it is in
  the repository and tested; the key is hashed; nothing is counted by address where the
  platform set none; the limiter fails open. Not done: the limits were not seen on a
  deployment (the public host is next, and needs the owner); no limit on the pages
  themselves, only on the API route; the per-region caveat does not apply since one
  database counts; session-cookie attributes are Clerk's and were not examined.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r7-payments-csv` (#110) and
  this one, stacked, CI green on the first eleven; **staging's database is still at 40
  migrations** of 48. Owner actions open, each blocking only its own step: install the
  wrapper's migrate command (every staging check); add the `release-0.1` alias under
  Deployment Protection Exceptions (the phones); Resend's domain, key and one test
  recipient (the PDF's email); `eas login` (device builds). S6 built and not ticked; R7
  half built.
- **Next:** R4, the field app skeleton.

### 2026-11-15 — Field app skeleton (R4)

- **Did:** branch `r4-field-app-skeleton` from `edge-protection`. `@trader/api/contract`
  (zod alone, pinned to the schema's enums and held pure by tests), the development
  headers' names moved into it, and a lint rule on `apps/mobile`. The Expo app
  `app.jpteq.trader`: SDK 58 with a development client, the theme, the brand icons, two
  typed catalogs, the development sign-in, Today with the caller's jobs from `sync.pull`,
  Settings with the name and the language. Built and run as a development build on
  iPhone 17 Pro (iOS 26.2) and on `Medium_Phone_API_36.1`: the smoke flow signs in as the
  demo foreman, reads the job list, opens Settings, switches to Spanish and returns, every
  step by `testID`, green on both; red at `job-list` with the API stopped. `pnpm check`,
  `pnpm build` and a frozen install green with the app in the workspace. 1,496 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. The
  TASKS line now names the packages as installed: `expo-splash-screen` and `vitest` added,
  gesture-handler, reanimated and a `zod` of the app's own not taken. Not done: no
  `eas.json` and no release or preview build, so the development sign-in being off outside
  a development bundle is `__DEV__`'s word, unseen; Clerk, the device store, the outbox
  and the clock (R5); the language choice does not outlast the app's run; layouts were
  not measured with the Spanish strings; CI does not run the flow, only the app's
  typecheck, lint and five tests. Watched red: the flow with the API stopped; the lint
  rule on a value import of `@trader/api` and on `@trader/db`. Stage 5's Expo, development sign-in and i18n lines are left unticked for those
  reasons; its contract line is ticked.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `edge-protection` (#111) and this
  one, stacked, CI green on all twelve before it; `release-0.1` moves here next.
  **Staging's database is still at 40 migrations** of 48: nothing since S2 has been seen
  on staging. Owner actions open, each blocking only its own step: install the wrapper's
  migrate command; the `release-0.1` alias under Deployment Protection Exceptions;
  Resend's domain, key and one test recipient; Clerk's native API on the development
  instance (R5); `eas login` (device builds). S6 built and not ticked; R7 half built.
- **Next:** R5, the field app's sign-in, store, outbox and clock, with S7 and S8.

### 2026-11-15 — The phone's clock, outbox and schedule (R5 without its sign-in, S7, S8's screen)

- **Did:** branch `r5-field-time-tracking` from `r4-field-app-skeleton`. `sync.pull` answers
  the caller's own shifts and eligible hours. In `apps/mobile`: the device store (Drizzle
  on expo-sqlite), the sync cycle, the clock's rules, a UUIDv7 minter, the location stamp;
  Today (clock in, break, switch, clock out; under the schedule the eligible shift alone
  or "ask the office"), Schedule (own shifts, how old the pull is, own hours), Settings;
  the session and the language kept across launches; English and Spanish. Thirty-eight
  unit tests of the cycle, the clock and the minter with a stand-in server that loses a
  response, stops part-way, refuses a record and changes state. The flow suite
  (`.maestro/suite.sh`), green on iPhone 17 Pro (iOS 26.2) and on `Medium_Phone_API_36.1`,
  each write read back from the server's tables: six events of a clock-in, switch, break
  and clock-out, once each and in order, with a location; two captured with the API
  stopped, the app closed and reopened between them, delivered once and not again on a
  second send; a refused location permission sending none; under enforcement a start
  locking its shift, a second person offered nothing and shown nobody's shifts, a start
  refused `not_scheduled` with its line for the office, and a start captured after 135
  seconds offline on a shift the office had removed, stored pending as `unscheduled` and
  said so on the phone. Watched red: four mutations of the pull, twenty-five of the
  cycle, the clock and the minter.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE: two
  minutes for the reachability reading and for a location in hand; 60 seconds between
  cycles; high accuracy; breaks kept in; the shift window of the pull. Found by the
  flows, not by a test: a tap that read the snapshot before the outbox could capture
  nothing mid-cycle (Notes); balanced accuracy gives no location on the emulator. Not
  done: **R5 is not ticked** — no SMS-code sign-in on the phone (`@clerk/expo` not
  installed; the owner's native-API switch and publishable key first), no own profile,
  no physical phone; **S8 is not ticked** for the same phones. Also not done: no
  biometric attestation; the device store's own SQL has no unit test, only the flows; no
  flow for `paused`, `read_only`, `update_required`, a wrong clock or a foreman's crew;
  hours worked offline are not added to "worked today" until they are pulled back; the
  iOS permission sentence is English only; layouts were not measured in Spanish; no
  screen-reader pass; pull's job coordinates, customer name and reasons (Stage 5, pull
  extension) are not built; `eas.json` and the preview builds.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r4-field-app-skeleton` (#112)
  and this one, stacked, CI green on all thirteen before it; `release-0.1` moves here
  next. **Staging's database is still at 40 migrations** of 48: nothing since S2 has
  been seen on staging. Owner actions open, each blocking only its own step: install the
  wrapper's migrate command (every staging check); Clerk's native API on the development
  instance and its publishable key as an EAS variable (the phone's sign-in); `eas login`
  (device builds); the `release-0.1` alias under Deployment Protection Exceptions (the
  phones); Resend's domain, key and one test recipient (the invoice email). S6 built and
  not ticked; R7 half built; R5 and S8 as above.
- **Next:** the phone's SMS-code sign-in behind the session seam, as far as it can be
  built before the owner's two Clerk items; then `eas.json` and the preview profile.

### 2026-11-15 — The phone's SMS-code sign-in: written, typechecked, never run against Clerk

- **Did:** branch `r5-phone-sign-in` from `r5-field-time-tracking`. `@clerk/expo` 4.16.1
  and `react-dom` in `apps/mobile`; the provider around the app when a build carries its
  key; a phone sign-in screen (number, code, then `me.get`); the provider's token as a
  bearer header on every call; sign-out of both; the number parser with tests; both
  catalogs. Seen: typecheck against Clerk's own types; 40 unit tests; with the package in
  the bundle and no key set, the whole flow suite green on the iOS simulator through the
  development identity, and on the Android emulator a sign-in and a first sync.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. Not
  done, and the reason R5 stays unticked: **nobody has signed in through Clerk on a
  phone.** Unseen: Clerk's hooks behaving as its page says; a code arriving; the server's
  adapter accepting a phone's bearer token (its `CLERK_AUTHORIZED_PARTIES` check and the
  four session claims on a native session); the session surviving a restart with no
  network; a sign-out offline. No flow can cover it until a development build carries the
  key. The Android suite was not rerun whole on this branch.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r5-field-time-tracking` (#113)
  and this one, stacked; `release-0.1` moves here next. **Staging's database is still at
  40 migrations** of 48. Owner actions open, each blocking only its own step: install the
  wrapper's migrate command (every staging check); Clerk's native API on the development
  instance and its publishable key given to the build (the phone's sign-in); `eas login`
  (device builds); the `release-0.1` alias under Deployment Protection Exceptions (the
  phones); Resend's domain, key and one test recipient (the invoice email). S6 built and
  not ticked; R7 half built; R5 and S8 open on the sign-in and the physical phones.
- **Next:** with the owner's Clerk items, the sign-in end to end on both devices; with
  `eas login`, `eas.json` and the preview builds; with the wrapper, staging migrated and
  the browser suite. Without any of them: the invoice PDF behind a mailer seam.

### 2026-11-15 — Invoice PDF on demand (R7, the PDF)

- **Did:** branch `r7-invoice-pdf-email` from `r5-phone-sign-in`. `pdf-lib` 1.17.1 in
  `packages/api`; `invoices/pdf.ts` (a pure renderer and `invoice.pdf`, admin-gated, with
  its gate line); "Save as PDF" on an issued or void invoice's page. Seen in the browser
  on `trader_demo` at 1280 and 390: an invoice issued, the button pressed, `invoice-1.pdf`
  saved, the note shown, no sideways scroll, the button 48 pt; the file opened as an image
  and read. Found by looking, not by a test: a long description ran into the quantity,
  and quantities showed `8.000`; both fixed and pinned. Watched red: eleven mutations of
  the renderer, two of them only after their tests were made stronger (Notes). `pnpm demo
--reset` after the check.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE: made
  on demand and never stored; the invoice's own stored figures; dated with the issue;
  the customer's details as they stand now; `?` for what the font cannot draw. Not done:
  **the email and `invoice_sends`**, so R7 stays unticked — the Resend adapter needs the
  owner's domain, key and one approved recipient to be seen sending, and the table is a
  migration of its own; no logo on the page; English only; not opened in Acrobat or a
  printer's preview; not checked at 768 or 1024; payments are not listed on the page,
  only their total.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r5-phone-sign-in` (#114) and
  this one, stacked; `release-0.1` moves here next. **Staging's database is still at 40
  migrations** of 48. Owner actions open, each blocking only its own step: install the
  wrapper's migrate command (every staging check); Clerk's native API on the development
  instance and its publishable key given to the build (the phone's sign-in); `eas login`
  (device builds); the `release-0.1` alias under Deployment Protection Exceptions (the
  phones); Resend's domain, key and one test recipient (the invoice email). S6 built and
  not ticked; R7 open on the email; R5 and S8 open on the sign-in and the physical phones.
- **Next:** the invoice email behind a mailer seam with its recorded sends and the
  staging allow-list; then whichever owner item arrives first.

### 2026-11-15 — Invoice email and recorded sends (R7): built, no message seen arriving

- **Did:** branch `r7-invoice-email` from `r7-invoice-pdf-email`. `0048`, `0049`:
  `invoice_sends` with its guards. `core/mailer.ts`, the mailer in the context;
  `invoice.send` with its gate line; `invoice.read` answers the sends and the customer's
  address; the Resend adapter, its three variables and the deployment check in `apps/web`;
  the email section on the invoice page. Seen in the browser on `trader_demo` at 1280 and
  390 with no mail service set: no section on a draft, the customer's address offered, a
  non-address stopped by the browser, a send failing closed in words and listed as not
  sent, a second attempt listed too, no form on a void invoice with its history kept, no
  sideways scroll, the button 48 pt wide and 56 narrow. Watched red: all thirteen guards of
  the table, each removed in the local database and restored; fifteen mutations of
  `invoice.send` and the seam; eleven of the adapter and its environment rules.
  `pnpm demo --reset` after the check.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE: a
  fourth seam; no mail package; the allow-list as the whole of who may be sent to outside
  production; the row lock held across the send; failures as codes. Not done, and why R7
  stays unticked: **no message has left this system.** Resend's request is written from
  its page and tested against a stand-in; unseen are the key accepted, the sender's
  domain verified, the PDF opening from a real inbox, and the idempotency key honoured.
  Also not done: the email's words are English and plain; no reply-to; no bounce or
  delivery state after acceptance; a `duplicate` of a failed send says only that it
  failed; staging has neither the migration nor the variables.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r7-invoice-pdf-email` (#115)
  and this one, stacked; `release-0.1` moves here next. **Staging's database is still at
  40 migrations** of 50. Owner actions open, each blocking only its own step: install the
  wrapper's migrate command (every staging check); Clerk's native API on the development
  instance and its publishable key given to the build (the phone's sign-in); `eas login`
  (device builds); the `release-0.1` alias under Deployment Protection Exceptions (the
  phones); Resend's domain, key, sender and one approved recipient as staging variables
  (one send seen). S6 built and not ticked; R7 open on that one send; R5 and S8 open on
  the sign-in and the physical phones.
- **Next:** every remaining line of the track now starts with an owner action above.
  Without one: S6's screen-reader pass cannot be done by a session; the 24-person check of
  the schedule can, on a larger demo.
