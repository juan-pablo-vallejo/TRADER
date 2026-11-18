# TRADER — Log

What happened and what was decided when: every session's entry, every decision as it was
made, every task as it was ticked. [RULES.md](RULES.md), Authority, says what this file is
for. A fact in force is read in its home, not here.

- Nothing here is edited or removed. `check` fails when a line of `main`'s log is missing,
  changed or out of order, or a day's heading repeats.
- One `## YYYY-MM-DD` heading per day, newest last: the local date of the machine the session
  runs on (`date +%F`). If that day's heading is already there, what is added goes under it.
- Under a day, a decision is one bullet: `- **date** — the decision — Supersedes: what it
  replaces`, the last part left out when it replaces nothing. A session is
  `### YYYY-MM-DD — one-line summary`, then three bullets — **Did**, **Decided** (or
  "nothing"), **Next** (a task in TASKS.md) — and after them the lines of each task it ticked,
  as TASKS.md stated them.
- Until 2026-11-17 the decisions were a table in ARCHITECTURE.md, the sessions were MEMORY.md's
  Log and a ticked task stayed in TASKS.md. What was written before then says "ARCHITECTURE"
  for a decision's row and "MEMORY" for a session's entry: both are read here. A cite of
  ARCHITECTURE by a date and a subject, wherever it still stands, names a bullet under that
  day.

As ARCHITECTURE.md's Decisions section stated them until the move:

One line each; the date is when it was settled. A change is a new row naming the row it supersedes, never an edit to an old row.
Rows dated 2026-11-05 or earlier cite another as `row N`, meaning line N − 3 of this file at `779894f`; later rows cite one by date and subject.
Rows beginning `V1-Dnn` are the owner's V1 decision register; where one supersedes a row of the same date, the `V1-Dnn` row governs.

## Before 2026-10-13

- **2026-07** — Modular monolith; the API runs inside the Next.js deployment on Vercel — Supersedes: Separate backend host
- **2026-07** — Build the sync layer; Drizzle on `expo-sqlite` for storage only — Supersedes: WatermelonDB
- **2026-07** — Append-only labor log, client UUIDv7 ids, integer cents, derived values never stored — Supersedes: —
- **2026-07** — Biometric attestation on clock actions, never blocking — Supersedes: —
- **2026-10** — Snapshot pull, no cursor in V1 — Supersedes: Keyset cursor (2026-07)
- **2026-10** — RLS from the first migration; app role created in SQL with `NOBYPASSRLS` — Supersedes: RLS deferred to the second tenant
- **2026-10** — Payments out of V1; invoices `draft → issued → void`, credit memos, QuickBooks CSV — Supersedes: Stripe in V1 (2026-07)
- **2026-10** — Passkeys with email-code fallback; no SMS, no passwords — Supersedes: Phone-number recovery (2026-07)
- **2026-10** — Office-approval rule for offline, edited, user-timed and location-flagged entries — Supersedes: —
- **2026-10** — Foreground location stamps at clock events only; geofenced clock-in dropped — Supersedes: Advisory geofence spike (2026-07)
- **2026-10** — Effective-dated pay rates; immutable closed pay periods; no pay calculation in V1 — Supersedes: Open
- **2026-10** — `jpteq.app` everywhere; bundle ID `app.jpteq.trader` — Supersedes: `jpteq.com`
- **2026-10** — Production: Vercel Pro, Neon Launch, Clerk Pro; nightly `pg_dump` to R2, weekly verify — Supersedes: Open hosting decision
- **2026-10** — Web approval by push, Expo push, Inngest and Resend deferred past V1 — Supersedes: Phase 3–4 plans (2026-07)

## 2026-10-13

- **2026-10-13** — Rebuild from `archive/pre-rebuild`; six-doc set replaces the previous documentation — Supersedes: 2026-07 doc set and ADR register
- **2026-10-13** — Brand: D Sierra Painting mark; indigo accent `#2808AC`; red reserved for the mark — Supersedes: Blue accent; no brand asset in V1

## 2026-10-27

- **2026-10-27** — Compose vars or `DATABASE_URL` for `pg`; `drizzle-kit migrate`; `.env` via `loadEnvFile` — Supersedes: Archive env and migrate (2026-07)

## 2026-10-28

- **2026-10-28** — Ids: `uuidv7()` DB default on office rows; device UUIDv7, no default, on phone rows — Supersedes: ORM `$defaultFn` ids (2026-07)
- **2026-10-28** — Enumerations are Postgres enum types in `enums.ts`; a value is only ever added — Supersedes: —
- **2026-10-28** — `deactivated_at` timestamps on roster tables; no `active` flag, state is derived — Supersedes: `active` boolean (2026-07)
- **2026-10-28** — `work_session_events` facts are typed columns: stamp, attestation, `clock_skewed` + `clock_skew_ms`; no `payload`, no `created_at` — Supersedes: `payload` jsonb (2026-07)
- **2026-10-28** — Skew verdict stored at write time under the tolerance then in force; the ledger's order never moves — Supersedes: —
- **2026-10-28** — Triggers and functions live in `generate --custom` migrations; a rejected mutation is SQLSTATE `23000` — Supersedes: Hand-journaled `0001` (2026-07)

## 2026-10-29

- **2026-10-29** — `approvals`: one row per event, written at push when the rule fires; no row is approved by default; `reasons` enum array; a decision is set once — Supersedes: —
- **2026-10-29** — Pay periods: inclusive work-date ranges, overlap-free by exclusion; closed in order and frozen; an event's period is derived from `work_date` and `server_timestamp` against `closed_at` — Supersedes: —
- **2026-10-29** — `currency` beside every `_cents` column, no default; `_cents` is `integer` until a sum can exceed it — Supersedes: `char(3) default 'USD'`, bigint (2026-07)
- **2026-10-29** — Extensions (`btree_gist`) and exclusion constraints live in `generate --custom` migrations; a rule naming an enum member lives in plpgsql — Supersedes: —

## 2026-11-03

- **2026-11-03** — PRD approval triggers are five: offline capture, edit/correction, user-set time, missing/out-of-radius location, clock skew beyond tolerance; every `approval_reason` member maps to exactly one trigger — Supersedes: Four-trigger list (2026-10)
- **2026-11-03** — Invoice state derived from `issued_at`/`voided_at`, no status enum; born draft; `number` assigned at issue by trigger from a transactional per-company counter; issued rows frozen except one void — Supersedes: —
- **2026-11-03** — Credit memos append-only, against an issued unvoided invoice, numbered from their own per-company series in the same counter row — Supersedes: —
- **2026-11-03** — Materials carry the receipt total in cents, nullable with currency, priced later; photos attach to a job and optionally a material, same job by composite key; the row holds object metadata only — Supersedes: `photo_s3_key` on materials (2026-07)
- **2026-11-03** — Cross-row equality (currency, customer-of-job, job-of-material) is enforced by composite foreign keys over an added unique, which makes the referenced column immutable while a child exists (invoice currency once lines exist, a job's customer once an invoice exists); triggers are used only for lifecycle, sequencing and existence rules — Supersedes: —
- **2026-11-03** — Object store: Cloudflare R2 bucket `trader-media` in the same account as the backups; presigned uploads through the API; holds material/job-progress photos and each company's logo. `photos.object_key` is the bucket key, provider-neutral text assigned by the server at push from company_id and id. No store client in Stage 2 — Supersedes: —
- **2026-11-03** — `audit_log` is append-only by 0002's guard, written by API code in the same transaction as the write it records, never by a capture trigger; `action` is `entity_table.verb` text under a prefix check, not an enum; written by after-V1 wiring, empty in V1 — Supersedes: —
- **2026-11-03** — `before`/`after` jsonb snapshots of the audited row; the typed-column rule of row 147 governs domain facts, and the audit log holds none of its own — Supersedes: —
- **2026-11-03** — Tenancy: `public.app_company_id()` maps unset and `''` to NULL and is the only reader of `app.company_id`; every tenant table has a `<table>_tenant` policy, `FOR ALL TO trader_app`, USING equal to WITH CHECK; `companies` matches on `id`; an unset tenant reads zero rows — Supersedes: —
- **2026-11-03** — Runtime role `trader_app`, `LOGIN NOINHERIT NOBYPASSRLS`, created if absent in a custom migration, no password in the repository; privileges are per-table grants stated by the migration adding the table, no default privileges, no TRUNCATE; append-only tables get SELECT and INSERT — Supersedes: —
- **2026-11-03** — Startup guard `assertRuntimeRole` refuses a superuser or BYPASSRLS role, or a tenant table without ENABLE and FORCE, in one query before the first tenant query — Supersedes: —
- **2026-11-03** — Migrator and tests run as the owner; RLS tests take the app role by `SET LOCAL ROLE` in a rolled-back transaction; the tenant is set by `set_config(…, true)` per transaction — Supersedes: —
- **2026-11-03** — Seed: owner-only (refuses a role without `rolsuper` or `rolbypassrls`) on the migrate env contract, one transaction, raw SQL; one company by fixed id, its counter inserted once at 1/1, the admin upserted on `(company_id, lower(email))` with `identity_subject` NULL; a development and CI fixture with placeholder values, run by `pnpm db:seed` locally and proven by tests, not a CI step; the pilot's own company and counter are not seeded by it — Supersedes: Archive seed (2026-07)

## 2026-11-04

- **2026-11-04** — Location beyond clock-event stamps only as OS geofences on assigned jobs' existing coordinates and radius, inside the employee's authorized work window, for local reminders; entries and exits stay on the device; clock-event stamps stay foreground (PRD, Smart Clock-In) — Supersedes: Foreground-only location (2026-10)
- **2026-11-04** — Smart Clock-In after the manual pilot: arrival raises a local notification, the employee confirms a normal clock event; departure only reminds; no automatic event, no new approval reason, no push; no location subsystem — Supersedes: Geofenced clock-in dropped (2026-10)
- **2026-11-04** — Identity binding: `users_identity_select` and `users_identity_bind` policies for `trader_app`, keyed on server-set `app.identity_subject`/`app.identity_email` read through `app_identity_subject()`/`app_identity_email()`; first sign-in binds the invited row, nothing is inserted; anything but exactly one invitation fails closed; no SECURITY DEFINER. `users_identity_guard`, every role, 23000: `identity_subject` changes only NULL → the verified subject with the tenant unset and every other column but `updated_at` unchanged (whole-row compare); under an identity setting the bind is the only update; unbinding is a future decision — Supersedes: JIT provisioning into the oldest company (2026-07)
- **2026-11-04** — One transaction per protected procedure call, not per HTTP request: settings cleared, `assertRuntimeRole` on every transaction (no cache), identity set, user resolved or bound, identity cleared, tenant set, procedure run; a `{ ok: false }` result is rethrown so nothing commits, a first-sign-in bind included; the procedure's context has `tx` and `user`, the pool removed by value — Supersedes: —
- **2026-11-04** — Identity adapter: `identify(headers)` returns `{ subject, email, emailVerified: true }` or null, zod-parsed again at context creation; the development adapter reads two headers, off unless `TRADER_DEV_IDENTITY=enabled`, and refuses the request under any `NODE_ENV` but `development` or `test` — Supersedes: Archive `DEV_AUTH_ENABLED` (2026-07)
- **2026-11-04** — Every resolution failure — no identity, no or ambiguous invitation, deactivated, lost bind race, the bind's `users_identity_subject_unique` conflict — is one `UNAUTHORIZED` with one message; any other error is `INTERNAL_SERVER_ERROR` with a generic message and no stack — Supersedes: —
- **2026-11-04** — A deactivated account resolves to no user; a deactivated invitation is never bound (`deactivated_at IS NULL` in the bind and on its returned row); deactivated invitations still count toward "exactly one" — Supersedes: —
- **2026-11-04** — Fail-closed codes (RULES): a switched-off route answers 404; an API call answers `UNAUTHORIZED` (401) without an active user and `FORBIDDEN` (403) when its role is not admitted — Supersedes: "deny and 404" read as covering every guard
- **2026-11-04** — Role gates: `roleProcedure(...roles)` chained on the protected procedure, a per-procedure allowlist over the role resolved in its transaction; no hierarchy, so a role added to the enum is admitted nowhere until named; nothing a client sends is read — Supersedes: —
- **2026-11-04** — Gate order and answers: resolution first, so an anonymous or deactivated caller is `UNAUTHORIZED` at every gate and never learns the role wanted; an active caller without the role is `FORBIDDEN` with one message naming no role; a denial rolls back like any failed call — Supersedes: —
- **2026-11-04** — Role gates are procedure-entry checks only. Worker job assignment, foreman crew and job scope, and every other resource-level permission are enforced independently inside each business procedure that needs them, in that procedure's own task; RLS stays company-wide and a gate never narrows or widens it — Supersedes: —
- **2026-11-04** — Labor fold: one effective instant per event — `server_timestamp` when `clock_skewed`, else `client_timestamp` — for ordering, intervals and `work_date`; durations are elapsed UTC milliseconds — Supersedes: —
- **2026-11-04** — A session's `work_date` is its effective start's date in `companies.timezone`; a session crossing midnight belongs wholly to it, and so do its pay period and payroll line — Supersedes: —
- **2026-11-04** — Voids are accounting-only: zero hours, span kept, an open voided session still needs `ended`; one void per session, naming a root `started`; no un-void — Supersedes: Positional `voided` (archive LOGIC SESSION-2)
- **2026-11-04** — A correction names a root event, keeps its worker and type, keeps its job unless it corrects a `started`, and stays in its session; the latest accepted (`server_timestamp`, then `id`) wins, and a candidate that would not win is rejected — Supersedes: —
- **2026-11-04** — A session's job is its effective `started`'s; a new ordinary pause, resume or end must match it; every other event's `job_id` is provenance, never re-judged — Supersedes: —
- **2026-11-04** — Validation replays the worker's whole timeline with the candidate in place; one writer per worker: READ COMMITTED, `pg_advisory_xact_lock`, read, validate, insert; a stored ledger that fails replay is an internal error, never a rejection — Supersedes: Next-event-only check (archive)
- **2026-11-04** — Pushed `server_timestamp` is written explicitly: `receivedAt`, read after the worker lock, at least that worker's newest stamp + 1 ms, one value per worker per batch — Supersedes: `now()` on pushed events (column comment, 2026-10-28)
- **2026-11-04** — Two sources for one worker out of order: an event whose predecessor has not arrived is rejected; the office repairs once the predecessor lands — Supersedes: Archive "a `resumed` before its `paused` is legal"
- **2026-11-04** — A repair needing two events at once (a session before a later one, a pause before a later pause) is an office-only atomic repair set, its own TASKS line; never a sync record — Supersedes: —
- **2026-11-04** — Day closeout: `day_closeouts`, append-only like the ledger; device UUIDv7 id; one per `(company_id, job_id, work_date)`, the date the foreman's business key, not derived; it stores the zone it was judged in and whether it wrote `jobs.status` (not if archived or a later-dated closeout exists); no hours stored — Supersedes: —
- **2026-11-04** — Closeout membership is sealed: the closeout declares its worker and material counts, and deferred constraint triggers check at commit that the append-only membership numbers exactly that and the closeout is visible; callers fire them early with `SET CONSTRAINTS … IMMEDIATE` — Supersedes: —
- **2026-11-04** — Each worker with a session on the day gets a mark, `ledger_through`, their ledger's newest receipt stamp; their events stamped at or before it, folded in the stored zone, are the day as submitted; a change to fold semantics must say how existing closeouts are read — Supersedes: —
- **2026-11-04** — A closed-out material is frozen by trigger (whole row, DELETE included) except `cost_cents`/`currency`; its later change is a correcting entry, a scheduled task — Supersedes: —
- **2026-11-04** — Company field-write lock: every labor and material writer takes it shared (labor before the worker lock), the closeout takes it exclusive, keyed on the tenant and refusing without one. Lock order: jobs, crews, users, companies rows, then the field-write lock, then worker locks, then materials rows; a holder of the field-write lock takes no row lock on the first four beyond foreign-key `KEY SHARE` — Supersedes: Row 184's per-worker-only locking
- **2026-11-04** — `closeout.submit` answers `accepted`/`duplicate` with an acknowledgement of id, server stamp and status result only, or `rejected` with `id_conflict`, `already_submitted`, `sessions_open`, `work_date_in_future`; the caller's own id is answered first, before role or scope — Supersedes: —
- **2026-11-04** — Closeout scope: the job's current crew's foreman, crew active; the role is checked in the procedure after the own-id answer, and job, crew, caller and company are re-read under row locks held to commit; one `FORBIDDEN` for every refusal — Supersedes: Row 176's gate placement, for this procedure
- **2026-11-04** — A closeout records server state at submission, not a verified review; the review read and its fingerprint are a Stage 3 task that must land before the field closeout ships — Supersedes: —
- **2026-11-04** — `closeout.review`: the foreman gate, then row 195's scope with the job, crew, caller and company rows `FOR SHARE` and no field-write lock, so it may combine committed states from different moments; workers with a session on the day only; materials without cost; no approval state; an existing closeout is flagged, the content stays live — Supersedes: —
- **2026-11-04** — Review fingerprint `v1.`: SHA-256 of positional tuples — tenant, job, date, zone, job status, each session's sources, times, state, void and hours, each material's facts but cost — recomputed, never stored. Required at submit and compared under the closeout's locks after `sessions_open`, never on a retry (`same()` ignores it); a mismatch is `rejected` `review_stale`, and a new confirmation is a new id. A concurrency precondition, not proof of review — Supersedes: Row 194's codes; row 196
- **2026-11-04** — Material corrections: `material_corrections`, append-only, device UUIDv7, naming a sealed member by composite foreign key to `day_closeout_materials`, so only a closed-out material is corrected and the day as submitted is the receipt as logged, never written; `amend` replaces description, quantity and unit together, `void` is final; never job, `logged_at`, buyer or cost; always the receipt, never another correction. A correction counts once approved: the receipt with its approved corrections in (`server_timestamp`, `id`) order, derived, never stored. `approvals` takes exactly one subject, `event_id` or `material_correction_id`; a correction's row is written pending with `corrected`, NULL-safe and with no NULL reason, never decided by its submitter (trigger); every row's subject and reasons are fixed — Supersedes: Row 150's one row per event
- **2026-11-04** — `material.correct`: admin, or the job's current crew's foreman; own id first; scope row locks, the field-write lock shared, the material `FOR NO KEY UPDATE`; `accepted`/`duplicate`, or `rejected` `id_conflict`, `not_in_closeout` (permanent for that sealed closeout, its date in the closeout's stored zone; never retried automatically, the correction kept recoverable on the device), `closeout_pending`, `correction_pending` (one pending per material), `material_voided`, `no_change`; a rejection writes nothing, so the same id may be sent again; unavailable or out of scope is one `FORBIDDEN`. Push: each in its own transaction, held until its closeout's result, at most one automatic re-attempt, else needs attention; a decision takes the same locks — Supersedes: —

## 2026-11-05

- **2026-11-05** — Approval triggers are six: row 154's five plus arrival after the day's accepted closeout, `after_closeout`, judged on the session's effective start (labor) or `logged_at` (a receipt) in each closeout's stored zone, under the shared field-write lock; the closeout, its marks and fingerprint never change; how a pending event's session counts is the approval queue's — Supersedes: Row 154
- **2026-11-05** — `offline` is capture evidence: `captured_offline`, recorded by the device at capture (no confirmed API reachability; unknown counts as offline), on events and receipts; delivery delay is evidence, never a reason; receipts also store `clock_skewed` and `clock_skew_ms`; deferred triggers require an approval row holding every reason those columns imply — Supersedes: `enums.ts` "receipt lag" reading
- **2026-11-05** — Original receipts are approval subjects: `approvals.material_id`, the third of exactly one subject, written at push, born pending, never decided by the logger; reasons `offline`, `clock_skewed`, `after_closeout`. An after-closeout receipt is corrected like a member: corrections reference `materials`, a trigger requires membership or that approval, and its facts freeze as 0018 freezes a member's — Supersedes: Row 199's two subjects and member-only key
- **2026-11-05** — `sync.push`: one caller transaction per record, each running row 171's sequence (role and deactivation re-read; authority from rows locked in it), in batch order; ≤ 100 records, none started after 8 s, `lock_timeout` 2 s, `statement_timeout` 4 s; a thrown record stops the batch, it and the rest omitted; FORBIDDEN answers `rejected` `not_permitted`; UNAUTHORIZED after a completed record returns the results so far; kinds `labor_event`, `material`, and `closeout` and `material_correction` delegated unchanged; each record its own receipt stamp. `sync.push` amended: each record transaction's lock and statement timeouts are set by its first statement, before identity resolution, so a first sign-in's bind is bounded too; a push in which no record ran still resolves its caller, in a transaction with no record, so nothing is answered to an anonymous, uninvited or deactivated caller; a receipt's `created_at` is read after its locks — Supersedes: Row 171 for this procedure; row 185's one value per batch; Row 204's timeouts inside the record; its unresolved answer when nothing ran
- **2026-11-05** — Push authority: own labor for any role; a foreman's also for current members of an active crew they lead, on its jobs; a `started` or a receipt needs a non-archived job of a crew the caller is in or leads (an admin: any); pause, resume and end only their session's job; no device corrections or voids. Order: jobs, crews, `crew_members` read unlocked (no UPDATE grant), users in id order, companies, field-write lock, worker lock. An id held by an invisible row is `id_conflict` — Supersedes: Row 193's order, extended
- **2026-11-05** — `sync.pull`: own sessions with a `work_date` in the last 14 days and any open one, their events with approval state, own receipts as logged and as in effect; the jobs push admits; led crews' active members by id and name; no coordinates, cost, contact or rate. Requests carry `protocolVersion` 1; each record its `schemaVersion`, upcast to v1, an unknown one omitted — Supersedes: —
- **2026-11-05** — Crew membership writers (Stage 4) lock the crew row `FOR NO KEY UPDATE` before adding or removing a member, so a removal waits for any push holding that row `FOR SHARE` and never commits under a push that relied on it; push keeps reading `crew_members` without a lock; the race is that writer's task's test — Supersedes: Row 205's unlocked read alone
- **2026-11-05** — Approval accounting: every accepted event stays in the fold, so validation, winners, open sessions, `work_date` and closeouts never read a decision. A session counts by its in-effect sources (`replay` winners) and its void, no approvals row meaning approved: an approved void is `voided`, 0; else a rejected source `rejected`, 0 until a later correction wins; else a pending source or void `pending`, withheld; else `eligible`, its nonvoided worked ms (a rejected void is disregarded, the hours taken from the replay without it). A superseded correction's decision is moot; eligible is not export-ready (an open session stays open). A receipt counts once approved or row-less, an approved void taking it out; its corrections change its facts, never its eligibility — Supersedes: Row 201's open clause
- **2026-11-05** — `approval.queue` and `approval.decide`, admin-gated. Queue: pending only, `(created_at, id)` order, the cursor the last approval's id; every subject with its stored reasons, `ownEntry`, a labor item's `effect` and live session; no coordinates, cost or rates. Decide: the approval read unlocked (its subject is fixed), the caller `FOR SHARE`, a correction's field-write lock shared and material row as `material.correct`, then the approval row `FOR NO KEY UPDATE`, last in the lock order; `decided`, `duplicate` (same decision, same admin), `rejected` `already_decided` with the standing decision, or `own_entry`; a missing or foreign id is the gate's FORBIDDEN; `decided_at` is the server clock after the locks; never reversed. Nobody decides their own entry — a labor event's worker (never merely its initiator), a receipt's logger, a correction's submitter — refused in the API and in SQL (0020, 0022, 0025, which also writes event approvals pending) — Supersedes: Row 193's order, extended; `approvals.ts`'s API-only event rule
- **2026-11-05** — Office labor repairs: `labor.repair`, admin-gated then `lockActiveSelf`; one worker's set of 1–20 `append`, `correct` and `void` operations with device UUIDv7 ids, validated as one timeline (`validateEvents`; the single-event check is its one-element case) and written all or nothing in one savepoint. Office events are user-timed, not offline, unskewed, attestation `none`, unstamped, initiated by the caller; a void sits at its receipt on its root's job. Any visible job or worker, archived or deactivated included; a missing one is one FORBIDDEN. Reasons by the push rule plus `corrected` for corrections and voids, `after_closeout` judged on the repaired session (row 201); each approval pending in the same transaction, 0026 requiring `corrected` at commit. A correction identical to its source is accepted; a correction names the source it replaces, `repair_stale` if another won, never compared on a retry. `accepted`/`duplicate` with acknowledgements in input order, or `rejected`: a fold or validation code, `id_conflict` (an invisible holder included), `time_in_future`. Lock order: caller row, field-write lock shared, worker lock; no approval lock; validity never reads a decision — Supersedes: —
- **2026-11-05** — Kill switch: `status.get` on the public procedure, no identity, no database query, no tenant; input protocol version, platform (`ios`, `android`) and native build (a positive integer increasing per platform); answers `{ version: 1, state }`, the most restrictive of `TRADER_SYNC_MODE` (`normal`; `read_only`, pull only; `paused`, no sync), `update_required` below the platform's minimum build or the lowest protocol, and `paused` above the highest; invalid configuration is `paused`, reported once per instance. Advisory to cooperative clients: push and pull do not read it, so it cannot stop a client that ignores it. A client syncs only on a fresh well-formed answer in that cycle; capture never stops, held records stay pending, no state rejects, clears or fails a record. Configuration is deployment environment, changed by a new deployment — Supersedes: "States named when it is built" (Sync protocol)
- **2026-11-05** — Error reporting: `ErrorReporter.report(event)` with a minimized event (source, path, type, error names, SQLSTATE), never a stack, message, input, context, identity, tenant or location; reported are what answers `INTERNAL_SERVER_ERROR`, a push record's failure after an earlier record committed, and invalid kill-switch configuration; never an expected 401, 403, 400 or record rejection. Built, minimized and sent inside one guard, never awaited, its failure swallowed; after the call settles, or for push after that record's transaction rolled back while the request continues. Required in the request context; a stderr log reporter until Sentry (Stage 6) implements the interface — Supersedes: —

## 2026-11-06

- **2026-11-06** — Dated worker-job assignments (to be built, Stage 4): a worker, a job and a date with an expected start and end; planning only — never read by push authority, validation, the fold, `work_date`, approvals, closeouts, pay or invoices; authority stays crew membership judged at receipt (2026-11-05 push authority), and a worker may work several crews' jobs in a day. 'Worker job assignment' in the 2026-11-04 role-gate row, and 'assigned jobs' in the 2026-11-04 geofence and Smart Clock-In rows, mean jobs of the worker's crews, not dated assignments; PRD now says 'crew job'. Writers, membership at assignment time, zone and DST rules, and any relation to the arrival-reminder work window are decided in the consuming task — Supersedes: PRD Goals non-goal 'scheduling' (2026-10-13 six-doc set), for dated worker-job assignments only
- **2026-11-06** — Admin day closeout (to be built, Stage 4): `closeout.review` and `closeout.submit` will also admit an admin, with the input, answers, own-id-first retry, `v1.` fingerprint, field-write lock and lock order unchanged and the foreman path behaving exactly as today; an admin's scope re-reads the job, the caller and the company under the same row locks, and `jobs.status` is written as today; archived and crew-less jobs are that task's decision — Supersedes: 2026-11-04 closeout scope and `closeout.review` foreman gate, for an admin only
- **2026-11-06** — Own profile (to be built, Stage 4): an active user changes their own `name` and `phone` through one procedure that writes only those two columns of the caller's resolved row; `phone` is contact data, never identity, recovery or authorization; `email`, `role`, `company_id`, `identity_subject` and `deactivated_at` are never self-written; an email changes through the identity provider's verified flow, and how `users.email` follows it is decided with worker sign-in — Supersedes: PRD After V1 'roster self-service', for own name and phone
- **2026-11-06** — Smart Clock-In in the pilot is an optional job suggestion (to be built, Stage 5): on app open, one foreground location reading, used only on the phone and never sent, is compared with the locations of the jobs the last pull named as ones the worker may start on, today's assignment first; a match only pre-selects a job, and the worker's confirmation records a normal clock event with its own foreground stamp under the approval rule. No suggestion — manual selection — without permission, without a reading, with an uncertain reading, without coordinates, with several matches or with a stale snapshot. A suggestion never authorizes: push re-judges membership at receipt (2026-11-05 push authority). Job locations will reach the phone by an extension of `sync.pull` planned in that Stage 5 task; today's `pullOutput` is a strict protocol-1 schema, so that plan decides between optional protocol-1 fields and a new protocol version and proves it with compatibility tests against the shipped client; Stage 3's criterion is unchanged — Supersedes: 2026-11-04 'Smart Clock-In after the manual pilot', for the pilot suggestion only (arrival reminders unchanged); 2026-11-05 `sync.pull` 'no coordinates', for jobs the caller may start on, from that task
- **2026-11-06** — Pilot scope (PRD, Pilot and V1 completion): sign-in; clock in/out and job switch with the job suggestion, no automatic clock-in; materials and photos; offline sync; dated assignments; approvals; foreman and admin closeout; pay periods and the payroll export; invoices created, issued and exported in TRADER with no discount feature; the office web responsive on phone and desktop. Arrival reminders follow the pilot; every other V1 feature, the full data export included, stays required for V1 complete; the pilot stays unpaid and V1 complete the billing trigger. Invoicing moves before the pilot (TASKS Stages 7 and 8 swapped) — Supersedes: Pilot build (PRD, 2026-10); 1280 pt desktop-only office web (DESIGN)
- **2026-11-06** — Web host: `apps/web` serves the API at `/api/trpc` from one route handler on the Node runtime (`runtime = "nodejs"`, `dynamic = "force-dynamic"`), GET and POST; the context is built per request from the identity adapter, `onError` is `reportingOnError(logReporter)`, every API response is `cache-control: no-store`; one `pg` Pool per server instance from the db seam, created on the first request, never at module load, its sessions started as `trader_app` by startup parameter under `development` and `test` (production logs in as `trader_app`); the root `.env` is loaded by `next.config.ts` through `loadEnvFile`, tolerant of its absence — Supersedes: —
- **2026-11-06** — Development sign-in in the browser: `POST /dev-signin` takes one field, the email, and sets one HttpOnly SameSite=Lax cookie, `trader-dev-email`; `apps/web` derives the subject, `dev:` + the email lowercased, and sets the two development headers before the api adapter sees the request, so the adapter and its gates are unchanged and a second sign-in rebinds nothing; the route answers 404 unless `devIdentityEnabled`, never 403; a sign-out clears the cookie; a built app honours none of it — Supersedes: 2026-11-04 identity adapter, for the browser transport only
- **2026-11-06** — Office shell: DESIGN tokens are CSS custom properties in `apps/web/src/app/theme.css`, the web's theme module; server components with CSS Modules, no UI or styling dependency; the header mark is `assets/brand/logo.png` by static import and `/favicon.ico` is served from that same file by a route handler (`outputFileTracingIncludes`), one home for the asset; breakpoints and navigation wait for the first office screen — Supersedes: DESIGN "theme module per app", made concrete for the web

## 2026-11-07

- **2026-11-07** — Roster API (Stage 4 line 2): `roster.list`, `invite`, `setRole`, `deactivate`, `reactivate`, `setPayRate`, `payRates`, admin-gated; `me.update` writes the caller's `name` and `phone` only (2026-11-06 own profile). An invitation is a users row with email, name and role (`worker` unless named), `identity_subject` NULL, no mail until Clerk (Stage 6); a second email per company by `lower(email)` answers `rejected` `email_taken` through `ON CONFLICT … DO NOTHING`, never a caught 23505. Role and deactivation writers lock the caller, the target and every active admin of the company in one statement, `FOR NO KEY UPDATE` in id order (2026-11-04 lock order; no field-write lock, no other table; they read and write `users` only — a crew led by a demoted or deactivated foreman is the crew-membership task's), and re-judge from those rows: a deactivated caller UNAUTHORIZED, a demoted one FORBIDDEN, a missing or foreign target FORBIDDEN; demoting or deactivating the last active admin is `rejected` `last_admin`, judged under those locks so two admins racing leave one; an admin may change themself while another remains. A deactivated user keeps its bound `identity_subject`; `reactivate` clears `deactivated_at` and nothing else. Pay rates are insert-only: one row per `(user, effective_from)`, a second `rejected` `rate_exists`, no UPDATE path; the rate in force is the greatest `effective_from` ≤ today in `companies.timezone`; a rate inside a closed period is the pay-period task's rule — Supersedes: —
- **2026-11-07** — Office web client: `@trpc/client` and `@trpc/tanstack-react-query` pinned to the installed `@trpc/server` (their peers are exact), `@tanstack/react-query`, `superjson` as the server's transformer; `createTRPCContext<AppRouter>` (type import) in `apps/web/src/app/trpc.ts`, one `QueryClient` per browser, `retry: false`, `httpBatchLink` to `/api/trpc` carrying the cookie, so the office calls the route handler as the phone does and no server-side caller exists; a mutation refreshes its screen by invalidating the list query; UNAUTHORIZED and FORBIDDEN render an empty state, any other failure the attention banner. One breakpoint, 768 px: at or above it the 1280 grid, the left navigation and the data table; below it one column, the navigation behind a menu button (`aria-expanded`), table rows stacked (DESIGN, Layout). A screen is a dynamic server page rendering one client component; office strings stay in `strings.ts` — Supersedes: 2026-11-06 office shell, "breakpoints and navigation wait for the first office screen"
- **2026-11-07** — Customers, jobs and crews API (Stage 4 line 3), admin-gated: `customer.list`/`create`/`update`/`deactivate`/`reactivate`; `crew.list`/`create`/`update`/`setForeman`/`addMember`/`removeMember`/`deactivate`/`reactivate`; `job.list`/`create`/`update`/`assign`/`setStatus`. Every writer locks its rows in the global order — the job `FOR NO KEY UPDATE` (`FOR UPDATE` in `job.update`: a customer change must exclude an invoice's `KEY SHARE`), then the customer `FOR SHARE` (customers rows sit between jobs and crews in the 2026-11-04 lock order, extended), then the crew (`FOR NO KEY UPDATE` for a crew or membership write, `FOR SHARE` for a job naming it), then users rows `FOR SHARE` in id order with the caller re-read among them — so a push holding the job or crew `FOR SHARE` finishes before the write commits and a later push reads the new state (2026-11-05 crew membership writers, fulfilled); no field-write lock, no ledger read. A crew's foreman is an active user with the `foreman` role and a member row, enforced at `create` and `setForeman` (which adds the member), derived afterwards as `foreman.available`; removing the foreman is `rejected` `is_foreman`. A missing or foreign id is the gate's FORBIDDEN; refusals are `rejected` — `user_inactive`, `not_a_foreman`, `crew_inactive` (a job naming a deactivated crew, a foreman change or a member added on one), `customer_inactive`, `jobs_assigned` (deactivating a crew with a non-archived job), `jobs_unarchived` (a customer with one), `has_invoices` (changing an invoiced job's customer), `is_foreman` — and a no-op is `unchanged`. `job.setStatus` writes any of the three statuses, `archived` reversible, reading no ledger; leaving `archived` re-judges the customer and crew under `FOR SHARE` (`customer_inactive`, `crew_inactive`), so a deactivated crew or customer never regains a live job; an open session on an archived or reassigned job ends through push as today. Names have no natural key; blank optional text is NULL; nothing is deleted but a membership row — Supersedes: 2026-11-04 role gates, resource checks for these procedures; 2026-11-04 lock order, extended with customers rows
- **2026-11-07** — Crew membership lifecycle: membership is current-state — one row per (crew, user), added or removed, never dated — and authority stays judged at receipt (2026-11-05 push authority; 2026-11-06 dated assignments). A worker in several crews is ordinary, so a transfer is `addMember` to the new crew then `removeMember` from the old; a foreman change points the crew at an active foreman-role user and adds them as a member, the old foreman staying one until removed; neither reads or moves labor: events belong to a worker and a job, a closeout covers every worker with a session on it, and the fold never reads membership. Roster writers stay users-only (2026-11-07 roster API): a crew whose foreman is deactivated or demoted keeps its pointer, is shown as needing a foreman, and refuses crew labor and closeouts as the push and closeout rules already do; `sync.pull` is amended so led crews require the caller's `foreman` role, output unchanged. A deactivated member keeps its rows (reactivation restores them); a crew deactivates only with no non-archived job, a customer only with none, and un-archiving re-judges both; a deactivated crew is renamed and loses members but takes no foreman change or new member. Offline backlogs: a record captured under membership gone at push stays `rejected` `not_permitted` — permanent, shown as needing attention — and the office re-enters labor through `labor.repair`; office receipt entry is a later task; no effective-dated membership, no grace window — Supersedes: 2026-11-05 `sync.pull`, for led crews; 2026-11-07 roster API's "crew led by a demoted or deactivated foreman"

## 2026-11-08

- **2026-11-08** — Demo fixture (Stage 4 line 4): `pnpm demo` writes a synthetic company into a database of its own on the compose server — `trader_demo` or `trader_demo_<suffix>`, refused when `DATABASE_URL` is set, when the name is the configured database or when it already exists (`--reset` drops only such a name); the owner creates, migrates and bootstraps it through `seed(tx, company)` (the seed's three statements, now parameterised) and writes nothing else; every other row is a server-side caller on an app-role pool, one per persona bound as `dev:<email>`; UUIDv7 ids from a seeded generator and an anchor Monday, so a run is repeatable; one transaction per call rules out atomicity, so a failed step keeps the database for inspection (dropped only when nothing committed); clock skew is not simulated — Supersedes: 2026-11-03 seed, for a second bootstrapped company; 2026-11-07 office web client's "no server-side caller exists", for the demo script
- **2026-11-08** — Figma is the design exploration and review surface (DESIGN, Design tooling): one file on the owner's team — tokens generated from the web theme module, populated screens as built, dated explorations; DESIGN.md stays the single authority and code never follows a frame it does not yet reflect; a UX review of the populated office screens, driven in the browser against the demo fixture, precedes Stage 4 line 5 and ships no screen change itself — Supersedes: DESIGN "theme module per app" (2026-10-13 six-doc set), for tooling only

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

## 2026-11-09

- **2026-11-09** — Office UX review (DESIGN: Layout, UI components, Brand), measured in the browser against the demo fixture at 390, 768 and 1280: the office header is 56 pt with `icon.png`, the signed-in name and sign-out (the development route's form until Clerk); navigation is grouped by workflow and `/` redirects to the first destination; a list screen is a page header with one primary action, then the list, its create form opened on demand; narrow table rows are two lines, and a table takes them by its own column's width (a container query at 720 px on the content column), not the viewport's; row editors are sectioned; result notes are announced and only a refusal is `attention`; record states are words, exceptions pills; shared modules in `apps/web/src/app`, no UI dependency, no API change — Supersedes: 2026-11-06 office shell's `logo.png` header mark (the favicon keeps it); 2026-11-07 office web client's narrow rows stacked cell by cell; DESIGN primary button (2026-10-13 six-doc set), for the wide office only

### 2026-11-09 — UX review, office shell, office list pattern

- **Did:** the review, measured in the browser on `trader_demo` at 390, 768 and 1280; DESIGN
  amended with its decision row; Figma file _TRADER — Office_ (tokens, screens as built). Shell:
  56 pt header, grouped navigation, `/` to Jobs, rows by a 720 px container query. List pattern:
  `page-header`, `field`, `note`, `row-editor`; roster at 390 from 3,547 px to 1,183; 770 tests.
- **Decided:** by the owner on 2026-11-09: plan K-1 to K-6, K-8, K-9 as recommended; K-7 not taken.
- **Next:** owner merges `ux-review`, `office-shell`, `office-list-pattern` in order; then TASKS.

## 2026-11-11

- **2026-11-11** — V1 readiness revision: after a full read-only audit at `fbf2e5d`, the owner authorized one revision of PRD, ARCHITECTURE, DESIGN and RULES and of the repository's structure; the rows dated 2026-11-11 are its decisions, proposed by the audit and approved by the owner. Sections Concurrency, Runtime bounds and Before the first deployment are new homes for facts that lived only in rows — Supersedes: RULES 'never edit PRD, ARCHITECTURE or DESIGN to match code', for this revision only
- **2026-11-11** — Document line caps removed from RULES and CI; a document states each fact once and is as long as that needs; the decisions table stays append-only — Supersedes: RULES caps (2026-10-13 six-doc set)
- **2026-11-11** — Event-time plausibility (to be built): the server compares `client_timestamp` with its receipt. Not offline, not user-timed, yet more than the 5-minute tolerance from receipt: stored `clock_skewed`, reason `clock_skewed`, ordered by `server_timestamp`. Later than receipt plus the tolerance: `rejected` `time_in_future`, as `labor.repair` answers. No new approval reason — Supersedes: 2026-11-05 `offline` as device-recorded evidence alone; the per-push `device_now` reading as the only skew test
- **2026-11-11** — `captured_offline` defined: the device's first delivery attempt for the record began more than two minutes after capture — Supersedes: 2026-11-05 'no confirmed API reachability; unknown counts as offline'
- **2026-11-11** — Rejected-record trace (to be built): every push record answered `rejected`, and every record omitted after a failure, writes one minimized line through the reporter seam — request id, record id, kind, code, user id, company id; no payload, no location, no time. A request id is generated per HTTP request — Supersedes: 2026-11-05 error reporting 'never … a record rejection', for this one line
- **2026-11-11** — `sync.pull` is extended by optional protocol-1 fields; clients parse it loosely and ignore unknown fields; the server's output schema stays strict. Protocol 2 is for a change in meaning. The snapshot carries no `schemaVersion` — Supersedes: 2026-11-06 pilot job suggestion's open choice; 2026-11-05 `sync.pull` 'each record its `schemaVersion`, upcast to v1'
- **2026-11-11** — Pay-period membership (to be built): approved hours belong to the period containing their `work_date` when approved before that period closes; hours approved, corrected or repaired after it closes are exported once, as late-entry adjustments in the next period to close, carrying the original work date. A period is inserted open and never earlier than a closed one, enforced by an INSERT trigger — Supersedes: 2026-10-29 pay periods 'derived from `work_date` and `server_timestamp` against `closed_at`', made precise
- **2026-11-11** — Hours rounding (to be built): durations are summed in milliseconds per worker, job and work date; that daily total is rounded half-up to 0.01 h; payroll and invoice lines are computed from the rounded figure in integer cents. No quarter-hour rounding — Supersedes: —
- **2026-11-11** — Credit memos (to be built, Stage 7): the sum of an invoice's memos never exceeds its total; an invoice with a memo cannot be voided; issuing compares the frozen columns and cannot be combined with a void in one statement — Supersedes: 2026-11-06 open 'credit ceiling and void'
- **2026-11-11** — An admin may approve a repair they wrote (unchanged; one-admin companies exist). The repair and its decision are both written to `audit_log` — Supersedes: —
- **2026-11-11** — `audit_log` is written in V1 for role, activation, invitation and pay-rate writes and for labor repairs and approval decisions: actor, time, before and after, in the write's transaction — Supersedes: 2026-11-03 `audit_log` 'written by after-V1 wiring, empty in V1'
- **2026-11-11** — Runtime bounds (section above): pool size from `DATABASE_POOL_MAX`, a 5 s wait for a connection, an `error` listener on the pool; every protected call sets `lock_timeout` 5 s and `statement_timeout` 20 s in its first statements, push keeps 2 s and 4 s; a request context may carry `waits: "inherit"` so a caller already inside a transaction keeps that transaction's settings (the test suites); at most 10 calls per HTTP request, the web client batching to the same number; client-asserted instants bounded to what Postgres can store, so an impossible date is `invalid_record`, not a record retried for ever — Supersedes: 2026-11-05 `sync.push` timeouts 'when the caller asks for them'
- **2026-11-11** — Tests and the seed refuse to run while `DATABASE_URL` is set (`assertLocalDatabase`); the migrator does not. The seed stays a development and CI fixture — Supersedes: —
- **2026-11-11** — `0027`: `trader_app` loses UPDATE on `pay_rates`, which are insert-only; a privilege withdrawn from the application role is not a destructive change (invariant 8, restated). `0019`, `0021` and `0023` relaxed constraints under the same reading — Supersedes: 2026-11-03 runtime role grants, for `pay_rates`
- **2026-11-11** — Repository structure: `packages/api/src/core/` holds request plumbing; tests mirror `src/` by folder; the caller lock, the server clock and the closed-day query each have one home (`core/locks.ts`, `core/clock.ts`, `closeout/day.ts`). A gate inventory test names every procedure with its gate. Lint is type-aware for unawaited and misused promises — Supersedes: —
- **2026-11-11** — Office web behaviour (DESIGN): every write answers with a result note; a destructive action shows its effect and is confirmed by a second press; a failed load says nothing changed and offers a retry; a row being edited stays in a filtered list until its editor closes; the office is online-only, so a request made offline fails at once and nothing is queued (`networkMode: "always"`); route-level error and not-found screens; baseline response headers on pages and the API — Supersedes: 2026-11-07 office web client 'any other failure the attention banner', refined
- **2026-11-11** — Still open, each a TASKS line: the Neon owner role and backups under forced RLS; worker sign-in without an individual email; an admin's own entries; closeout of archived and crew-less jobs; the client-safe contract export; `status.get` answering without running the identity adapter; the startup guard also checking `session_user` and policy presence — Supersedes: —
- **2026-11-11** — V1 owner decision register: the owner approved decisions V1-D01 to V1-D21 for a documentation-only alignment of the six documents; each row below beginning `V1-Dnn` is one of them, and none is implemented by this change. V1-D05 — the no-line-cap policy of the 2026-11-11 caps row stands: documents stay concise, single-home and without a cap, and no document is added — Supersedes: RULES 'never edit PRD, ARCHITECTURE or DESIGN to match code', for this alignment only (no document is edited to match code)
- **2026-11-11** — V1-D01 — Suspicious event times (to be built, Stage 4): an event's effective instant for ordering, intervals and `work_date` is always its `client_timestamp`; `clock_skewed` — from the per-push reading or the receipt comparison — is stored evidence and the `clock_skewed` approval reason, never a substitution of `server_timestamp`. An event timed after its receipt plus the tolerance is `rejected` `time_in_future`: nothing is written, the record stays on the device under its id, and the office recovers through `labor.repair`. The fold's `effectiveAt` and the closeout day query implement the superseded rule today; the change takes a new fingerprint version (the 2026-11-04 `v1.` row forbids editing v1) and states how closeouts sealed under the old fold are read — none exists outside development and CI databases — Supersedes: 2026-11-04 labor fold '`server_timestamp` when `clock_skewed`'; 2026-11-11 event-time plausibility 'ordered by `server_timestamp`'; Sync protocol 'ordered by `server_timestamp`'
- **2026-11-11** — V1-D02 — `captured_offline` is capture evidence from confirmed API connectivity at capture: false only when the device holds a fresh confirmed reachability reading; unknown, absent or stale is offline; capture never waits on a probe; delivery delay alone decides nothing (to be built with the device, Stage 5; the server stores the flag as sent). The receipt comparison of V1-D01 stays the server's check on a false 'online' — Supersedes: 2026-11-11 '`captured_offline` defined: … first delivery attempt … more than two minutes after capture'; restores 2026-11-05 '`offline` is capture evidence'
- **2026-11-11** — V1-D03 — Pay-period close (to be built, Stage 4): an admin may close a period with approvals unresolved in it after an explicit warning and an acknowledgment the server judges; a closed period and its export are immutable; hours approved, corrected or repaired after the close appear exactly once, as explicit signed adjustments in the next period to close, carrying the original work date, derived from a basis stored at close — Supersedes: 2026-11-11 pay-period membership, extended (its membership and INSERT-trigger rules stand); PRD 'everything that still blocks the close'
- **2026-11-11** — V1-D04 — Rejected-record diagnostics (to be built, Stage 4): minimized lines for rejected or omitted push records the server could identify and for requests that failed as a whole; no payload, location or time; bounded retention, the store and period decided in the task's plan; the device outbox stays the durable copy, and nothing is claimed for a record the server never received — Supersedes: 2026-11-11 rejected-record trace 'every push record … writes one minimized line', narrowed to identifiable records and given retention; PRD 'the server keeps a record that it was refused' as an unconditional promise
- **2026-11-11** — V1-D06 — Pilot identity: every pilot worker has an individual, accessible email address; invitation-only, passkeys and the email-code fallback and recovery are unchanged; shared worker accounts are not permitted; no sign-in or recovery path without an individual email is designed. `users.email` is already NOT NULL and unique per company — Supersedes: 2026-11-11 still open 'worker sign-in without an individual email'; 2026-11-06 open item of the same name
- **2026-11-11** — V1-D07 — Dated assignments (to be built, Stage 4): an admin may assign any worker to any job of their company whatever the worker's crew membership; assignments stay informational and never create membership, authority or access to another worker's records; the office read reports, per assignment, whether push authority would admit the worker on the job — Supersedes: 2026-11-06 dated assignments 'writers, membership at assignment time … decided in the consuming task', for writers and membership (zone and DST rules stay that task's)
- **2026-11-11** — V1-D08 — Admin closeout scope (to be built, Stage 4): an admin may review and submit a closeout for any job of the company, archived and crew-less included; review, locks, lock order, fingerprint, own-id-first retry and append-only history unchanged; a foreman's scope and answers unchanged, a crew-less job still refused to a foreman; an archived job's status is still not written — Supersedes: 2026-11-06 admin day closeout 'archived and crew-less jobs are that task's decision'; 2026-11-11 still open 'closeout of archived and crew-less jobs'
- **2026-11-11** — V1-D09 — Office-created material entries (to be built, Stage 4): an admin may insert a receipt the crew never logged; provenance — office-originated, entered by whom — is stored on the row; the ordinary receipt rules apply (field-write lock, `after_closeout` approval never decided by its logger); no logged, sealed or frozen receipt is updated by it — Supersedes: 2026-11-07 crew membership lifecycle 'office receipt entry is a later task'; 2026-11-07 open 'office receipt entry'
- **2026-11-11** — V1-D10 — As registered: an administrator's own labor requires approval by a different administrator, with no single-administrator exception. Amended by the owner in the alignment session the same day, on a direct question: an administrator's own labor never needs approval, flagged or not (to be built, Stage 4). No approvals row is written for a labor event whose worker is an admin, pushed or self-repaired; evidence columns are stored unchanged. Unchanged: a receipt is never decided by its logger, a correction never by its submitter, a worker's or foreman's event never by that worker; a repair an admin writes for another person is pending and may be decided by its writer (2026-11-11 'An admin may approve a repair they wrote'). Today push and `labor.repair` write the row, the deferred triggers of 0022 and 0026 require it at commit, and `approval.decide` and 0025 refuse the worker's own decision; relaxing the triggers for these events is a constraint relaxation under invariant 8 — Supersedes: V1-D10 as registered; 2026-11-05 approval queue 'nobody decides their own entry — a labor event's worker', for an admin's own labor; 2026-11-05 six approval triggers, for an admin's own labor; 2026-11-11 still open 'an admin's own entries'
- **2026-11-11** — V1-D11 — Worker records: a worker creates own authorized labor and receipts, reads own history, and writes own name and phone; no direct edit of a historical record and no read of another worker's private history; corrections stay the append-only workflow; foreman authority stays crew-scoped; admin authority is company-wide under tenant isolation, immutability and the decision rules of V1-D10. All implemented except the wider own-history read, which is today the 14-day `sync.pull` window — Supersedes: — (confirms 2026-11-05 push authority and `sync.pull`, 2026-11-06 own profile)
- **2026-11-11** — V1-D12 — Pull extension fields (to be built, Stage 5), all optional within protocol 1 and scoped to the caller: job coordinates and detection radius, customer name, the worker's own dated assignments, approval reasons of the caller's own entries; role authorization, tenant isolation and loose client parsing as the 2026-11-11 pull row states; no protocol 2 — Supersedes: 2026-11-11 `sync.pull` extended, fields now fixed; TASKS 'decide the pull extension's fields'; 2026-11-05 `sync.pull` 'no coordinates' and approval state without reasons, for the caller's own scope
- **2026-11-11** — V1-D13 — Labor rounding (to be built, Stage 4): worker/job durations are summed per day before rounding, half-up to 0.01 h, one figure for approved accounting, the payroll CSV and the quantity of invoice lines drawn from labor; ledger records stay exact, money integer cents — Supersedes: 2026-11-11 hours rounding 'invoice lines are computed from the rounded figure', narrowed to quantity (price is V1-D14's)
- **2026-11-11** — V1-D14 — Invoice pricing (to be built, Stage 7): admins set customer-facing draft line prices independently of internal job cost; no mandatory conversion of cost into charge; issued snapshots immutable. `invoice_line_items.unit_price_cents` already stands alone, with no cost reference — Supersedes: PRD 'line items are snapshots of job labor and materials', for price; TASKS 'invoice drafting from job labor and materials', for price
- **2026-11-11** — V1-D15 — Credit memos and voids (to be built, Stage 7): credit memos never total more than the invoice's original total; an invoice with a credit memo cannot be voided; numbering, history and the concurrency rules stand — Supersedes: — (confirms 2026-11-11 credit memos)
- **2026-11-11** — V1-D16, V1-D18, V1-D19 — Exports (to be built, Stage 4 payroll, Stage 7 invoices): a QuickBooks Online invoice CSV, a QuickBooks Desktop invoice IIF and a separate payroll-hours CSV, as independent adapters over one authoritative snapshot; the partner's edition is unconfirmed and the two are not assumed to share a format; file imports where the edition supports them, manual-entry and reconciliation instructions where it does not, no promise of import success; no payroll processing and no accounting synchronization — Supersedes: 2026-10 'QuickBooks CSV' as the one invoice export
- **2026-11-11** — V1-D17 — Pilot launch: the whole pilot crew starts only after every required release gate (TASKS Stage 8) has passed; a phased small-crew rollout is not a prerequisite; partner acceptance, physical-device tests, data-correctness tests and restore verification stay gates — Supersedes: —
- **2026-11-11** — V1-D20 — Audit trail scope: `audit_log` for invitations, role changes, activation and deactivation, pay-rate changes, labor repairs and approval decisions only; actor, tenant, action, entity and the changed fields, in the write's transaction; no universal API or event auditing, no snapshot of unchanged or unnecessary sensitive columns — Supersedes: 2026-11-03 '`before`/`after` jsonb snapshots of the audited row', narrowed to the changed fields; confirms 2026-11-11 `audit_log` written in V1
- **2026-11-11** — V1-D21 — Server-enforced sync states (to be built, Stage 6): `sync.push` and `sync.pull` honour `normal`, `read_only`, `paused` and `update_required` with the meanings of the Operational sync states table; enforcement at transaction boundaries, a stable retryable answer distinct from any per-record rejection, defined behaviour for an interrupted batch, client recovery by a fresh `status.get`; the device keeps its outbox, ids and records; the protocol is not redesigned — Supersedes: 2026-11-05 kill switch 'Advisory to cooperative clients: push and pull do not read it'; Before the first deployment 'advisory by design'
- **2026-11-11** — Review fingerprint `v2.`: the `v1.` tuple unchanged, issued over the fold at captured times (V1-D01); the version is in the canonical value and the prefix, so no `v2.` equals a `v1.`. A `v1.` fingerprint presented at submit is `review_stale`; a retry of an accepted closeout never compares it. Pinned by a golden vector recomputed outside the code — Supersedes: 2026-11-04 Review fingerprint `v1.`, the version only
- **2026-11-11** — Closeouts sealed under the old fold: a closeout stores no derived labor value — keys, zone, status, counts, per-worker `ledger_through`, material members — so the fold change rewrites nothing stored and no accounting snapshot exists to invalidate. Closeouts are read under the current fold; no fold version is stored and no migration is made. The two folds differ only for a session with a `clock_skewed` event in effect; no closeout sealed under the old fold exists outside development and CI databases (V1-D01), which are rebuilt, not migrated — Supersedes: —
- **2026-11-11** — Receipt comparison, as built: `sync.push` judges a labor event against the `receivedAt` it is stored with, after the caller's own id and the scope, before validation. With `d = client_timestamp − receipt` and the 5-minute tolerance `T`: `d > T` is `rejected` `time_in_future` whatever the event claims; otherwise an event neither `captured_offline` nor `time_set_by_user` with `d < −T` is stored `clock_skewed`; exactly `T` either way is neither. `clock_skewed` is that or the per-push reading; `clock_skew_ms` stays the signed per-push reading. A retry answers from the stored row and is never judged again; a record that wrote nothing is judged at its new receipt. Labor events only: a receipt (material) is not compared and has no `time_in_future` — the PRD's "entry" is read as a labor entry until the office can enter a receipt itself (V1-D09) — Supersedes: —
- **2026-11-11** — Demo fixture under V1-D01: the seeded history is delivered long after its capture, so every seeded clock event is `captured_offline` and carries `offline`; the demo admin approves those flagged `offline` alone through `approval.decide`, but one worker-day left for the office; one worker-day claims an online capture and is `clock_skewed` by the receipt comparison. No device clock is simulated — Supersedes: 2026-11-08 Demo fixture, 'clock skew is not simulated'
- **2026-11-11** — Rejected-record diagnostics, as built: the store is the tenant table `sync_diagnostics` (0028, 0029), not the platform's logs or the error reporter — only a table gives the office a query, the tenant its isolation and the retention a delete we run and test; the period is 30 days, enforced by the writer's bounded delete and the read's filter, with a daily cross-tenant delete left to Stage 6. A line carries the database's receipt time, which is what "by day" and the period are measured in; "never a time" is read as never the record's own time. The user is the caller; a budget stop leaves no line; an unresolvable caller leaves none; the write binds no one; one line per record and code; 1,000 lines per caller per 24 h — Supersedes: 2026-11-11 V1-D04, 'no payload, location or time', narrowed to the record's own time; 'the store and period decided in the task's plan', decided
- **2026-11-11** — Request id: one per HTTP request, `crypto.randomUUID()` in the route handler before the context is built, never read from a header, required in the context, not returned to the client. `ErrorReport` gains `requestId` (null for a configuration report) and the source `diagnostics`; it still carries no identity, tenant, message or input — Supersedes: 2026-11-05 Error reporting, 'a minimized event (source, path, type, error names, SQLSTATE)', for the request id and the new source
- **2026-11-11** — `sync_diagnostics` grants: `trader_app` holds SELECT, INSERT and DELETE and no UPDATE; the table has no append-only guard. DELETE exists so the writer can remove its own company's expired lines under the tenant policy; it is the one fact table the application may delete from by age — Supersedes: 2026-11-03 Runtime role, 'append-only tables get SELECT and INSERT', for this table
- **2026-11-11** — `resolveUser` takes `bind: false`: a bound caller resolves, an unclaimed invitation does not and is left unclaimed. Used only by the diagnostics write, so a transaction that is not the caller's own call never signs anyone in — Supersedes: —
- **2026-11-11** — Office screen `/refusals` (DESIGN, Refused entries): a lookup by sender and day of receipt over `diagnostic.list`, read-only, under People in the navigation — Supersedes: —

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

## 2026-11-12

- **2026-11-12** — Audit rows, as built (V1-D20): `before`/`after` hold the changed columns under their column names, or ids — an invitation `{ role }` with the invited user as the entity and no email or name; a role change the role as it was and became; a deactivation and a reactivation `deactivated_at` both ways; a pay rate the new row's `user_id`, `effective_from`, `hourly_rate_cents` and `currency`; a decision `decision` from null. The table is append-only, so nothing personal is written that account deletion would have to pseudonymize. No migration: 0011–0014 stand — Supersedes: —
- **2026-11-12** — A labor repair is one audit row per accepted call, not one per event: `entity_id` NULL, `after` the worker's id and each new event's id, kind and target. A set is written and validated as one, and each event already records its initiator and receipt — Supersedes: —
- **2026-11-12** — An audit row's `created_at` is `clock_timestamp()` at the insert, set by the writer, not the column's transaction-start default: rows sort in the order their writes took effect after the writers' locks (Concurrency) — Supersedes: —
- **2026-11-12** — No audit read procedure and no office screen in V1; the rows are read by the owner in SQL. The tenant policy and the SELECT grant already bound any later reader — Supersedes: —
- **2026-11-12** — Dated assignments, as built (V1-D07): table `job_assignments` (0030, 0031) — company, user, job, `work_date`, `expected_start`, `expected_end` — one row per person, job and day, several jobs in a day allowed and overlapping times not judged; tenant policy under FORCE, composite foreign keys, and SELECT, INSERT, UPDATE and DELETE for the application role, because a plan is edited and removed and nothing references it. Zone and DST: `work_date` is the calendar day in `companies.timezone` as the office wrote it, a business key never derived; the times are `time` without zone, minute precision, `HH:MM` on the wire; the server never converts them to an instant, compares them with now or computes a duration, so a time that does not exist or occurs twice on a clock-change day is kept and shown as written; the end is after the start on the same day, so an overnight shift is not one row; no day is refused for being past. Writers, admin-gated: `assignment.create` plans one person on one job for 1–14 named days in one statement, `ON CONFLICT DO NOTHING` on the natural key, answering `created` with the counts written and already there, `unchanged`, or `rejected` `user_inactive` / `job_archived`; `assignment.update` changes the day and the times only (`already_planned` on a taken day) and is allowed whatever has become of the job or the person; `assignment.remove` deletes, a row that is not visible answering `unchanged`. A job or a person that is missing or another company's is FORBIDDEN; any active user may be planned, whatever their role; no writer reads crew membership. Locks: `create` takes the job then the users rows `FOR SHARE`, as a push does; `update` and `remove` re-read the caller, then the plan's row, position 10 in the lock order; concurrent edits of one plan are serialized by its row and the later stands. Reads: `assignment.list`, admin-gated, an inclusive range of at most 31 days with optional person and job filters, each row with `mayClockIn` — the worker active and `mayStartOn` of `sync/scope.ts`, the function push uses, asked of the planned person — and `blockedBy` (`worker_inactive`, `job_archived`, `crew`), read without locks; `assignment.mine`, any active user, takes no person and answers the caller's own rows with the job's id, name and address only, its query the one the pull extension will use (V1-D12). Not audited (V1-D20's inventory is closed). Office screen `/assignments` under Work (DESIGN, Assignment row) — Supersedes: 2026-11-11 V1-D07 '(zone and DST rules stay that task's)'; 2026-11-06 dated assignments 'zone and DST rules … decided in the consuming task'; V1-D07 and PRD (Jobs and location) 'any worker … any of the company's jobs', narrowed to an active person and a job not archived; 'widens no read', for the planned person's own read of that job's name and address
- **2026-11-12** — Admin closeout, as built (V1-D08): one scope function, `lockCloseoutScope` (`closeout/scope.ts`), called by `closeout.review` and `closeout.submit` — a foreman goes through `lockForemanScope` unchanged, which `material.correct` still calls directly; an admin locks the job's row (`NO KEY UPDATE` at submit, `SHARE` at review), re-reads themself as an active admin, then the company's row, and no `crews` row, because the admin's authority reads no crew. Any job the tenant policy shows is in scope: archived, on no crew, or on a deactivated crew; a job that is not visible is the one FORBIDDEN. `closeout.review` is gated to foreman and admin; `closeout.submit` checks the same two roles in the procedure, after the own-id answer. Everything after scope is shared: a foreman and an admin on one job and day are serialized by the job's row and the later is `already_submitted`; either sending the other's id is `id_conflict`. `jobs.status` is written for a job on no crew as for any other, and never for an archived one. No migration, no new procedure, no change to the input, the answers or the fingerprint; no `audit_log` row (V1-D20's set is closed; the closeout is its own append-only record of who and when). The office screen is `/closeout`: it mints the closeout's UUIDv7 in the browser, keeps it with the whole submission until the server answers so a resend is a duplicate, and shows a closed-out day as locked over the live review, there being no read of a closeout as submitted — Supersedes: —
- **2026-11-12** — Worker ledger read, as built: `labor.ledger`, a query gated to admin, input a worker and an inclusive range of work dates of at most 31 days, no cursor and no limit — the range is refused past its bound, never truncated, so nothing in it is left out. A worker who is missing or another tenant's is the one FORBIDDEN; any visible person is readable, deactivated ones and the caller included. The whole ledger is read with each event's approval in one statement and folded once (`sessionApprovals`, `eventEffect`); a session is kept when its work date, judged on its effective start in `companies.timezone`, is in the range, and carries every event that maps to it whatever that event's own time. A session states its job and the job's status, start, end, state, worked and break milliseconds, accounting, whether a source in effect is a correction, and whether a closeout holds its job on its start's day in the closeout's own zone; an event states its stored facts, whether a location stamp exists, its effect and its approval with the decider's name. `openSession` names the worker's open session whatever its date. Events are ordered by recorded time, receipt, then id. No coordinates, cost, rate or rounded hours; no job or approval filter; no migration, lock, write or audit row. The office screen is `/ledger`, read-only, under People — Supersedes: —
- **2026-11-12** — Approval queue screen and labor repair from the ledger, as built: no new procedure, no migration. `approval.queue` also answers `timezone` — `companies.timezone`, read whether or not the page holds labor — and, on a receipt, `receivedAt`, the row's `created_at`, so a `clock skew` receipt shows the time its phone reported beside the time the server stored it. `/approvals`, under Work: a snapshot read 50 at a time and never refetched behind a decided row; Approve is one press, Reject the two-press destructive action; what the caller may decide is the server's `ownEntry` and, at the write, `own_entry`, so an admin's own labor stays theirs not to decide until the V1-D10 line is built. `/ledger` repairs through `labor.repair` unchanged: for a session, one set of `correct` operations (a changed time; the job on a start only) and `append`s, or a `void` alone; hours nobody recorded are one or two `append`s. The browser mints the set's UUIDv7 ids one millisecond apart in the set's order and keeps them while the set is unchanged, so a resend answers `duplicate`; `id_conflict` takes new ids; `repair_stale` reads the ledger again. A repaired time is wall time in `companies.timezone`, to the minute, converted in the browser: a time a clock change skips is refused, a repeated one is its earlier instant, and an entry whose time was not touched keeps its stored instant — Supersedes: 2026-11-12 worker ledger read's 'The office screen is `/ledger`, read-only'; DESIGN, Worker ledger, 'Read-only: no control approves, rejects or repairs'
- **2026-11-12** — An admin's own labor, as built (V1-D10 as amended): `0032` relaxes two deferred checks, a constraint relaxation under invariant 8 with nothing dropped and no stored row changed. One rule in SQL (`labor_event_needs_no_approval`) and in the API: a labor event needs no approval when its worker is an admin and it was not written by a different admin. `check_entry_approved` (0022, events only) and `check_event_repair_approved` (0026) return early for such an event; receipts, 0020 and 0025 are untouched, and an approvals row for such an event stays legal. `sync.push` reads the worker's role from the users rows its scope already locks `FOR SHARE` and writes no row for an admin worker, so a foreman's push for a crew member who is an admin writes none either; `labor.repair` writes none when the worker is the caller, whom it holds locked as an active admin, and writes its audit row as before. The role the checks read at commit is therefore the role at receipt. A repair one admin writes for another is pending, refused to its worker and decidable by its writer. Acknowledgements carry the stored reasons, so none. `approval.queue` keeps `ownEntry` for labor and `approval.decide` keeps `own_entry`: both still meet rows whose worker is the calling admin — labor received before they were an admin, another admin's repair of their hours, rows stored before 0032, which are left as they are. Consequences: an admin adds or corrects their own hours with no second person, the audit row being the trace; their repair of a closed-out day is not held as `after_closeout`; the `location`, `after_closeout` and `corrected` tags, which live only on an approvals row, are not shown for their events, while the evidence those derive from is stored — Supersedes: 2026-11-05 six approval triggers, for an admin's own labor; 2026-11-05 `labor.repair` 'every new event gets its pending approval', for the caller's own ledger; 2026-11-12 approval queue screen 'an admin's own labor stays theirs not to decide until the V1-D10 line is built'
- **2026-11-12** — Material cost entry, as built: no migration — the columns, the application role's UPDATE on `materials` and the freeze's exception (0018, 0024) stand. `material.setCost`, a mutation gated to admin: input a receipt and `cost`, either `{ cents, currency }` — integer 0 to 2³¹−1 and an ISO 4217 code, required, no default — or `null` to clear; the caller re-read as an active admin, the field-write lock shared as every material writer takes it (not needed for correctness, kept so the rule has no exception; `closeout.submit` holds the day's receipts `FOR SHARE` under its exclusive lock, so a cost save waits a closeout out and never meets it on the row), then the receipt `FOR NO KEY UPDATE`; one UPDATE naming `cost_cents` and `currency`, `updated_at` through the ORM; `saved`, or `unchanged` when the receipt already has that cost, writing nothing, so a resend is harmless; a receipt missing or another tenant's is the one FORBIDDEN; two admins are serialized on the row and the later entry stands. Any receipt is priced — open, sealed, after-closeout, pending, rejected, voided. No approval, correction or closeout is read or written, the fingerprint is unchanged, a priced receipt pushed again is still `duplicate`, and no `audit_log` row is written (V1-D20's set is closed), so who priced a receipt is not recorded. `material.list`, a query gated to admin: receipts newest first by (`logged_at`, id), unpriced only by default, optionally one job (a job not visible is FORBIDDEN), 50 a page by an id cursor whose `logged_at` is read back in SQL; each with its job, logger, facts as logged and in effect, accounting and cost, and the company's zone; no coordinates, capture evidence, rates or sums. The office screen is `/materials`, under Work, a snapshot like the approval queue's; it sends `USD` for a new cost and keeps the currency a priced receipt has. The demo prices three receipts — Supersedes: DESIGN, Layout 'Work — Jobs, Customers, Assignments, Closeout, Approvals'
- **2026-11-12** — Native UI flows: Maestro drives `apps/mobile` on the iOS simulator and the Android emulator on the Mac — committed flows under `apps/mobile/.maestro/`, and its MCP server for inspecting a screen while it is built. Chosen over Detox, Appium and Expo's own automation because Expo's E2E guides use it, it adds no package and no test code to the app, and it has an MCP server. Flows sign in through the development identity against `trader_demo_e2e`, never a vendor instance or `DATABASE_URL`; they select by `testID` (RULES). A green flow shows the screens are wired, never that an invariant holds: a flow that writes is followed by a server assertion, and dropped responses, duplicate sends, id conflicts and a wrong clock stay with the injected-failure tests. Not in CI: `check` stays one job, and the suite runs on the Mac before a release build. Passkeys, physical phones, a real airplane-mode day and background location are outside it; Stage 8's human gates are unchanged. The Android emulator is on the Mac — Supersedes: TASKS Stage 5 'Android Studio with one emulator (Linux workstation)'
- **2026-11-12** — Office material entries, as built (V1-D09): `0033` adds `materials.entered_by_office`, boolean, NOT NULL with no default — every writer states it — back-filled `false` for the rows that existed, all of them pushed; a CHECK holds an office row to no capture evidence (`captured_offline` and `clock_skewed` false, `clock_skew_ms` 0), so `after_closeout` is the only reason it can carry. "Entered by whom" is the existing `logged_by_user_id`: the entering admin is the logger, so the receipt decider rule (0022, `approval.decide`) refuses them their own entry with no new SQL. A push has no key for the column, writes `false`, and answers a replay of the id of its user's office row `id_conflict`. `material.create`, a mutation gated to admin: input an id (UUIDv7 minted by the browser, kept across retries), a job, a calendar day, description, quantity, unit and an optional cost `{ cents, currency }`; order — the id first, answered from its row when it exists (`duplicate` for the caller's own office entry with the same job, day and facts, cost not compared; otherwise `id_conflict`); the job's row shared (missing or another tenant's is the one FORBIDDEN), the caller re-read as an active admin, the company's zone; the field-write lock shared; one INSERT, which also answers an id committed meanwhile; its pending approval when the day is closed out. Any job of the company is admitted, archived or crew-less included, as an admin's closeout is (V1-D08); a device still may not log on an archived job. The day is stored as 12:00 wall time in `companies.timezone`, a time no clock change skips or repeats; a day after today in that zone is `rejected` `date_in_future`, and there is no lower bound. On an open day the entry has no approvals row and is eligible at once; a closeout in flight on its job is waited out on the job's row and the entry then lands pending, and a closeout that waited behind an entry answers `review_stale`, its fresh review covering the entry. No `audit_log` row (V1-D20's set is closed; the row records who). `sync.pull` is unchanged, so the entering admin's own device reads the entry among their receipts. `material.list`, `approval.queue` (a receipt and a correction of one) and `closeout.review` answer `enteredByOffice`; the review fingerprint's tuple is unchanged. The form is on `/materials`; an office entry reads "Entered by the office" with the admin's name and shows its day without a time. The demo enters one, priced, on a closed-out day: with one admin it stays pending — Supersedes: 2026-11-11 V1-D09 '(to be built, Stage 4)'; 2026-11-11 receipt comparison 'until the office can enter a receipt itself'; 2026-11-04 `materials.ts` 'the office logs one through the API, which supplies uuidv7() itself'
- **2026-11-12** — Hours and cost aggregation, as built (V1-D13): no migration. `labor/hours.ts`, pure: `roundHours` — milliseconds to integer hundredths of an hour, `floor((ms + 18,000) / 36,000)` — and one cell per worker, session job and work date (the effective start's day in `companies.timezone`), rounded once on the cell's sum. By the owner on 2026-11-12: a session that counts but is still open adds nothing to approved hours or job cost until it ends, and is counted apart; a labor cost line is one cell's hundredths times the hourly rate in cents, `floor((h × rate + 50) / 100)`, half-up to the cent, and a total is the sum of its lines. `readDayHours` (`labor/day-hours.ts`) folds the whole ledger of each worker named with its decisions, read in one statement, through `sessionApprovals`; a pending session's figure is the fold's worked milliseconds, as the approval queue shows it. `labor.hours`, a query gated to admin: an inclusive range of at most 31 work dates, optionally one person and one job, answering each cell's approved and pending hundredths and its pending, rejected and open session counts; workers are found by an event recorded from a day before the range to a day after it; a person or job not visible is the one FORBIDDEN. `job.cost`, a query gated to admin, one job: lines per worker and work date with the rate in force that day (`roster/rate-on.ts`: the greatest `effective_from` on or before it, none meaning unrated, never zero), labor totals, unrated hours, pending labor priced the same way, rejected and open session counts; receipts judged by `receiptAccounting` and priced by their stored total — counted, unpriced, pending, rejected, voided; `total` is labor totals plus counted receipt totals per currency and nothing else. The workers of a job are those with an event naming it, which a corrected start that moves a session onto it does. Reads only: no lock, write or audit row; rates and receipts are read after the ledger and may be newer, so a figure to be frozen is the pay-period close's to lock. A rate added later with an earlier `effective_from` changes job cost to date. No limit and no cursor on either read. The corrections-and-decision read of a receipt is `materials/standing.ts`, used by `material.list` and `job.cost`. No screen: the next TASKS line's — Supersedes: — (2026-11-05 approval accounting stands: `eligibleWorkedMs` is unchanged, and still counts an open session's closed intervals for its other readers)
- **2026-11-12** — Job cost screen and reconciliation view, as built: no migration and no new procedure. `labor.hours` also answers `workers` — each worker with a cell in the answer and the sum of their cells, by name then id — and `totals`, the sum of every cell: integer hundredths and session counts, sums of the rounded cells and never rounded again, so the screen and the payroll CSV's check read one server figure. `/jobs/<id>` — a job's name on the jobs list links to it, and Jobs stays marked in the navigation — reads `job.cost` and, for the customer and crew, `job.list`: the total per currency with labor and materials beneath it, then apart what is in no total, then labor by day; an address that is not an id is the not-found screen, an id that is not visible the gate's FORBIDDEN. `/reconciliation`, under People, reads `labor.hours` for an inclusive range of at most 31 work dates: approved hours per person by day and job with the server's totals, and apart the cells with a session waiting, rejected or still open. By the owner on 2026-11-12: the range stands in for a pay period until periods exist; the period picker and the carried adjustments (DESIGN, Adjustment line) join the view in the pay-period task, and nothing is shown for adjustments meanwhile. The browser formats and places the server's figures and adds, rounds and multiplies nothing. Read-only: no lock, write or audit row — Supersedes: 2026-11-12 hours and cost aggregation's 'No screen: the next TASKS line's'; TASKS 'carried adjustments shown apart', moved to the pay-period line; PRD (Office review and job cost) 'for a pay period', read as a range of work dates until periods exist
- **2026-11-12** — Pay periods, as built (V1-D03): `0034` adds `pay_period_lines` and, on `pay_periods`, `unresolved_pending_sessions` and `unresolved_open_sessions`, NULL while open; `0035` makes the lines append-only, tenant-scoped under FORCE, SELECT and INSERT for the application role; `0036` adds `lock_pay_periods(company)`, a transaction advisory lock of its own key space taken by the triggers below and first by the API; a period is inserted open and neither inserted nor moved earlier than a closed one; `check_pay_period_close` replaced in place — behind the lock, and the closing update states both counts; a line is inserted only while its period's row, locked `FOR NO KEY UPDATE`, is open, never past its last day, positive on its own dates, and a deferred check holds that the period is closed at commit, so lines exist only for closed periods and only from the closing transaction. By the owner on 2026-11-12: a pay rate dated inside a closed period is accepted — a close stores hours and reads no rate; hours on work dates before the first period, or in no period, are never exported and never an adjustment; a period closes only after its last day has passed in the company's zone (`not_ended`); the latest open period's dates may be changed (`payPeriod.update`), the first period's start included, because the application role cannot delete a period; the acknowledgment is the two counts, compared for equality; unresolved means sessions waiting for approval and sessions that count but are still open, on the period's dates — rejected sessions are decided and receipts are not payroll; a period is 1 to 31 days. Procedures, admin-gated: `payPeriod.list` (newest first, with the zone and today in it), `open` (`opened`, `exists` for the same dates again, `rejected` `not_contiguous` with the day a period may start), `update` (`updated`, `unchanged`, `rejected` `closed`, `not_latest`, `not_contiguous`), `read` (a period's own hours with the server's per-person sums and total, its adjustments with their signed total, and the cells on its dates with a session waiting, rejected or open: stored lines for a closed period, a preview of what a close would store for an open one, adjustments previewed only on the earliest open period, the others naming it; unresolved always live) and `close` (`closed` with the line counts, or `rejected` `already_closed` with the standing close, `earlier_open` with the period to close first, `not_ended`, `unacknowledged`, `unresolved_changed`); a period not visible is FORBIDDEN. Writers re-read the caller, take the pay-period lock, then read the calendar and every stored line in one statement; the close then reads every worker's ledger with its decisions in one statement through `readDayHours`, writes the lines (`pay-periods/lines.ts`, pure) and stamps the row from the server's clock. No field-write lock, no audit row (V1-D20's inventory is closed: the row names its closer). The demo opens its two recorded weeks, closes the first with one entry acknowledged as waiting, and leaves the second open carrying that entry, approved since, as an adjustment. `/pay-periods` under People: the calendar, the next period's form, a period's details and the close (DESIGN, Pay-period close); `/reconciliation` opens on the next period to close and reads `payPeriod.read`, with a range of dates kept as "Other dates" (DESIGN, Reconciliation, Adjustment line). The payroll CSV is the next TASKS line: it prints the stored lines, so "a closed period and its export are byte-identical" is held here on the lines and the read — Supersedes: 'its form is the pay-period task's plan' and 'How that basis is stored is the pay-period task's plan' (Accounting and exports); 2026-11-07 roster API 'a rate inside a closed period is the pay-period task's rule'; 2026-10-29 pay periods 'derived from `work_date` and `server_timestamp` against `closed_at`' (membership is the close's read); 2026-11-12 reconciliation 'the range stands in for a pay period until periods exist'; TASKS 'open and close', extended with `update`
- **2026-11-12** — Release 0.1 — the first production release, for D Sierra Painting, ahead of the pilot build and of V1: phone sign-in; assigned jobs, clock in/out and job switch on iOS and Android with a durable outbox, the foreground location stamp, English and Spanish, and own hours; the office as built, with invoices drafted, issued, voided, rendered to PDF, emailed, and their payments recorded; production on Vercel and Neon with error reporting and a rehearsed restore; both stores. Sequenced by the Release 0.1 track in TASKS, worked before the open lines of Stages 4 to 10. Nothing built is removed and every V1 feature outside it stays required for V1 complete. Left for after it: biometric attestation, materials, photos, the foreman's closeout and the job suggestion on the phone, the payroll CSV, the QuickBooks exports, a credit-memo procedure, the full data export, PostHog, the daily diagnostics delete, server-enforced sync states. The whole crew starts only after the track's go/no-go line is recorded as passed — Supersedes: 2026-11-06 pilot scope, as the first thing the crew uses; TASKS 'a stage starts when the one before it is done', for the track; V1-D17's gate list, replaced for Release 0.1 by the go/no-go line
- **2026-11-12** — Release 0.1 sign-in: a crew member signs in with a one-time code sent by SMS to their own phone number, United States and Canada numbers only; an office admin with a one-time code sent to their own email; invitation-only, no passwords, no shared account. Passkeys are not built. An invitation may therefore name a phone number and no email, and first sign-in binds on the verified phone number or the verified email. The binding key's uniqueness, the adapter's shape, the invitation's fields and the migration are decided in the plan of track line R1, before code — Supersedes: 2026-10 passkeys with email-code fallback, 'no SMS'; V1-D06; 2026-11-06 own profile, '`phone` is contact data, never identity', for a phone the roster invited; Technology stack 'SMS' rejected
- **2026-11-12** — Release 0.1 distribution: production on the App Store and Google Play, United States storefronts, published from the owner's individual Apple Developer and Google Play accounts with the owner's name as the seller — decided by the owner, not reopened without a publishing blocker a store states. TestFlight and Play's closed track carry the crew while reviews run; where Play requires a closed test of a personal account before production, the crew's Android users are its testers — Supersedes: PRD pilot 'TestFlight public link, Play internal track'; TASKS Stage 10's store line, moved to the track
- **2026-11-12** — Release 0.1 invoicing: the office records payments against an issued invoice and reads what is owed, with no payment capture and no stored status; an issued invoice's PDF is sent by email through Resend, each send recorded. The QuickBooks exports, the manual-entry guidance and a credit-memo procedure are not in Release 0.1 and stay V1 (V1-D15, V1-D16, V1-D18, V1-D19 unchanged for V1) — Supersedes: 2026-10 'Payments out of V1', for a recorded payment only; 2026-10 'Resend deferred past V1', for invoice mail only; PRD 'No paid flag and no payment capture', for the record
- **2026-11-12** — Hosts: one Vercel deployment on `app.jpteq.app` (office and API) and the apex (public pages); no `api.` host, since the API is a route handler of that deployment (2026-07 modular monolith). No passkey is built, so no rpID is fixed and no association file is served — Supersedes: 2026-10 '`jpteq.app` everywhere', for the host layout; Domain and identifiers 'the apex serves the web app and the association files … `api.` aliases it'; TASKS Stage 6 'Associated Domains and `assetlinks.json`'
- **2026-11-12** — Release 0.1 backups: Neon's point-in-time restore, with one timed restore drill on the staging branch before the crew starts; its retention window is read on Neon's page for the plan chosen, in track line R3, and recorded there. The nightly `pg_dump` to R2 and its weekly verify follow Release 0.1, still required for V1 — Supersedes: 2026-10 production row, 'nightly `pg_dump` to R2, weekly verify', for Release 0.1 only
- **2026-11-12** — Phone identity, the binding key (Release 0.1, R1): `users.sign_in_phone` (`0037`), E.164, United States and Canada only, held to `^\+1[2-9][0-9]{9}$` by the column's CHECK and by the same pattern in zod, unique per company as the email is and never globally — one company's invitation neither blocks another's nor reveals that a number is in use. It is a column of its own: `phone` stays self-written contact data, so 2026-11-06 own profile stands in full and `me.update` cannot reach a binding key. `email` is nullable (`0039`), NOT NULL relaxed because a crew member is invited by number alone, and `users_sign_in_address_present` keeps one of the two on every row. No row is rewritten and no id changes. First sign-in looks for unbound invitations matching the verified email or the verified number, in every company, and binds only when that is exactly one row: one number invited by two companies, or a login whose number names one invitation and whose email another, binds neither and answers the one `UNAUTHORIZED`. Not built: any path that adds or changes a sign-in address after the invitation (TASKS, Stage 6) — a mistyped invitation is deactivated and invited again; unbinding. Known: an unbound invitation can be claimed by whoever holds its number, so each number is confirmed with its owner before the invitation (TASKS, Stage 6) — Supersedes: 2026-11-12 Release 0.1 sign-in, 'decided in the plan of track line R1', now decided; V1-D06, '`users.email` is already NOT NULL'; 2026-11-12 Release 0.1 sign-in's supersession of 'phone is contact data' for an invited phone — the invited number is another column
- **2026-11-12** — Identity adapter and request settings, phone carried: `identify(headers)` returns `{ subject }` with `email` and `emailVerified: true`, `phone` and `phoneVerified: true`, or both pairs; an address without its flag, or no address, is no identity at context creation. A caller transaction sets and clears `app.identity_phone` with the other two settings. `0038` adds `app_identity_phone()` and two permissive policies for `trader_app`, `users_identity_select_phone` and `users_identity_bind_phone`, beside 0015's, which are unchanged; `users_identity_guard` counts the phone setting as a sign-in identity, and its whole-row comparison already keeps a bind from writing `sign_in_phone`. The development adapter reads a third header, `x-trader-dev-phone`; the browser's development sign-in stays one email field — Supersedes: 2026-11-04 identity adapter, '`{ subject, email, emailVerified: true }`' and 'two headers'; 2026-11-04 identity binding, for the settings and policies it lists
- **2026-11-12** — Invitation by number: `roster.invite` takes `phone`, `email` or both with name and role; neither is `BAD_REQUEST`. A number is taken as typed — ten digits, or eleven starting with 1, any punctuation; a number written with another country's prefix is refused, not reinterpreted — and stored in E.164. Two unique indexes can refuse the insert, so it is `ON CONFLICT DO NOTHING` with no target, still never a caught 23505, and a read then answers `email_taken` or `phone_taken`, the email named when both are held. No role rule ties an address to a role. `roster.list` and `me.get` answer `signInPhone`, and `email` may be null. The audit row is unchanged: the role, no address. The roster's Email column is Sign-in (DESIGN, Roster) — Supersedes: 2026-11-07 roster API, 'an invitation is a users row with email, name and role' and '`ON CONFLICT` … on the expression index'
- **2026-11-12** — Clerk behind the identity seam (Release 0.1, R2). `apps/web` chooses its identity per request, by one rule: the development identity where `devIdentityEnabled` admits it, Clerk everywhere else. A production build therefore never constructs or calls the development adapter: its headers and its cookie are no identity and answer 401, `/dev-signin` is 404, and `/sign-in` is 404 wherever the development identity is on. Clerk's own code verifies the session, in `proxy.ts` (`clerkMiddleware`), which protects no route — the API's gates stay the only authority — and takes `authorizedParties` from `CLERK_AUTHORIZED_PARTIES`. The adapter reads `auth()` and maps four claims the Clerk instance adds to its session token — `email`, `email_verified`, `phone_number`, `phone_number_verified` — onto the seam: an address counts only beside its own flag, the flag only as the boolean `true`; a number that is not `+1` E.164 is dropped, never reinterpreted; the subject is Clerk's user id. No Clerk API is read on a request, nothing is synced from Clerk and no webhook exists. A session that cannot be read is no identity and is reported; a server with either key missing has no Clerk at all, every protected call answers 401, and nothing throws at module load, so CI builds with no key. The Clerk instance is invitation-only, a number required and an email optional, one-time codes only, and a person cannot change an address or delete the account there. The office signs in at `/sign-in` with Clerk's own form and no sign-up; a Clerk session no roster names is told so and offered Sign out. `@clerk/nextjs` is a dependency of `apps/web` alone: `packages/api` sees neither a token nor Clerk. Not built: a session from the phone (R5), the production instance (R9), a content security policy that admits Clerk's hosts (R3) — Supersedes: 2026-11-04 identity adapter, 'refuses the request under any `NODE_ENV` but `development` or `test`', for `apps/web`, which no longer asks it there; 2026-11-06 development sign-in, 'a built app honours none of it', now by construction; Identity, 'until then the development adapter is the only one'
- **2026-11-12** — Invitation at the provider (Release 0.1, R2). Clerk sends an invitation by email only, and none to a person who must be given a number, so `roster.invite` admits the person by creating their Clerk user — the number, and the email when given — through `IdentityDirectory.admit`, which every context carries. The call is made last, inside the invitation's own transaction and bounded at 5 s: a provider that refuses or does not answer invites no one, and the admin sends it again. A number Clerk already holds is an admission and says nothing — a retry, a commit lost after Clerk answered, or another company's invitation of the same number all answer `invited`, so 2026-11-12 phone identity's 'neither blocks nor reveals' holds. An email held by another Clerk user does not stop the number getting its login: the user is created by number alone. Clerk marks an address created this way verified; the person proves it is theirs by the code at each sign-in. No message is sent to the person: the office tells them. Under the development identity, and in the demo, no provider is told and the users row is the whole invitation. A failure carries Clerk's status and error codes, never an address — Supersedes: 2026-11-07 roster API, 'no mail until Clerk (Stage 6)'; TASKS R2, 'an invitation sent on `roster.invite`', as a message
- **2026-11-12** — A sign-in number on every new invitation (Release 0.1, R2; owner). The Clerk instance requires a number of every user, so it cannot hold a person invited by email alone: `roster.invite` requires `phone` and takes `email` beside it; an email alone is `BAD_REQUEST`. An office admin signs in with a code sent to their number, or to their email when the invitation named one. The column rule is unchanged — `users_sign_in_address_present` still asks for one address of the two — and no row invited by email alone before this is rewritten — Supersedes: 2026-11-12 invitation by number, '`phone`, `email` or both … neither is `BAD_REQUEST`'; 2026-11-12 Release 0.1 sign-in, 'an invitation may therefore name a phone number and no email', as the only one-address invitation; PRD Access, 'an office admin is invited by their own email address'
- **2026-11-12** — Neon owner role (Release 0.1, R3), read on the staging project's database that day: `neondb_owner` has `rolbypassrls` and `rolcreaterole` on the role itself and is not a superuser; `neon_superuser` the same. So the owner creates `trader_app` in `0013`, and migrations, onboarding and a later `pg_dump` run as the owner under forced row-level security with no further mechanism. Read again on the production project before its first migration (`packages/db/README.md`); a `false` there stops the cutover — Supersedes: 2026-11-11 'Still open', for 'the Neon owner role and backups under forced RLS'; TASKS Stage 6 '**decide** Neon owner role'
- **2026-11-12** — Deployed database path (Release 0.1, R3; staging's project and the journal by the owner). A deployment's `DATABASE_URL` is Neon's pooled endpoint with `trader_app` as the login, its password set once per database in SQL; the pool passes no startup option, which transaction-mode PgBouncer would refuse, and every request already sets its tenant with `set_config(…, true)` inside one transaction and takes transaction-level advisory locks only. `DATABASE_DRIVER` stays `pg`: no Neon driver is needed on the Node runtime. Migrations and onboarding run from the owner's terminal over the direct endpoint as the database's owner, with `DATABASE_URL` set in that shell for the one command: no second variable, never in a build, never in CI, and no deployed credential in Actions. Staging is a Neon project of its own, production another at R9, because Neon restores only a project's root branch. The journal is replayed as it stands — no migration back-fills data and CI replays all of it into an empty database on every run — and a schema-only dump of the deployed database is diffed against a fresh local replay — Supersedes: TASKS Stage 6 Neon line, 'migrations re-baselined before the first run' and 'the Neon driver behind the seam if the pooled connection needs it'; TASKS Release 0.1 owner line, 'a Neon project with production and staging branches'
- **2026-11-12** — Environment at start, and readiness (Release 0.1, R3). A server under `NODE_ENV=production` refuses to start unless `DATABASE_URL` is a Postgres URL, both Clerk keys and `SENTRY_DSN` are well formed, `CLERK_AUTHORIZED_PARTIES` is stated, `TRADER_DEV_IDENTITY` is blank and the three kill-switch variables parse; it names the variables at fault and never a value (`deploy-env.ts`, called from Next's `register()`, which does not run during `next build`, so CI still builds with nothing set). A kill-switch variable that is invalid at start therefore stops the deployment, where a running server would answer `paused`. `GET /api/ready` is public, uncached and outside tRPC: one transaction on a pooled connection that runs `assertLoginRole` on a deployment — `session_user` and `current_user` both `trader_app`, then everything the runtime guard refuses — and the runtime guard alone in development and under test, where `trader_app` is reached by a startup option. It answers `{"ready":true}` or 503 `{"ready":false}` and nothing else; the reason goes to the error reporter. Until R9 sets Production's variables, a production deployment refuses to start, by design. Not built: the per-transaction guard's own `session_user` and policy checks (Stage 6) — Supersedes: —
- **2026-11-12** — Content security policy and transport security (Release 0.1, R3). On a built app `proxy.ts` sets one policy per request with a fresh 128-bit nonce, on the request (where Next reads it and puts it on every script it renders) and on the response: `default-src 'self'`; scripts from this origin by nonce and `'strict-dynamic'`, never `'unsafe-inline'` or `'unsafe-eval'`; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. Where Clerk is the identity it also admits what Clerk's own page lists and nothing else: its Frontend API host, read from the publishable key, in `script-src` and `connect-src`; `challenges.cloudflare.com` and `*.protect.clerk.com` for scripts, frames and connections; `img.clerk.com`; a `blob:` worker; and `'unsafe-inline'` styles, which Clerk's components need. Clerk's client telemetry is switched off rather than admitted. A development server sets no policy. `Strict-Transport-Security: max-age=63072000; includeSubDomains` on every route of a built app, not preloaded: preloading is slow to undo and is decided with the apex at R9. Every page was already rendered per request, which a nonce requires. Not built: the rest of the edge line — rate limits, a body limit, the `Origin` check, cookie attributes — Supersedes: 2026-11-12 Clerk behind the identity seam, 'Not built: … a content security policy that admits Clerk's hosts (R3)'
- **2026-11-12** — Sentry behind `ErrorReporter` (Release 0.1, R3; the SDK by the owner). `apps/web`'s reporter writes every report to stderr as before and, where `SENTRY_DSN` is set, sends the same minimized event to Sentry after the response (`after()`), never awaited, a failure to send swallowed. `@sentry/nextjs` runs on the server only, initialised at start with no default integration, no tracing, no logs, no breadcrumbs, every data-collection switch off, and a `beforeSend` that rebuilds each outgoing event from an allow-list: time, level, environment, release, the reporter's tags, message and grouping key, and of an exception its class and its frames' file, function, line and column. Never sent, by never being copied: the request, headers, cookies, the user, contexts, extras, the server's name, the transaction name, an exception's message — a query error's holds its statement and parameters — and a frame's source lines and variables. Next's `onRequestError` reports an error thrown outside tRPC through the same allow-list; this widens the 2026-11-05 event by stack positions for those errors only, as that row's code comment foresaw. No browser SDK, no source-map upload, no Sentry token anywhere, `next.config.ts` unwrapped. `@sentry/nextjs` is a dependency of `apps/web` alone — Supersedes: 2026-11-05 error reporting, 'a stderr log reporter until Sentry (Stage 6) implements the interface' and, for errors outside tRPC, 'never a stack'
- **2026-11-12** — Onboarding (Release 0.1, R3). A company, its `invoice_counters` row and its first admin are written by `pnpm --filter @trader/db onboard`, run by the owner over the direct endpoint as the database's owner, in one transaction that is rolled back unless `--apply` is given. Both next numbers are stated, since a contractor's series continues; the zone must be one the runtime knows; the admin's number is required and an email optional, as `roster.invite` holds every invitation; a company name that exists, or a number or email on any roster, is refused. It creates no user at the identity provider — the owner creates that one with the same number, and the first sign-in binds it — and writes no audit row, there being no acting user: MEMORY records each onboarding. It is the one writer that does not refuse `DATABASE_URL`; the seed stays a development fixture — Supersedes: —

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

## 2026-11-13

- **2026-11-13** — Staging operator access (Release 0.1, R3; by the owner). On staging, Claude Code may run the owner-side commands of the database runbook, redeploy a Preview and make test users on Clerk's development instance. It never holds a credential: the staging owner's connection string is an item in the owner's macOS Keychain, read by a wrapper outside the repository that refuses any host but staging's direct endpoint and passes the string to one fixed command (`onboard`, `psql`); a second wrapper takes Clerk's key from `.env`, refuses one that is not a development key and a number outside Clerk's test range; the Vercel CLI is used for `vercel redeploy` alone. Every such command is prompted and approved one at a time, and the commands that would read a secret or reach Production are denied by rule. Neon stays read-only to the agent: branch creation, restore and deletion, and any edit of a secret variable, are the owner's. Production has no Keychain item, no wrapper and no rule; its commands are the owner's until a later decision says otherwise — Supersedes: 2026-11-12 Onboarding, "run by the owner", for staging only

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

## 2026-11-14

- **2026-11-14** — Staging autonomy (Release 0.1; by the owner). On staging, Claude Code does the routine work that destroys nothing without asking each time: SQL as `trader_app` over the pooled endpoint, onboarding, test users on Clerk's development instance, a preview's redeploy and its non-secret variables, Neon branch reads and creation, the feature branch's push and its pull request. It still never holds a credential: each one is an item in the owner's macOS Keychain, read by a wrapper outside the repository that takes fixed subcommands and refuses any target but staging's; no staging secret is written to a file. A destructive step is approved one at a time — SQL as the database's owner, a Neon restore, reset or deletion, a role or password change, the removal of a variable or a test user, any cleanup of a fixture — and the list is in RULES, Toolbox. Production has no Keychain item, no wrapper and no rule: its credentials, variables, deployments, data, store releases and permissions are the owner's alone, as are a merge into `main`, a force-push and a branch's deletion — Supersedes: 2026-11-13 Staging operator access, "prompted and approved one at a time" and "Neon stays read-only to the agent"; RULES, Session protocol, "Do not push"
- **2026-11-14** — Staging is reached through protected branch previews (Release 0.1; by the owner). A preview stays behind Vercel's deployment protection and is never given a public domain. Automation passes the wall with Vercel's Protection Bypass for Automation, sent once to the preview's own host and kept as its cookie, so the secret reaches no other host. Each branch's preview answers on its branch alias, and `CLERK_AUTHORIZED_PARTIES` is set per branch to that origin; the other four variables are set once for every preview. An origin that outlives a branch waits for the domain layout at R9 — Supersedes: —
- **2026-11-14** — Staging browser suite (Release 0.1; by the owner). Acceptance on a deployment is one committed Playwright flow in `apps/web/e2e`, run on demand from the owner's machine against a protected preview: the wall with and without the bypass, an admin's sign-in through Clerk's own form with a fictional number, one fixture customer rewritten and read back after a reload, sign-out, and a worker refused the office. It is not part of `pnpm check` or CI, holds no secret, records no trace, and deletes nothing: its one row is rewritten on every run — Supersedes: Browser checks made by hand on a deployment (MEMORY, 2026-11-12 entries)
- **2026-11-14** — Staging has a Vercel project of its own (Release 0.1; by the owner). Staging's previews are deployments of a second Vercel project on the same repository, rooted at `apps/web`, protected on every deployment, with its own automation bypass secret and its own Preview variables; it builds previews only, so it never has a Production deployment. Production's project is not staging's: no session reads, deploys to or changes it. Claude Code makes, inspects and redeploys that project's Preview deployments without asking each time, through a wrapper outside the repository that fixes the team and project ids, asks Vercel for the project by id before every command and refuses anything but a Preview; the CLI is never linked to a project. A deployment is named by the URL Vercel reports, never by a host worked out from a branch name, and the browser suite runs only against a URL Vercel confirms as a Preview of that project. A variable's removal, a secret variable, Production and a merge stay the owner's — Supersedes: 2026-11-14 Staging is reached through protected branch previews, read as previews of the one project; 2026-11-14 Staging autonomy, "a preview's redeploy", widened to its deployment
- **2026-11-14** — The restore drill is an isolated recovery (Release 0.1, R3; by the owner). The timed drill makes a branch from a past instant of the database's default branch and reads it back against a value written after that instant; the default branch is never rewritten by a drill, and the drill branch's deletion is approved on its own. It proves that a past state can be recovered and how long that takes; it does not rehearse a restore in place, which discards every later write and stays the owner's decision each time — Supersedes: 2026-10 'A timed restore drill before the crew starts', as to its form
- **2026-11-14** — Staging has a permanent branch (Release 0.1; by the owner). `staging-preview` is made from merged `main` and kept. Nothing is developed on it and nothing is merged into it or from it: it holds only commits of `main`, and it moves by an ordinary fast-forward push after an owner merge, made by a session (RULES, Git and CI); no workflow or other event moves it. Its Preview on the staging project answers on that branch's alias, read from Vercel, which is staging's standing origin and the one its branch-scoped `CLERK_AUTHORIZED_PARTIES` names; the browser suite's acceptance runs there. A feature branch's own preview is authorized only when a change must be seen deployed before its merge, by a branch-scoped value of its own. Blocking the branch's deletion and force-pushes at GitHub is the owner's setting; a pull request is not required of it. Whether staging takes a domain of its own stays with the domain layout at R9 — Supersedes: 2026-11-14 Staging is reached through protected branch previews, 'An origin that outlives a branch waits for the domain layout at R9'; RULES, Git and CI, 'Branches other than `main` are short-lived'

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

## 2026-11-15

- **2026-11-15** — Schedule authority (weekly schedule; by the owner; to be built, TASKS S1 to S9). An admin-made shift is the authority for a clock-in once schedule enforcement is on; only an admin writes the schedule, a worker never chooses or changes a jobsite, and a worker with no eligible shift asks the office. Under enforcement a worker's or a foreman's own `started` is admitted by their eligible shift alone, crew membership not required; a foreman's `started` for a crew member needs that member's eligible shift and the foreman's authority exactly as push authority states it today; an admin's own `started` needs no shift and keeps every labor rule it has. Pause, resume and end are never judged by the schedule, and receipts stay under crew authority. The work is three groups of tasks — the backend, the office screen, the phone — each line approved on its own. A shift is planned time and never hours, pay or cost — Supersedes: 2026-11-06 dated assignments 'planning only — never read by push authority … authority stays crew membership judged at receipt'; V1-D07 'assignments stay informational and never create … authority'; 2026-11-05 push authority 'a `started` … needs a non-archived job of a crew the caller is in or leads', for a non-admin's labor `started`; V1-D12 and the pull extension 'the jobs the caller may start on' — each under enforcement only
- **2026-11-15** — Shift rules (weekly schedule; by the owner; to be built). A shift is one person, one job, one calendar day in `companies.timezone`, and a start and an end on that day's wall clock, the start included and the end excluded, so two shifts that touch do not overlap; the end is after the start on the same day and a shift across midnight is refused by the server. A person may have several shifts in a day, on one job or several; an exact duplicate — the same person, job, day, start and end — is refused. Two shifts of one person that overlap are refused unless an admin overrides the overlap with a reason and names the shift that holds the shared time. Over every person's day, at each moment one or more shifts cover, exactly one shift is eligible: a circular, missing or ambiguous precedence is refused, and so is any configuration that leaves a shift no eligible time; two jobsites are never eligible at once (A03-I03, A03-I05). A start is placed by reading its recorded instant as a date and a time in the company's zone; a shift's times are still never turned into instants or durations. Where the clocks go back, a shift over the repeated hour is eligible through both passes; where they go forward, the skipped hour does not occur. A week is Monday to Sunday. The office creates one person's shift on one job for several days at once and changes each day on its own. How the rules are computed and locked is decided in S1 and S3 — Supersedes: 2026-11-12 dated assignments, as built, 'one row per person, job and day', 'overlapping times not judged', and 'compares them with now', for a start's own time only
- **2026-11-15** — Early arrival (weekly schedule; by the owner; to be built). Scheduled eligibility always comes first. At a moment when no shift is eligible, a start is admitted on the shift that next becomes eligible that same day, if that is at most 15 minutes away. It never reaches into time another shift holds, never makes two jobsites eligible, and changes nothing about how hours are counted: the session starts when the start was recorded. A late start is admitted only while its shift is eligible; after a shift's end the worker asks the office — Supersedes: 2026-11-07 crew membership lifecycle 'no grace window', for a start under schedule enforcement
- **2026-11-15** — A shift is locked by its punch (weekly schedule; by the owner; to be built). Once a start has been admitted on a shift, the shift's job, day and times never change and it is never removed (A03-I04). Nor may any other write — a competing shift, an override made, changed or removed, a neighbour's removal — alter what authorized that start: such a write is refused. The schedule keeps what it authorized; a mistake in attendance is corrected in the labor ledger by repair, never by editing the schedule. What exactly is compared, and the guard in the database, are decided in S2 and S4 — Supersedes: 2026-11-12 dated assignments, as built, '`assignment.update` … is allowed whatever has become of the job or the person', '`assignment.remove` deletes', 'a plan is edited and removed and nothing references it', for a shift a start was admitted on
- **2026-11-15** — Overlap overrides keep a history (weekly schedule; by the owner; to be built). The creation, the change and the removal of an overlap override each leave an entry that is never edited or deleted: who, when, the reason, which shift held the time, and both shifts as they stood. The override itself is working state and goes when its shifts go; the history does not. It is narrow: nothing else about the schedule is audited. Its store — new actions in `audit_log` or a table of its own — is S2's plan — Supersedes: V1-D20 'only' and Audit trail 'nothing else', and 2026-11-12 dated assignments, as built, 'Not audited (V1-D20's inventory is closed)', for overlap overrides alone
- **2026-11-15** — A start captured offline that the schedule no longer admits (weekly schedule; by the owner; to be built). A start is judged when it is received, against the schedule as it then stands, at the time the phone recorded (V1-D01). When a start captured offline fails that judgement because the schedule changed, the server stores it under its own id with the time the phone recorded, pending an admin's review in the labor ledger and the approval queue: approved, rejected or repaired. Until decided it counts toward no hours, pay or cost; nothing authorizes it but an admin's decision. Its id stays the duplicate key, so a resend adds nothing and a repair replaces it without adding payable time; because it is stored, the pause, resume and end that follow it are judged against it and are not refused in a chain. The clock rules are unchanged: a start timed in the future is refused, and skew and offline capture are approval reasons as today. A start the schedule does not admit is otherwise a per-record rejection, kept on the phone. How the server tells the first case from the second, and the approval reason's name, are S4's plan — Supersedes: 2026-11-07 crew membership lifecycle 'a record captured under membership gone at push stays `rejected` `not_permitted`', for a start under schedule enforcement; with enforcement off that rule stands
- **2026-11-15** — Copy Last Week (weekly schedule; by the owner; to be built). Copying the week before into a week shows first what will be created and what will be left out and why; nothing is written until an admin confirms. The confirmed copy is one transaction: every eligible shift or none. A resend of the same copy creates nothing twice. No override is copied: a shift that would overlap is left out and listed, and the office decides it afresh. Undo removes every shift that copy created, or none of them when any has been locked by a punch. Every schedule write validates each affected person's whole day in the transaction that writes it, and a punch and an edit of one person's day never interleave; the locks are decided in S3, S4 and S5 — Supersedes: 2026-11-12 dated assignments, as built, '`assignment.create` plans one person on one job for 1–14 named days', as the only writer of several rows
- **2026-11-15** — Schedule enforcement is a switch (weekly schedule; by the owner; to be built, S4, S9). Whether a start is judged by the schedule is decided on the server, never by a client, and is off by default. With it off, the 2026-11-05 push authority, 2026-11-06 dated assignments, 2026-11-07 crew membership lifecycle and 2026-11-12 dated assignments rows stand exactly as built: crew membership decides, a shift authorizes nothing, and push never reads the schedule; the schedule's own rules — overlaps, overrides, copying — hold whatever the switch says. It is turned on, in staging and in production each, only by the owner's separate approval after the phone has been checked on physical devices, and turning it off again restores the built behaviour without a migration. Where the switch lives is S4's plan — Supersedes: A03-I02; nothing superseded
- **2026-11-15** — Schedule words and the visual baseline (weekly schedule; by the owner). On screen the thing is a Shift at a Jobsite; the navigation says Schedule and the screen is titled Weekly Schedule; the schedule shows planned shifts only and recorded labor stays on the labor screens. In code, the schema and the API the names stay `job_assignments`, `assignment.*` and `job`. The office screen follows the fourth revision of the reviewed prototype with the refinements DESIGN lists; that prototype simulated every rule in the browser and proves nothing about the server — Supersedes: DESIGN, Layout, 'Assignments' in the Work group, when the Weekly Schedule screen replaces the built one
- **2026-11-15** — Schedule eligibility, as built (TASKS S1): no migration, no procedure. `assignments/eligibility.ts`, pure, with no database, clock or zone. `resolveDay` takes one person's shifts and overlap overrides on one day — times as `HH:MM`, an override as the shift that holds and the shift that yields — and answers either the day resolved (the covered time in order with its one eligible shift, and each shift's eligible windows) or every issue of the first stage that fails, in a fixed order whatever the order of the input: the shifts and overrides on their own (`duplicate_shift_id`, `invalid_interval`, `duplicate_shift`, `override_unknown_shift`, `override_conflict` for a pair decided twice either way round, `override_not_overlapping` for an override left on shifts that no longer overlap); then `missing_decision` for every undecided overlap, with the shared time; then `circular_precedence`; then `no_eligible_time`. The day is cut at every start and end, and between two cuts the eligible shift is the one that holds against every other shift covering that stretch. A circle is searched for among threes only — among shifts on a line any longer circle contains one — and is refused wherever it is, with the time the three share, including where a fourth shift holds all of that time and no minute would be left uncovered (found by the exhaustive test; the stricter reading of 'a circular … precedence is refused'). What follows from the rules: a shift inside another must be the holder; two shifts at the same times on two jobsites are always refused; a shift's eligible time may be in pieces; an overlap on one jobsite needs a decision like any other; a pair cannot split its shared time; a day's last minute cannot be scheduled, `HH:MM` ending at 23:59. `admitStart` takes a resolved day and a minute of it: `scheduled` on the eligible shift, else `early` on the shift that becomes eligible next when that is 1 to 15 minutes away (`EARLY_MINUTES`), else `none`; it gives back no time and never reads another day. A caller reads a recorded start as a date and a time in `companies.timezone` and drops its seconds, which loses nothing as every bound is a whole minute. Not here: the enforcement switch, the admin's and the foreman's rules, the punch lock, locks, reasons (S3, S4) — Supersedes: 2026-11-15 Shift rules 'How the rules are computed … is decided in S1', for the computation; nothing else
- **2026-11-15** — Autonomous execution of the Release 0.1 track (by the owner). The owner approved one plan for every open line of the track and for the lines it takes from Stages 4 to 7, and a session works them in dependency order without a per-line approval: each line's plan is written in its pull request's description, and what the earlier rows left to "S2's plan", "S4's plan" or "R7's plan" is decided there and recorded as that line's as-built row. Supersedes "each line approved on its own" in the 2026-11-15 authority row and the track's preamble, for these lines only. Unchanged: plan first and wait for anything outside the track; the merge into `main`, production in every respect, a destructive step on staging, a purchase, a store submission and a developer-account or signing action are the owner's
- **2026-11-15** — Release 0.1 scope, amended (by the owner). In the release: the payroll-hours CSV of a closed period (Stage 4's line), and a plain CSV of issued invoices — one row per invoice with its number, date, customer, job, subtotal, tax, total, paid, owed and state — which is no accounting package's import format. Still after it: both QuickBooks exports, credit memos, the full data export. Supersedes "the payroll CSV" among what the 2026-11-12 Release 0.1 row leaves for after
- **2026-11-15** — Office overview and developer console (by the owner; to be built). The office opens on an Overview that only counts and links what its screens already read. A Developer console shows an admin how the deployment stands — sync state and minimum builds, readiness, the deployed commit and environment, whether schedule enforcement is on, recent refused entries — and writes nothing. Neither adds a role, a grant or a read across companies: `users.role` keeps its three members and the console is `roleProcedure("admin")` like every office read. The console is no path around a gate: what it cannot read as `trader_app` under the caller's tenant it does not show
- **2026-11-15** — Office navigation names (by the owner). Overview; Jobsites — Jobs, Customers, Crews, Closeout, Materials; Schedule; Labor — Approvals, Labor ledger, Reconciliation, Pay periods, Refused entries; Invoices; Employees — Roster; Developer. Routes, procedures, tables and ids keep their names (`/jobs`, `/roster`, `job`, `roster.*`); only the grouping and the group labels change. Supersedes the Work and People groups of 2026-11-09
- **2026-11-15** — Schedule enforcement on staging (by the owner). The owner's separate approval, after physical devices, still decides production. On staging a session turns enforcement on, for fictional companies only, once S4's tests pass and S7's flows pass on the iOS simulator and the Android emulator, and records it in MEMORY. Supersedes "in staging and in production each, only by the owner's separate approval" in the 2026-11-15 switch row, for staging
- **2026-11-15** — Integration branch `release-0.1` (by the owner). Each track line is a branch from the line before it with its own pull request into `main`, so `check` runs on it; `release-0.1` is moved by fast-forward to the newest line and is never committed to. Its Preview on the staging project is where unmerged work is run: the browser suite, the simulators, the owner's phones. Staging's database is migrated forward from it, additively, so the `staging-preview` deployment of `main` keeps running against a newer schema. `staging-preview` keeps its rule. The branch is deleted, by the owner, when the last line has merged
- **2026-11-15** — A public staging host for the phones (by the owner; to be set up). A phone build can carry no secret, so the automation bypass cannot reach it. One host of the staging project is exempted from deployment protection, if the project's plan allows it at no cost, and serves `release-0.1`; every other Preview and the whole of production stay protected. Before it is exposed: sign-in, tenant isolation and role refusals are checked on it and a rate limit answers. It holds fictional data only. No second public host, no purchase; if the exemption is not available the step stops and the owner decides
- **2026-11-15** — Schedule schema, as built (TASKS S2): `0040`, `0041`. A shift is a `job_assignments` row; the unique key is now the exact shift — person, day, job, start and end — so one job twice in a day at other times is two rows, and `assignment.create` and `assignment.update` name that key until S3 rewrites them. The punch lock is two columns, `locked_at` and `locked_by_event_id`, null together, never set at insert, set once to a `started` of the row's own person on its own job; from then a trigger refuses any change of day, start, end or lock, any removal, and TRUNCATE while a locked row exists. A shift's company, person and job never change at all. What the database does not judge, and the writers must (S3, S4): whether two shifts overlap, whether an override is needed or circular, and whether a write alters what authorized a start already admitted — one row cannot prove any of them. `shift_overrides` holds the holder and the yielding shift, a reason and its author: two different shifts of one company, one person and one day by trigger, one decision per unordered pair, removed with either shift by cascade; a shift an override names keeps its day. The history's store is a table of its own, `shift_override_history`, append-only by 0002's guard, carrying the action, actor, reason and both shifts as they stood in columns, with no foreign key to the override or the shifts it outlives. The mark of a copied week is `job_assignments.copy_id`. The enforcement switch lives in the database, per company: `companies.schedule_enforced`, false by default, which the application role reads and cannot write — its UPDATE on `companies` is now a column grant on `name`, `timezone` and `updated_at` — so only the database's owner turns it on, staging and production each hold their own value, and no deployment or request changes it. Both new tables are tenant-scoped under FORCE with `trader_app` policies; grants are full on overrides and SELECT, INSERT on the history. Counted before migrating: `job_assignments` is empty on staging, and the old key's removal loses no row anywhere — Supersedes: 2026-11-12 dated assignments, as built, 'one row per person, job and day'; 2026-11-15 rows, 'Its store … is S2's plan', 'the guard in the database … decided in S2', 'Where the switch lives is S4's plan'
- **2026-11-15** — Validated shift writers and the week read, as built (TASKS S3): no migration. Every schedule write runs under an exclusive advisory lock on the person's day — two days, in day order, when a shift moves — taken after the job's and the users' row locks and before any shift or override row; it loads that day's shifts and overrides, applies the change in memory and judges the result (`assignments/day.ts`, `judgeDay`) before writing anything. The judgement is S1's `resolveDay`, then, for every shift a clock-in has locked, that a start at the minute that clock-in was recorded, read on the company's wall clock, is still admitted on that same shift: that is what "alter what authorized that start" compares. A refusal carries S1's issues or the locked shift's id and writes nothing. `assignment.create` takes the browser's UUIDv7 for each day and a decision for each overlap — the other shift, which of the two holds, a reason — and answers day by day: `created`, `duplicate` for an id that is already that shift, `id_conflict`, or the refusal; a refused day leaves the others standing. `assignment.update` keeps a decision while its two shifts still overlap, changes it when a new one is given, and removes it when they no longer overlap or the shift moves to another day; `assignment.remove` takes the shift's decisions with it; `assignment.decide` turns a decision round or restates its reason. An override is never removed on its own, since an overlap is never left undecided. Each creation, change and removal writes its `shift_override_history` entry in the same transaction; `audit_log` takes no row for the schedule. A locked shift answers `locked` to a change or a removal, before the database's guard is reached. `assignment.week` takes a Monday and answers seven days of shifts with each one's eligible hours and lock, and the week's overrides; `assignment.list` and `assignment.mine` are unchanged. Retired of the V1-D07 line: one row per person, job and day, and "overlapping times not judged" — Supersedes: 2026-11-12 dated assignments, as built, '`assignment.create` … ON CONFLICT DO NOTHING on the plan's natural key', 'overlapping times not judged', '`already_planned`'; 2026-11-15 rows, 'How the rules are … locked is decided in S1 and S3', 'What exactly is compared … decided in S2 and S4'
- **2026-11-15** — Clock-in eligibility and the punch lock, as built (TASKS S4): `0042` adds the approval reason `unscheduled`. Enforcement is `companies.schedule_enforced`, read in the record's own transaction for a `started` and for nothing else; while it is off, push reads no shift. With it on: a worker's or a foreman's own `started` passes authority on a job that is not archived, with no crew asked; a foreman's `started` for a crew member passes authority exactly as before; an admin's own is not judged by the schedule at all. A start the schedule decides is judged after validation — so a future time, a second open session and the rest keep their own names — by `judgeStart` (`sync/schedule.ts`): the recorded instant read as a day and a minute in the company's zone, that person's day lock taken, the day resolved, the minute admitted by S1's `admitStart`, and the admitting shift's job equal to the start's. Admitted, the event is inserted and its shift locked in the same transaction, once: a later start on a locked shift leaves the first lock. Not admitted, the record's own `captured_offline` decides the two cases the owner named: captured offline, it is stored under its id at its recorded time with a pending approval carrying `unscheduled` beside its other reasons, locks nothing, counts toward nothing until an admin decides it, and is what the pause, resume and end behind it are judged against; captured with a connection, it is refused `not_scheduled` and writes nothing. The server does not establish that the schedule changed: the phone under enforcement offers only what its last pull admitted, so an offline start that fails differs from the server's schedule for that reason or because the pull was old, and both wait for the office. An unscheduled offline start for an admin worker, which a foreman could send, is refused, because an admin's labor takes no approval and so could not wait for one. Lock order: the scope's rows, the field-write and worker locks, then the day's lock, then the shift's row; the office's writers take the day's lock before any shift row, so an edit and a start on one day are serialized in either order. `sync.pull` answers `scheduleEnforced`. Rollback is the switch off: no deployment is involved. Retired of the V1-D07 line, with the switch on only: "changes no push answer" — Supersedes: 2026-11-15 rows, 'How the server tells the first case from the second, and the approval reason's name, are S4's plan', 'Where the switch lives is S4's plan'
- **2026-11-15** — Copy Last Week, as built (TASKS S5): no migration. `assignment.copyPreview` takes the Monday of the week to fill and reads the week before it; it writes nothing and answers what would be created, what is left out and why, and a fingerprint of both. A shift is left out when its person is deactivated, its job is archived, the same shift is already in the target week, it would overlap a shift there or one copied before it, or it would change what admitted a clock-in already made that day; within a person's day shifts are taken in start, end and id order, so of two that overlapped in the source the earlier is copied and no override ever is. `assignment.copyConfirm` carries the browser's id for the copy, the week and the fingerprint: it locks the jobs and the people FOR SHARE in id order and every affected day — by person, then day, one order for every caller — works the plan out again, and unless its fingerprint is the one confirmed writes nothing and answers the plan as it stands; otherwise every shift is inserted in one statement with the copy's id on it. A confirmation whose copy already has rows answers `duplicate` and writes nothing, asked under the same locks so that two sent at once are one case. `assignment.copyUndo` removes every row carrying the copy's id, edited since or not, with the history of any override made on them, or none of them when a clock-in has locked one. Removing shifts is not judged: what stays keeps every minute it had — Supersedes: 2026-11-15 Copy Last Week, 'the locks are decided in S3, S4 and S5'
- **2026-11-15** — Weekly Schedule screen, as built (TASKS S6): no migration, no new procedure. `/schedule` replaces `/assignments`, which redirects to it. `assignment.week` gained the company's zone, each shift's `copyId`, and for each override who decided it as it stands and when — the newest entry of its history, or its author where it has none. The browser judges nothing on its own authority: it imports the server's pure rules through `@trader/api/eligibility` to show the hours two shifts share and the day as it would stand before a save, disables a save that cannot stand and says why, and the server judges every write again. The browser mints each shift's id and each copy's id once per open form, so a write sent again is answered as the same write — Supersedes: 2026-11-12 dated assignments, as built, the office screen at `/assignments`
- **2026-11-15** — Overview and navigation, as built (TASKS A01): no migration. `overview.get` is one admin read of four counts under the caller's tenant — approvals with no decision; sessions that count and have no clock-out, summed from the one labor derivation over every worker with an event; refused-entry lines inside the retention period; shifts in the Monday-to-Sunday week around today in the company's zone — with the zone, today and that Monday. It is a read of its own because the approval queue is paged and the refused-entry read takes a person and a day: neither can be counted from the browser. `/` opens `/overview`. The navigation is grouped as the 2026-11-15 names row states; a group with one destination and no label stands alone — Supersedes: 2026-11-09 office shell, '`/` to Jobs'
- **2026-11-15** — Payroll-hours CSV, as built (V1-D18; TASKS, Stage 4 and the Release 0.1 track): no migration. `payPeriod.export` is an admin read that answers a closed period's file and its two totals, and `not_closed` for an open one. The file is built from `payPeriod.read` and nothing else, so for a closed period it is the lines its close stored: the same bytes after any later approval, correction, repair or rate. Columns: `period_start`, `period_end`, `kind` (`hours` or `adjustment`), `employee`, `employee_id`, `job`, `job_id`, `work_date`, `hours`; the period's own hours first, then the adjustments it carries, each with its original work date and its sign; hours are decimals with two places; RFC 4180 quoting and CRLF. A cell a person typed that begins with `=`, `+`, `-`, `@`, a tab or a return is led by an apostrophe, so no name is run as a formula; a figure never is. No rate, pay or overtime: payroll computes pay — Supersedes: V1-D18, 'columns decided in the plan'
- **2026-11-15** — Developer console, as built (TASKS D01): no migration. `developer.get` is one admin read under the caller's tenant: the sync mode and each platform's minimum build as `serviceStatus` reads them (`configuredStatus`, null where the variable is unreadable), the protocol range, the company's `schedule_enforced`, `current_user`, the count of refused-entry lines inside the retention period and in the last day, and the twenty newest of them with the person's name. It writes nothing and reads no secret: the three variables it reports are the operational switches, never a key. `/developer` shows that beside two facts the server page reads from the platform's own variables — the commit and the environment — and the status of the public readiness check, never its body. No migration count: the application role cannot read the migrator's journal, and the console shows nothing it cannot read as that role — Supersedes: —
- **2026-11-15** — Invoices, as built (TASKS R6; V1-D14): `0043` replaces 0010's guard function so that the statement that issues an invoice changes nothing else on it and is never also a void. `invoice.create` makes a draft for a job, and so for that job's customer, under the browser's id; `invoice.save` replaces the draft's lines whole, in the order sent, and sets its tax; `invoice.remove` deletes a draft. A line holds its own description, quantity, unit and the unit price the admin entered, and its amount is quantity times price rounded half-up to the cent, computed in integers with the quantity in thousandths — what the table's own check computes. `invoice.suggest` offers what a line may be drawn from as words and a quantity alone: the job's approved hours, one line a work date with every worker's rounded figures added, and its receipts that count; it answers no price, rate or cost, and a line once made never follows what it was drawn from. `invoice.issue` holds the invoice's row FOR UPDATE and issues by one UPDATE, the database assigning the number under the counter's row lock; sent again it answers the number the invoice has. `invoice.void` is the one change after issue, once, and gives no number back. A state is derived — a draft has no number, an issued invoice has one, a void one has a void stamp — and totals are sums of the stored amounts and the stored tax. No audit row: who issued and who voided are on the row — Supersedes: 2026-11-11 credit memos, 'issuing compares the frozen columns and cannot be combined with a void in one statement', as to the issue
- **2026-11-15** — Recorded payments and the invoice CSV, as built (TASKS R7, first half): `0044`, `0045`. `invoice_payments` is append-only under FORCE with a tenant policy and SELECT, INSERT for the application role: the browser's id, the invoice and its currency, a positive amount, the day paid as a calendar day, a method of five, a note, who recorded it. Each insert is judged in the database under the invoice's row lock: the invoice is issued and not void; the payments that stand — neither reversed nor a reversal — never total more than its lines and tax, so there is no overpayment; a reversal names a standing payment of the same invoice for its amount, once. Nothing is stored on the invoice: `paidCents` and `owedCents` are derived on every read, and a draft and a void invoice owe nothing. An invoice with a standing payment is not voided; the payment is reversed first. `invoice.exportCsv` is one row for each invoice that has a number, void ones included, with `number`, `issued_on` in the company's zone, `customer`, `job`, `currency`, `subtotal`, `tax`, `total`, `paid`, `owed`, `state`: the list's own figures as two-place decimals, and no accounting package's format. A database refusal is recognised by the shape of the error's cause (`core/pg-error.ts`), never by the class that wrapped it: the web build holds more than one copy of the ORM — Supersedes: 2026-11-12 Release 0.1 invoicing, 'The tables, their guards and the money rules are R7's plan'
- **2026-11-15** — Edge protection, as built (TASKS, edge protection for a public host; of Stage 6's edge line, the rate limits, the body limit and the `Origin` check): `0046`, `0047`. In front of the API route and before any identity or transaction (`apps/web`, `server/edge.ts`): a state-changing request states its body's length and is at most one mebibyte; one that carries an `Origin` other than the deployment's own or an authorized one (`CLERK_AUTHORIZED_PARTIES`) is refused — a request with no `Origin`, the phone's, is no browser's cross-site request; and each address is held to 600 requests a minute. Once the adapter has said who is calling, that identity is held to 300 a minute. A limited caller gets 429 with `Retry-After`. The count is a fixed window in Postgres (`rate_limit_windows`, `core/rate-limit.ts`): one statement inserts or raises the caller's count for the window and reads it back, on the database's clock, on the pool and outside the request's transaction, so every instance of a serverless deployment shares one count and a refused request is still counted. The key is a SHA-256 of the scope and the address or the subject: the table holds no address and no person, carries no `company_id` and takes no row-level security. The address is the platform's own header, which Vercel overwrites; where there is none nothing is counted by address. A limiter that fails refuses nobody and is reported. The platform's firewall is not used: its rule would live in a dashboard, outside the repository and its tests — Supersedes: —
- **2026-11-15** — Field app skeleton, as built (TASKS R4): `@trader/api/contract` is the one value import the app may make from the API — zod schemas and constants with no server code, held pure by a test and by a lint rule on `apps/mobile` that refuses any other value import of `@trader/api` and every import of `@trader/db`. The development sign-in's header names live there, since both ends read them. `apps/mobile` is Expo SDK 58 with expo-router and a development client, id `app.jpteq.trader` on both platforms; `ios/` and `android/` are generated by prebuild and never committed. Strings are two typed catalogs, English and Spanish, with no i18n library; the first language is the device's, and the choice made in Settings lasts for the run of the app only until the device store exists (R5). Sign-in is the development identity alone, on only when the bundle is a development one and `EXPO_PUBLIC_DEV_IDENTITY` says so; Clerk is R5's. The one screen with data reads the caller's jobs from `sync.pull`. The smoke flow selects by `testID` and is started by a script per platform, because the development client's launch link carries switches Maestro's `openLink` truncates on Android. — Supersedes: The phone needs a contract it can bundle without the server, and a skeleton proven on both platforms before sync and Clerk are built on it.
- **2026-11-15** — The phone's clock and sync, as built (TASKS R5 without its sign-in, S7, S8's screen; V1-D02, V1-D21 on the device): no migration. `sync.pull` also answers the caller's own shifts from the Monday of the company's week for fourteen days, each with its jobsite and the hours it is the eligible one, null on a day whose overlap is undecided; protocol 1. On the phone, Drizzle on expo-sqlite holds an outbox and a key-value table, made on open by additive statements; a record is written once at capture and only its standing moves (`pending`, `syncing`, `settled`, `rejected`). A cycle is `status.get`, push, pull: `paused` and `update_required` touch nothing, `read_only` only pulls; a thrown call is the network and marks nothing; a record the answer omits returns to pending under its id; one left `syncing` is reclaimed after two minutes; batches of 100. Whose records a push sends is what the last pull said, never what a record says, and the snapshot is dropped with the session in both directions. A settled record is kept while the office has yet to decide it, since its reasons are nowhere else on the phone. Cycles run at sign-in, when the app comes forward, every 60 seconds in front and after each capture, coalesced. The reachability reading is the last time any API call answered; a capture is online only on one no older than two minutes. The location is one read with high accuracy while the app is in front, kept two minutes; a capture takes what is in hand and never waits. Ids are UUIDv7 from a minter that never goes backwards; a job switch is `ended` then `started` a millisecond apart. Under enforcement the clock offers the shift whose eligible hours hold the minute, or the next within fifteen minutes, restating the server's rule only to show what to expect. No biometric attestation: every event says `none`. — Supersedes: The clock must work with no signal and no session, and nothing a phone says is believed over what the server holds.
- **2026-11-15** — The phone's sign-in, as built and not yet run (TASKS R5): `@clerk/expo` behind the session seam. A build that carries `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and not the development identity wraps the app in Clerk's provider, its session in the phone's secure store; the sign-in screen asks for a `+1` number, has Clerk send and check the code, then asks `me.get` whether a roster holds that person and signs Clerk out again when none does. Every call carries Clerk's current token as a bearer header, fetched at the call; a capture never asks for one. That somebody is signed in is the app's own record in the device store, so the app opens on the clock offline; a call the server answers 401 says to sign in again and keeps every record. The key is given to a build as a variable and written nowhere in the repository, since it carries the provider's host. No sign-up, no passkey, no social sign-in; Clerk's config plugin and native components are not used. — Supersedes: The seam was already there; the phone's half is the provider's own SDK and nothing of ours holds a credential.
- **2026-11-15** — Invoice PDF, as built (TASKS R7, the PDF; its email is still open): no migration. `invoice.pdf`, admin-gated, answers an issued or void invoice as one PDF, base64 in the JSON answer, made when asked and stored nowhere; a draft answers `not_issued`. The page is drawn by `pdf-lib` with its built-in Helvetica from `invoice.read`'s own figures — the stored line amounts, the stored tax, what is paid and owed — and computes nothing; a void invoice says VOID and shows neither paid nor owed. It is dated with the invoice's issue, so the same invoice is the same bytes whenever it is asked for. The customer's name and address are read as they stand now: nothing of the customer is copied at issue. A character Helvetica cannot draw is written `?`; quantities drop the decimal places that say nothing; US Letter, English, one layout. — Supersedes: The customer needs a page, and a page made from the stored figures cannot disagree with the screen.
- **2026-11-15** — Invoice email, as built and not yet seen arriving (TASKS R7): `0048`, `0049`. `invoice_sends` is append-only under FORCE with a tenant policy and SELECT, INSERT for the application: a send is of an issued invoice that is not void, to one lower-case address, and is `sent` with the service's message id or `failed` with a short code and never the service's words. `invoice.send`, admin-gated, takes the browser's UUIDv7 as the send's id, holds the invoice's row from its check to its record, renders `invoice.pdf`'s own page, hands it to the mailer and records the answer; the same id again answers what the first did and mails nothing. The mailer is a fourth thin seam (`core/mailer.ts`): it never throws, and a context whose host names none fails every send closed as `mail_not_configured`. The office's is Resend over its HTTP API with `fetch` and no mail package, with the send's id as the idempotency key and an 8-second limit. `RESEND_API_KEY` and `MAIL_FROM` are set together or not at all; one without the other stops a deployment. `INVOICE_EMAIL_ALLOWLIST` names who may be sent to: anywhere but production a deployment with no list sends to nobody, so staging cannot mail a customer; a refused recipient is a recorded failed send that asked the service nothing. `invoice.read` answers the customer's address on file and every send. No audit row: the table is the record. — Supersedes: A send is money's paper trail, and a staging system that could mail a customer by accident is a defect waiting.

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

## 2026-11-16

- **2026-11-16** — The origin rule for a phone's token, as built (TASKS R5): no migration. Clerk's library, given `authorizedParties`, refuses a session token that names no origin (`azp`), and a native client's token names none: with the list set, as every deployment requires, a phone's `sync.pull` was 401 (seen on the iOS simulator; `@clerk/backend` 3.27.0 read). The proxy gives Clerk the list for a cookie's token and none for a token in the `Authorization` header (`partiesFor`, `clerk-env.ts`); the adapter then refuses any token that does name an origin outside the list, wherever it came from (`admitsParty`, `clerk-identity.ts`). The one thing newly admitted is a verified token with no origin in a header, which a browser cannot be made to send across sites. — Supersedes: The check exists to stop a cookie issued to another origin of the same domain; a header carries no such risk, and a phone cannot work without it. Leaving the list blank on deployments would have dropped the check for the office too
- **2026-11-16** — Repository and permanent branches (by the owner). The repository stays public and personally owned; nothing in the design asks for a transfer, a second repository or a private one. Three branches are permanent: `main`, merged by the owner alone; `staging-preview`, which holds only commits of `main`; `production`, which holds only released commits of `main`. No permanent infrastructure names a feature or release branch: `release-0.1` is retired, and the 2026-11-15 integration-branch row ends with the track's merge — Supersedes: A client receives the deployed application, never access to the repository; a public repository keeps protected branches, environments and hosted runners at no cost
- **2026-11-16** — Staging promotion by GitHub Actions (by the owner; to be built, TASKS Automation). After each merge into `main` whose `check` passed, one serialized workflow promotes that commit: it checks that the commit is on `main`, that `staging-preview` can fast-forward to it and that staging's applied migrations are a prefix of its journal; reads the pending migrations for statements that destroy or revoke; rehearses them on the kept Neon branch and compares the result with a fresh replay; migrates staging; fast-forwards `staging-preview`; waits for the deployment; reads the deployed commit from the deployment itself; runs the browser suite; and reports the deployed revision, the migration count, each gate and one of three failure classes — before staging changed, migrated and not deployed, deployed and failing. A commit overtaken while waiting is skipped; a run already satisfied changes nothing. Each step reads its state from the systems themselves, so a re-run resumes where reality is. Supersedes "moved by a session, no event-triggered workflow" in the 2026-11-14 permanent-staging-branch row and "run on demand, not in CI" in the 2026-11-14 browser-suite row; `check` itself still runs no browser flow — Supersedes: The owner's merge is the approval. Migrate-then-deploy is the runbook's order, and additive migrations keep the older deployment serving in between
- **2026-11-16** — Staging credentials in a GitHub environment (by the owner). Amends "a credential is used, never read" of the 2026-11-14 staging-autonomy rows: the promotion workflow holds copies of staging's migrator connection strings, and the build workflow an Expo token, as secrets of environments restricted to `main`. A workflow that holds a secret runs only code already on `main`, never on a pull request's event, with the token's permissions stated per job and actions pinned by commit. GitHub never holds a production value, a Vercel token, a Neon API key, a DNS token, the identity provider's secret key or a signing credential. A migration the reading flags waits in a second environment for the owner's approval. Sessions on the Mac keep the Keychain wrappers — Supersedes: A personal Neon key spans every project and a project-scoped one needs an organization; the suite signs in through the form with test numbers and the deployment is awaited through GitHub's own deployment records, so neither vendor's key is needed
- **2026-11-16** — Migration rehearsal on a kept branch (by the owner). One Neon branch of staging is kept for rehearsal until the owner deletes it, addressed by its id. A promotion applies the pending migrations there first; the branch then stands where staging will. A count that differs from staging's before a rehearsal is drift and stops the promotion. Its reset, like a restore, is approved one at a time and run from the Mac — Supersedes: Pending migrations run in one transaction, so a failed rehearsal leaves the branch clean and staging untouched
- **2026-11-16** — The public staging host serves `staging-preview` (by the owner; set up). Staging has a host of its own under the owner's domain, attached to `staging-preview` and exempt from deployment protection; every other Preview stays behind the wall. Supersedes "serves `release-0.1`" in the 2026-11-15 public-host row and settles Stage 6's staging-domain decision. The host's name is a variable of the GitHub environment and of the phone build, written nowhere in the repository — Supersedes: A permanent origin for the browser suite, the phones and the identity provider's origin list
- **2026-11-16** — Native tests on the owner's Mac, by polling (by the owner; to be built). The Mac asks GitHub what is due — a nightly run and every release candidate — runs the Maestro flows on the iOS simulator and the Android emulator, and posts a status per platform and a heartbeat with a token that can write statuses only. A scheduled workflow with no secret reads them and says when the runner is offline, a run was not started, or a platform is missing. A candidate is native-verified only when both platforms passed at its exact commit. No hosted macOS runner, and no self-hosted Actions runner. Physical phones are never driven by automation; their checklist reads "not performed" until a person says otherwise — Supersedes: A self-hosted runner on a public repository would let a pull request run code beside the Keychain; a poll opens no way in
- **2026-11-16** — Staging mail and DNS (by the owner). Staging sends from a subdomain of its own at Resend, with a key that can only send and only from it; the apex's mail is untouched. Its DNS records, and no others, are written by a wrapper on the Mac that holds the owner's DNS token in the Keychain: named records only, created when absent, updated only when the wrapper made them, never deleted; nameservers, the apex, production's routing and every other record are the owner's — Supersedes: The 2026-11-15 invoice-email row's allow-list still decides who staging may write to
- **2026-11-16** — `production` and the release gate (by the owner; to be built). A release candidate is a tag on a commit of `main`. One report for that commit sets the `release-gate` status only when all hold: `check`; a promotion whose deployed revision is that commit; the browser suite; both native statuses; production's pending migrations listed and read; the dependency audit and the secret scan; and the production tree — the fixed document set, nothing generated, no host name, versions agreeing with the tag. `production` takes the tagged commit by the owner's pull request and equals it file for file. A merge into `production` puts nothing live: the live promotion, production's migrations, signing and store submission are the owner's separate acts — Supersedes: Supersedes nothing: production stays the owner's alone (2026-11-14)
- **2026-11-16** — Autonomous execution of the automation lines (by the owner). TASKS' Automation lines are planned in their pull requests and worked without a per-line approval, as the 2026-11-15 autonomous-execution row has it for Release 0.1. Still the owner's, each at its step: merges, GitHub's environments and settings, account and signing actions, anything destructive, anything paid, production
- **2026-11-16** — Migration gate without a second environment (by the owner). Supersedes "a migration the reading flags waits in a second environment" in the 2026-11-16 staging-credentials row and the build workflow's own environment: GitHub has two environments, `staging` and `production`, and the Expo token is `staging`'s. A promotion started by a merge migrates staging by itself only when every pending migration is one the reading passes and the rehearsal verified. One that is destructive, unsafe or unverified stops the promotion before staging changes; it then runs only on a dispatch of the same workflow by the repository's owner naming the last migration it authorizes, which the workflow holds to the pending set exactly. Nothing here authorizes such a migration in advance. The backlog standing on 2026-11-16, `0040` to `0049`, is behind that same gate whatever the reading says: rehearsed, its results and risks put to the owner, and migrated only on the owner's dispatch. A session never makes that dispatch. After the automated checks the owner tests staging before authorizing any release — Supersedes: One environment fewer to keep; the dispatch is a separate, recorded act of the owner's account, and the workflow refuses it for any other migration
- **2026-11-16** — Staging promotion, as built and not yet run (TASKS P1): no migration. `promote-staging.yml` has three jobs. `database`, from the `staging` environment with a read-only token: the commit is on `main` and `staging-preview` can fast-forward to it; the plan (`packages/db/src/promotion/plan.ts`) from both databases' applied hashes against the journal's; the journal replayed on an empty Postgres 18; the pending migrations applied to the rehearsal branch, which must then hold the journal exactly and the replay's schema; staging migrated by the same command when the plan says `automatic` or `authorized`, and held to the same two checks. `deploy`, with a token that may write contents or the owner's deploy key: one ordinary push. `verify`: the host must answer ready and name this commit, then the browser suite runs on it with no bypass and uploads nothing. The reading (`reading.ts`) flags a DROP other than of a default or a NOT NULL, TRUNCATE, DELETE, an UPDATE with no WHERE, REVOKE, a role statement, row security switched off or unforced, an enum value added, NOT NULL added without a default or set, a column's type changed and a rename; it does not read a function's body. `OWNER_GATED_THROUGH` is 49. The schema is compared as sorted catalog lines through `pg` — tables with their row-security flags, columns, constraints, indexes, triggers, the journal's own functions, extensions by name, policies, enum labels, views, the application role's grants and attributes — with no owner in it; nothing is installed on the runner. `/api/ready` also answers `commit`, the platform's variable when it is a full commit id and null otherwise. A withheld migration fails a merge's run and passes a rehearse-only one; the summary names which of three places a failure happened in. Every action is pinned by commit — Supersedes: A run cannot be tried from a branch, since the environment admits `main` alone: its first run is its acceptance. `pg_dump` text would differ by owner and by client version; the catalog does not
- **2026-11-16** — Development and staging share one database (by the owner). The application run in development — the office app on the owner's Mac through its wrapper, a phone build pointed at it or at the staging host — reads and writes the same Neon branch the staging deployment does, as `trader_app`, with Clerk's development instance; there is no development database on Neon. Tests, the seed, the demo and the local flow suite stay on the compose server and CI's container: they commit fixtures, create and drop databases and need a superuser, and they refuse a set `DATABASE_URL`. So a migration is never tried on the shared database before its merge: the promotion workflow alone migrates it. What is given up: staging no longer holds only what `main` deployed, no fixture state is ever clean, a red browser run may be development's doing, a promotion can wait on a development transaction, and a restore rewinds both. Fixtures are kept apart by tenant: one company each for the browser suite, the phone flows and development by hand, each with Clerk test numbers of its own, so row-level security separates them. Production is a different Neon project, Clerk instance and Vercel project, and never receives this branch's string — Supersedes: The local half of "three environments" (2026-11-14, staging autonomy) for running the application; tests are unchanged
- **2026-11-16** — Promotion safeguards, as built (TASKS P1; by the owner's decisions of this date): no migration. **Approval binding** — the owner's dispatch carries a code, not a tag: the last pending migration's tag and twenty hex digits of a SHA-256 over the commit and every pending migration's tag and content hash (`approvalCode`, `promotion/plan.ts`). A run prints the commit, each pending tag with its content hash, and, only once the rehearsal branch is verified, the code. A dispatch with any other code is `authorization_mismatch` — another commit, an edited file, a longer or shorter pending set, the tag alone — and an authorized run whose rehearsal branch does not already hold the journal is `authorization_without_rehearsal`: it never rehearses and migrates in one run. The automatic path of the migration-gate row is unchanged. **Endpoint pins** — each migrator string is held to a Neon endpoint id stated beside it in the `staging` environment (`STAGING_ENDPOINT_ID`, `REHEARSAL_ENDPOINT_ID`): another endpoint, a pooled host, an unreadable string, or one id stated twice stops the run before any connection (`promotion/endpoints.ts`), named by a token and never by a host. **Migrate purpose** — every `drizzle-kit` command refuses a set `DATABASE_URL` unless `TRADER_MIGRATE_PURPOSE` is `promotion` or `owner` (`assertMigrationPurpose`); the local database needs none. **Development identity** — refused, and its sign-in route a 404, whenever `DATABASE_URL` is set: a `dev:` sign-in would bind a shared roster row for good. Staging's host is read from the environment's secret `STAGING_URL`, so it is masked in the public log — Supersedes: "names the last pending migration" in the migration-gate and as-built rows of this date; `STAGING_URL` as a variable
- **2026-11-16** — Staging sign-in by ticket (by the owner; built, seen on staging's alias). On a Clerk development instance every fictional number signs in with one fixed code (Clerk's page, read this date), the browser suite's numbers are in this public repository and staging's host is public: the code is no protection and hiding the numbers would be none. The suite signs in instead with Clerk sign-in tokens — `POST /v1/sign_in_tokens`, one named user, one use, ten minutes — handed to Clerk's own script by the `ticket` strategy (`apps/web/e2e/tickets.ts`, `staging.spec.ts`), so it keeps working with test mode off. The promotion's verify job makes them in one step that holds the development instance's secret key (`CLERK_STAGING_SECRET_KEY`, a secret of the `staging` environment) and runs that one file with `node`, no package beneath it; the browser's step never sees the key, and the tickets are masked. The minter refuses a key that is not a development instance's, a number outside Clerk's fictional range, and anything but exactly one holder. Every promotion also sees a made-up ticket and a spent one refused. Turning test mode off is the owner's, in Clerk; until then the fixed code still works and the suite falls back to it only when given no tickets. The phone app has no ticket path yet: a phone flow on staging needs one before test mode is off for it — Supersedes: "no vendor's account-wide key" in the staging-credentials row of this date, for this one development-instance key

### 2026-11-16 — Staging sign-in read; the phone's Clerk sign-in seen, two faults fixed

- **Did:** read-only, staging as it stands: the owner's custom staging host is attached to
  `staging-preview` and answers with no bypass (`/api/ready` 200, a call with no session
  401, `/dev-signin` 404); it serves `1c94b64`, 49 commits behind `main` (`3abacb2`, #100
  to #116 merged), on a database at 40 migrations of 50. One company, `R3 Staging Co`; an
  admin and a worker, each a fictional Clerk test number, each bound to its Clerk user;
  one fixture customer; no email on either. The branch's `CLERK_AUTHORIZED_PARTIES` was
  last written on 2026-11-14, before the host existed. Clerk's native API is on, with the
  iOS and Android applications registered; `eas whoami` answers and the Expo project
  exists (its id is uncommitted in `apps/mobile/app.json`), with no variable, no build and
  no Apple team. Then branch `r5-phone-token` from `3abacb2`, two commits: on the iOS
  simulator against a throwaway demo database, a sign-in by code through Clerk, the bind,
  `me.get` and `sync.pull` 200 — and 401 once the API's origin list was set, and a false
  "sign in again" on a relaunch. Both fixed (the decision row of this date; `token.ts`),
  each rule watched red, then seen: three relaunches and a clock-in and clock-out stored
  with the list set. 1,575 tests.
- **Decided:** in this line's plan, the row of 2026-11-16 in ARCHITECTURE. Not done:
  nothing on staging was changed. Not seen: the fix on a deployment, Android, a browser
  session under the new proxy (tests only; the staging suite covers it once deployed), a
  sign-out, a relaunch offline, a location on the Clerk run. R5 stays unticked.
- **Release 0.1 state:** `main` at `3abacb2`; this branch's pull request open. To make the
  staging host usable, in order: the database migrated 40 to 50 (the owner-role wrapper
  still has no migrate command); the custom host's origin added to `staging-preview`'s
  `CLERK_AUTHORIZED_PARTIES`; `staging-preview` fast-forwarded and the browser suite run.
  For the phones after that: jobs, a crew and a foreman on staging's roster; the device
  builds' line in TASKS with `eas.json`, the API's address and the publishable key as EAS
  variables; an Apple team on the Expo account and the test iPhone registered.
- **Next:** owner merges this branch and migrates staging; then the three staging steps
  above, and the device builds' line, plan first in its pull request.

### 2026-11-16 — Permanent automation planned; decisions written, P0 done

- **Did:** read, then documents and one staging variable; branch `automation-foundation`
  from `r5-phone-token` (#117, still open), two commits. Read on 2026-11-16: `main` at
  `3abacb2`, `staging-preview` 49 commits behind at `1c94b64`; staging's database and the
  kept rehearsal branch both at 40 migrations of 50, with no labor event and no receipt;
  the staging host attached to `staging-preview`, exempt from the wall, readiness 200;
  GitHub with no secret, variable or environment; Clerk's Android application with no
  fingerprint; the Expo project with no build; no Resend record in DNS. Written: nine
  decision rows of this date, RULES (Git and CI, Toolbox), TASKS' Automation section with
  P0 to P6 and the owner's line, Stage 6's staging-domain decision ticked. Committed: the
  Expo project's id and owner in `app.json`, as `eas init` left them. Set: the staging
  host's origin beside the alias in `staging-preview`'s `CLERK_AUTHORIZED_PARTIES`.
  1,575 tests.
- **Decided:** by the owner on 2026-11-16 (the plan approved, and the decisions pasted
  before it), the rows of that date. Not done: the variable is not deployed — the
  redeploy was refused to the session, so the office on the staging host still checks
  the old list until the first promotion; RULES has no `production` rule yet (the edit
  was refused to the session; it is P6's now); nothing is built — no workflow, no
  environment, no build, no DNS record. Not read: `eas env:list`, the tools' versions,
  the DNS token's Keychain item.
- **Release 0.1 state:** `main` at `3abacb2`; #117 open and green; this branch stacked on
  it. Staging: 40 migrations of 50, serving `1c94b64`. Next to move it is P1's first
  promotion, which needs the owner's `staging` environment and its two secrets.
- **Next:** owner merges #117 and this branch and creates the `staging` environment; then
  P1, the promotion workflow, plan first in its pull request.

### 2026-11-16 — P1's migration gate simplified by the owner; documents only

- **Did:** after the owner merged #117 and #118 (`main` at `2b41dbc`), branch
  `p1-policy-update`, documents only: one decision row and TASKS' P1 and owner lines.
  1,575 tests.
- **Decided:** by the owner on 2026-11-16, the row of that date (migration gate without a
  second environment): two GitHub environments, `staging` and `production`; a merge's
  promotion migrates only what the reading passes and the rehearsal verified; anything
  else, and the whole backlog `0040` to `0049`, waits for the owner's own dispatch
  naming the last migration it authorizes. Worth knowing: a session's `gh` signs in as
  the owner, so the workflow cannot tell the two apart — a session never runs
  `gh workflow run` on the promotion, and a deny rule for it in the owner's settings is
  what makes that more than a promise. Not done: nothing is built; staging is still at
  40 migrations of 50, serving `1c94b64`.
- **Release 0.1 state:** `main` at `2b41dbc`; staging unchanged. P1 needs the owner's
  `staging` environment with its two migrator secrets before its rehearse-only run.
- **Next:** owner merges this branch; then P1, plan first in its pull request, ending at
  the rehearsal's report for the owner.

### 2026-11-16 — Staging promotion built (P1); nothing run, the backlog still withheld

- **Did:** branch `p1-staging-promotion` from `p1-policy-update` (#119, open), six
  commits. `promote-staging.yml`: database, deploy, verify. In `packages/db`:
  `promotion/reading.ts`, `plan.ts`, `journal.ts`, `fingerprint.ts` and
  `run-promotion.ts`. `/api/ready` answers the deployed commit. The browser suite runs on
  the public host with no bypass, and holds the host to an expected commit. Every action
  pinned by commit. The runbook's promotion section. Watched red, by mutation, twelve
  rules: the DROP rule, a function's body read, quoted words read, the owner's gate, the
  flags, any tag authorizing, the owner not required, a rehearsal migrating, the journal
  prefix, a rehearsal behind staging, any string as a commit, the gate's number. The
  reading over the whole journal flags eight of fifty; of the backlog, `0040` (a dropped
  unique constraint, replaced by the exact-shift key), `0041` (REVOKE of the
  application's UPDATE on `companies`, then column grants) and `0042` (an enum value
  added). 1,623 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-16. Changed from the
  plan: the schema is compared through the catalog, not `pg_dump`, so no client is
  installed; the deployment is awaited by asking the host which commit it serves, not
  through GitHub's deployment records; a deploy key is used for the push when the owner
  has made one, since the job's own token may not move a branch across a workflow
  file's change; the suite's public-host mode came forward from P2. Not done, and why P1
  is not ticked: **the workflow has never run.** Unseen: the environment's secrets
  reaching it, the rehearsal branch accepting the owner's direct connection, the
  catalog lines equal between Neon and a replay, the push starting Vercel's build, the
  host naming a commit, the suite on the public host. Not built: the readiness artifact,
  the commit status and the issue (P2); a check that no workflow names production.
- **Release 0.1 state:** `main` at `2b41dbc`; #119 and this branch open, stacked.
  Staging: 40 migrations of 50, serving `1c94b64`, its origin list updated and not yet
  deployed. Order from here: the owner merges both and makes the `staging` environment;
  a rehearse-only dispatch; its report read; then the owner's own dispatch,
  `mode=promote`, `authorize_through=0049_invoice-send-guards`. A session makes neither
  the second dispatch nor any dispatch that names a migration.
- **Next:** the rehearse-only run and its report to the owner; then P2.

### 2026-11-16 — Staging mail's DNS and variables; promotion safeguards built, nothing run

- **Did:** P3, outside the repository: the DNS wrapper (`list`, `plan`, `apply`; four fixed
  records, no name taken, watched refusing one), installed by the owner; the four Resend
  records created under the staging mail subdomain and read back on four resolvers, the
  apex's records untouched; the domain verified by the owner; `MAIL_FROM` and
  `INVOICE_EMAIL_ALLOWLIST` (one address, the owner's) on staging's Preview beside the
  owner's `RESEND_API_KEY`. Read: the allow-list is already the whole of who staging can
  mail, and the request carries one recipient and no other recipient field. Then branch
  `p1-safeguards` from `900dadc`: the approval code, the endpoint pins, the migrate
  purpose, the development identity refused on a deployed database, `STAGING_URL` read as
  a secret; two decision rows, RULES' environments, the runbook. Watched red: thirteen
  mutations, each against a green baseline.
- **Decided:** by the owner on 2026-11-16, the two rows of that date (shared database;
  promotion safeguards). Not done: **nothing has run.** The promotion after #120 failed
  at its plan step before the environment's secrets existed; no rehearsal, no migration,
  no email. The fixture tenants' companies are not onboarded (TASKS); the browser flow's
  tenant guard is built and was seen on staging's alias, green with the suite's company
  id and red on a wrong one before any write. Worth knowing: on a Clerk development
  instance every fictional number signs in with the one test code (read on Clerk's page),
  the suite's defaults in `staging.spec.ts` are staging's fixture accounts, and the host
  is public: anyone could sign in as staging's admin. Today they cannot — the deployed
  commit still checks the old origin list, so every session on the public host is a 401
  (seen) — and the first promotion opens it. Built for it, with the owner's key in the
  `staging` environment: the suite signs in by single-use Clerk tickets (the row of this
  date), seen on staging's alias with tickets made through the Clerk CLI — five steps
  green, a made-up ticket and a spent one refused; ten more mutations watched red. Not
  seen: the workflow's own ticket step, which first runs in the promotion. Test mode is
  still on and is the owner's to turn off; the phone app has no ticket path.
- **Release 0.1 state:** `main` at `900dadc`; staging at 40 migrations of 50, serving
  `1c94b64`. Order from here: the owner sets the two endpoint ids and merges this branch;
  the merge's own run rehearses and prints the code; the owner dispatches `promote` with
  it; then one invoice email to the allow-listed address.
- **Next:** the rehearsal's report to the owner; after the promotion, P3's send.

## 2026-11-17

- **2026-11-17** — `main` worked autonomously; production the owner's (by the owner). A session develops, commits, pushes and merges into `main` through its pull request and the required `check`, manages development branches and staging's automation, runs staging's workflows and changes them, without asking for each routine merge; signed commits, the tests and the migration gate stand as they were. The one-time approval of the backlog `0040` to `0049` stays the owner's own dispatch, as does every approval code after it. Production is the owner's alone: the `production` branch, its deployments and releases, its credentials, databases, infrastructure and environment configuration, its authorization and rollback; a session creates no production infrastructure, secret or deployment. Supersedes "merged by the owner alone" in the 2026-11-16 repository row and "the merge is Juan Pablo's" in RULES. The target stays two permanent branches, `main` and `production`; `staging-preview` is transitional until TASKS O3 removes it. **Not enforced:** a session holds the owner's own GitHub credentials (a CLI token with repository and workflow scope, an account SSH key), so the production boundary is a policy a session follows and nothing GitHub refuses. Before the first production deployment a separate identity — a GitHub App or its equal — keeps full access to `main` and has none to administer the repository or to change `production`, its environment or its secrets — Supersedes: The owner accepts the shared-credential risk for now to keep development moving without a person at every merge; production is where a mistake costs a customer, so it keeps a person and, before it is first used, a boundary GitHub itself holds
- **2026-11-17** — Toolbox, shared rules and the audit (by the owner, in the overhaul's mandate and its plan). A session's deny and ask rules that hold on any machine are committed as `.claude/settings.json`: no merge, no push to `main` or `production`, no `gh workflow run`, no secret or variable set at GitHub, no vendor's production or account-wide command, no Keychain item named on a command line; Clerk's connector may read, asks before it changes the development instance, and can never create an application or a production instance. Three project skills sit beside it. Cloudflare: its documentation connector, which takes no credential, and a read-only `inspect` in the DNS wrapper on a token of its own that can read the zone and nothing else; writes stay the four pinned records (2026-11-16, staging mail and DNS). Cloudflare's API connector is not connected: a token cannot be narrowed below the zone, and the zone carries production. A workflow beside CI, `Audit`, holds no secret: `pnpm audit`, red on a high advisory in what is deployed and on a critical one in the toolchain, and gitleaks over the whole history, fetched by version and checked against its published sha256. Two transitive packages are held at patched releases by override. Not adopted: PostHog (after the release, as PRD has it), hosted device runs and the Mac polling runner (decided at the release gate), Lighthouse, a component catalog, visual regression.
- **2026-11-17** — The DNS wrapper's `inspect` on the one token (by the owner; installed and seen). Supersedes "on a token of its own that can read the zone and nothing else" in the toolbox row of this date: the owner keeps one Cloudflare token, with DNS read and edit on the `jpteq.app` zone, in one Keychain item, and the wrapper's four commands share it. `list`, `plan` and `apply` are unchanged — four fixed staging mail records, no name or value taken, created when absent, rewritten only when the wrapper made them, never deleted. `inspect [NAME]` prints every record of the zone, or those at a name of the zone and under it beside what two public resolvers answer; under `inspect` the wrapper's one request function refuses any method but GET, and a name outside the zone or not a host name is refused before the token is read for anything. What keeps `inspect` from writing is therefore the wrapper, not the token: the token can edit any record of the zone, production's future names included, and a session never reads the Keychain item itself — Supersedes: A second read-only token was one more credential to make and rotate for a reading the wrapper already performs before every write; Cloudflare cannot narrow a token below the zone either way, so the boundary was always the wrapper
- **2026-11-17** — Two branches and a release by pull request (by the owner; staging's half built, its first run still to be seen — TASKS O3; production not created). Supersedes the rows of 2026-11-14 (staging has a permanent branch), 2026-11-15 (integration branch `release-0.1`), 2026-11-16 (the public staging host serves `staging-preview`), of the staging promotion rows of 2026-11-16 the fast-forward, the deploy key and the push, and of 2026-11-17 (`main` worked autonomously) the agent's merge and the isolated identity. **Branches.** `main` is development, integration and staging's source; `production` is the owner's release branch; every other branch is temporary. **Environments.** Two, sharing nothing: staging (the staging Vercel project, the staging Neon database, Clerk's development instance with test mode off, staging-only credentials) and production (a separate Vercel project tracking `production`, a separate Neon database, a Clerk production instance, its own credentials and domain). GitHub has the environments `staging` and, when the owner makes it, `production`, and no other. **One human gate to staging: the owner's merge into `main`.** A session opens pull requests and merges none. After a merge the promotion migrates as before, then its `deploy` job calls the staging project's deploy hook — a secret of the `staging` environment, held to Vercel's own address before use and never printed — which builds `main`'s head as that project's Production deployment. A hook takes no commit: the job calls it only while `main`'s head is the run's commit, and deploys nothing when `main` has moved on, leaving that to the newer commit's run. `verify` waits for the host to name the run's commit before the suite starts and fails otherwise; `report` writes each run's outcome as the commit's `staging` status. The deploying job has no checkout and no token; the workflow pushes nothing; nobody dispatches it. Vercel builds nothing from a push to `main` in either project (`apps/web/vercel.json`), so the production project can build `production` alone. **"Production" twice.** The staging project's Production deployment is staging: Vercel's `VERCEL_ENV` says `production` there, so no rule reads it. Each deployment states `TRADER_ENVIRONMENT`, `staging` or `production`, and refuses to start without it; the invoice allow-list is lifted only by `production`, and an error report is named by it. **Release.** A pull request into `production` from a short-lived branch cut at one commit of `main` whose `check` passed and whose `staging` status is `success`; `main` moving on never changes a candidate. A session may prepare it and its evidence; the merge, production's migrations, credentials, infrastructure and first release are the owner's, each separately authorized. **Migrations.** Schema first, then code; a change that cannot overlap is expanded, moved and contracted over three merges. **Not enforced by GitHub.** A session works with the owner's credentials; the owner accepts that and has decided against a separate identity. Production is kept apart by RULES and the session's deny rules, and no document may claim more. One advisory is excepted from the audit by name, with its reason beside it (`pnpm-workspace.yaml`): it has no fixed release and reaches only the phone app's build tooling. Not closed: a merge landing between the head's reading and the hook's call builds the newer commit before its migration; that run stays red and the next one migrates and verifies — Supersedes: Native Git builds start when `main` moves, minutes before the migration and indefinitely before a withheld one, so the deployment is ordered by the workflow; a hook reaches one project and one branch where a Vercel token reaches the account, production included. Tracking `main` as the staging project's Production branch is Vercel's ordinary shape and needs no branch that exists only to be mirrored. A release as a pull request puts the owner's decision, the exact commit and its evidence in one reviewable place. Vercel's pages do not say whether `git.deploymentEnabled` also stops a hook (they say so only of the deprecated `github.enabled`): the first run holds it, failing at `verify` with staging's code unchanged if it does
- **2026-11-17** — A session merges into `main`; `production` stays the owner's (by the owner, in the session that restored the 2026-11-17 row `main` worked autonomously, which merge `23a5001` had dropped). Supersedes, in the two-branches row of this date, "One human gate to staging: the owner's merge into `main`" and "A session opens pull requests and merges none"; the rest of that row stands: two permanent branches, staging deployed from `main` by the deploy hook, a release as a pull request into `production`, no separate GitHub identity. A session merges its own pull request into `main` with `gh pr merge --merge --delete-branch` once the required `check` is green on the newest commit; the merge starts staging's promotion as any merge does. It merges nothing into `production`, sends no approval code and dispatches no workflow. The committed settings no longer deny `gh pr merge`. **Not enforced:** a permission rule sees the command and not the pull request's base branch, so "never into `production`" is a rule a session follows until a GitHub ruleset on `production` or a hook that reads the base refuses it; neither exists — Supersedes: The owner wants development to move without a person at every merge into `main`, where `check`, the migration gate and staging's suite stand between a change and anything a customer sees; `production` is where a mistake costs a customer, so its merge keeps a person
- **2026-11-17** — One append-only log (by the owner; TASKS O9). `docs/LOG.md` holds every session's entry, every decision as one bullet under its day and every ticked task; ARCHITECTURE keeps no decisions table, MEMORY no Log and TASKS no ticked line. Nothing in the log is edited or removed: Git merges it by union in a local merge, GitHub does not, and `check` fails when a line of `main`'s log is missing, changed or out of order or a day's heading repeats; the one line that may go is a heading of `main`'s log that repeats an earlier one. A day's heading is the local date of the machine the session runs on. A decision row became a bullet with its cells verbatim. Dated cites of ARCHITECTURE were rewritten to LOG in RULES, TASKS and MEMORY alone: those in code, workflows and `pnpm-workspace.yaml` stand until O12, those in applied migrations for good, and all are read here. Of the 237 rows moved, 96 are stated by no line of PRD, ARCHITECTURE, RULES or DESIGN, 74 of them in force: until O9b the log is their only statement — Supersedes: RULES, Authority 2, "adding a row to the decisions table in ARCHITECTURE.md"; MEMORY, "a month of Log is rolled into one dated paragraph"; the document set of six
- **2026-11-17** — The decision rows written into their homes (by the owner; TASKS O9b, not done). ARCHITECTURE's pointer paragraph now reads: the log says when each rule was settled and what it replaced; the rule itself is stated in ARCHITECTURE, PRD, RULES or DESIGN; a rule only the log states is a defect. Of the rows in force with no home or a partial one, each sentence was checked against the code first: those the code bears out were written; those it contradicts were not written and not reworded, and their rows are still stated by this log alone — lines 52, 57, 76, 80, 81, 90, 91, 93, 97, 103, 105, 128, 134, 145, 156, 240, 320, 1181, 1182, 1184 and 1756 whole, and 61, 68, 118, 127, 132, 152, 345, 1172, 1185 and 1760 for one sentence each. Standings: the 2026-10-13 six-doc set is superseded by 2026-11-17 one append-only log; 2026-11-04 'a closeout records server state at submission' by 2026-11-04 review fingerprint `v1.`; the 2026-11-11 readiness revision and decision register are spent; 2026-11-16 native tests by polling is deferred by the 2026-11-17 toolbox row to the release gate; the mechanism of 2026-11-16 `production` and the release gate is superseded by 2026-11-17 two branches, and its list is TASKS P6's. Brought up to rows already in force: PRD's access paragraph (2026-11-12 a sign-in number on every new invitation) and its seventh approval condition (2026-11-15 clock-in eligibility), the day lock at 8 in the lock order, the database runbook's cites — Supersedes: ARCHITECTURE, Decisions, 'Until TASKS line O9b is done, the log is the only statement of the rules in force that the body above does not state'

### 2026-11-17 — Overhaul planned and approved; reliability batch (O2)

- **Did:** read-only ground truth at `9108276` (three investigations: the pipeline, the
  product and code, the toolbox), then the plan, approved. Read: promotion run
  44009174126 rehearsed `0040`–`0049` cleanly and stopped at the owner's gate; staging at
  40 of 50, its host 73 commits behind and naming no commit; the `staging` environment
  holds no `E2E_*` variable, so the suite's tenant guard is idle in CI; Clerk's connector
  shows no test-mode setting, so that switch is the dashboard's. Branch
  `overhaul-reliability`: the roster cycle broken by `roster/current-rates.ts`;
  `material.create` with no conflict target (the racing test 1 red in 30 before, 30 green
  after); the cost test's fixture stamped in the past; the queue and the pull reading
  `receiptStandings`; the browser's id minter at `app/uuidv7.ts`; 31 unused strings gone;
  not-found to the Overview; the README. No migration, no dependency.
- **Decided:** by the owner on 2026-11-17 (the mandate and four answers): the backlog is
  applied first, before any merge; staging deploys from `main` by Vercel's deploy hook, a
  secret of the `staging` environment; the phone keeps the PRD's phasing; Cloudflare gets
  its documentation connector and a read-only token, writes staying on the pinned wrapper.
  Their decision rows come with the batches that enact them (TASKS, Overhaul). Not done:
  the other conflict targets are unaudited (Notes); `@types/pg` stays a dependency of
  `packages/db`, whose exported types need it. For the owner: DESIGN's "Scheduled shift
  (crew)" row still reads "To be built (TASKS S7)" though S7 is ticked.
- **Next:** the owner's three steps of O0; O1's branch; neither branch merges before O0.

### 2026-11-17 — Toolbox batch (O1): built; the machine's half waits for the owner

- **Did:** branch `overhaul-toolbox`, stacked on `overhaul-reliability` (#122).
  `.claude/settings.json` and three skills (`pr-prep`, `staging-status`, `ui-check`);
  `.claude/settings.local.json` ignored; `audit.yml` beside CI; overrides for
  `source-map-js` and `vite` (both published more than a day before), after which
  `pnpm audit` reads 5 moderate, none high. RULES (Toolbox), the decision row. Watched
  refusing: Clerk's five denied tools left the session the moment the file existed; the
  new `staging-dns` draft refused a name with a metacharacter, a name outside the zone and
  an argument to `plan`, and its write path is byte-identical to the installed one. Read
  for the owner's steps: staging's fixture company, its admin and worker both bound, on
  the suite's default numbers.
- **Decided:** the row of 2026-11-17 (toolbox, shared rules and the audit). Not done, each
  the owner's to install since a session may not write there: the new `staging-dns`, the
  `trader-cloudflare-dns-read` Keychain item, Cloudflare's documentation connector, the
  Playwright connector's version pin, `eas-cli`'s upgrade. Not seen: `inspect` answering
  (no token yet); gitleaks over this history (first run is the pull request's); the audit
  on a schedule. Vercel's and Sentry's connectors still read every project the account
  can: a rule cannot narrow a tool's arguments, so "staging only" there is a session's
  discipline, stated in RULES, not a guarantee.
- **Next:** O0's three owner steps; then both pull requests merge and O3 starts.

### 2026-11-17 — Gate #3 read; the browser suite made to refuse a run it was not told

- **Did:** read-only, twice: the promotion's sign-in path (the key in the `staging`
  environment alone, tickets by `POST /v1/sign_in_tokens` and the `ticket` strategy, no
  trace or artifact), and staging itself — one company, `R3 Staging Co`, its admin and
  worker on the suite's two fictional numbers, each bound, one customer, nothing else; 40
  migrations, equal by hash to the journal's first forty; the rehearsal branch at 50.
  Found: the three `E2E_*` values had been made as secrets where the workflow reads
  variables, so they arrived blank; the owner made them variables. Then branch
  `e2e-fail-closed` from `9108276`: the defaults removed, `missingSettings` in
  `tickets.ts`, the ticket step and the spec both refusing. Watched red: the spec's
  refusal, the ticket step's, a blank counted as set, a name dropped from the list — the
  last turned nothing red until the list was pinned by name.
- **Decided:** by the owner on 2026-11-17: no default for the suite's company or its two
  people. Not done: no workflow change, so with the company alone unset the two tickets
  are still made before the suite refuses, and expire unused; the fallback to Clerk's
  test code when no ticket is given is kept. Not seen: the refusal in the workflow, and
  the verify job at all, which has never run. The `staging-e2e` wrapper passes none of
  the three, so a session's own run refuses until it does: the owner's file.
- **Release 0.1 state:** `main` at `9108276`; staging at 40 of 50, serving `1c94b64`. This
  branch's merge starts a promotion that verifies the rehearsal and stops at the owner's
  gate, red by design, with nothing migrated; its report prints the code for the new
  commit, and a code printed for `9108276` no longer holds.
- **Next:** owner merges this branch, reads that run's report and dispatches `promote`
  with its code; then the verify job's first log.

### 2026-11-17 — #124 merged; the gate held; `main` made a session's to merge

- **Did:** read-only after the owner merged #124 (`main` at `f5e31aa`): CI green; the
  merge's promotion verified the rehearsal branch (50 of 50, schema equal to a replay) and
  stopped at the owner's gate with `deploy` and `verify` skipped; staging still at 40 by
  hash, `staging-preview` still `1c94b64`; the run's approval code recomputed from the
  files and equal. Read for the owner: every way a session reaches the owner's GitHub
  credentials (the CLI's token with repository and workflow scope, the account SSH key,
  the Keychain helper, a signed-in browser), and that a collaborator's fine-grained token
  cannot work on a personal repository (GitHub's page, this date), so an isolated identity
  here is a GitHub App. Then branch `main-autonomy-policy`, documents only: RULES (Git and
  CI, Session protocol), `CLAUDE.md`, one decision row, one TASKS line.
- **Decided:** by the owner on 2026-11-17, the row of that date: a session merges into
  `main` through its pull request and `check`; production is the owner's alone, by policy
  and not yet by permission; the backlog's approval stays the owner's dispatch. Not
  changed, and asked of the owner: whether "plan, stop, wait" for schema, auth, sync,
  money and CI still waits. Not done: nothing merged by a session yet — the local deny
  rule stands, and a merge now would kill the code the owner holds; #123's committed
  settings still list a merge and a dispatch as never run and need this policy before
  they merge.
- **Release 0.1 state:** `main` at `f5e31aa`; staging at 40 of 50, serving `1c94b64`; the
  approval code for this commit is in run 44037693363's report. Open: #122, #123 and this
  branch, none to merge before the backlog is applied.
- **Next:** the owner's dispatch, `promote` with that code; then the verify job's first
  log, and these three pull requests merged in order.

### 2026-11-17 — First promotion: staging at the journal and deployed; the suite's first test faulty

- **Did:** read after the owner's authorized dispatch (run 44046566988, `main` at
  `5c2cc12`): `database` and `deploy` green, staging at 50 of 50 by hash, `staging-preview`
  and the staging host at `5c2cc12`, readiness 200, a call with no session 401, the
  development sign-in 404. `verify` red at the suite's first test, the other four not
  run: on the public host with an expected commit — a path no run had taken — it read the
  readiness body after disposing the request context. The ticket step made two tickets;
  the log holds neither a ticket nor a key. Branch `e2e-readiness-read`: `askReadiness`
  (`e2e/readiness.ts`) reads the body before the context goes, the spec uses it, and a
  test asks it with Playwright's own context of a local server. Watched red: the original
  fault ("Response has been disposed"), a followed redirect, a commit taken from any 200.
  Seen on the staging host, the first test alone: green on `5c2cc12`, red on another
  commit.
- **Decided:** nothing. Not done: the four signed-in tests have still never run in the
  workflow — tenant check, forged ticket, spent ticket, the worker's refusal; O0 is not
  ticked.
- **Release 0.1 state:** `main` at `5c2cc12`; staging at 50 of 50 and serving it; nothing
  pending, so this branch's merge starts a promotion that migrates nothing, deploys the
  merge and runs all five tests with fresh tickets.
- **Next:** merge this branch on a green `check`; read that promotion's verify log; then
  O0's tick and O3.

### 2026-11-17 — Staging promoted end to end; all five browser tests green; O0 ticked

- **Did:** read after the owner merged #126 (`main` at `0eec8b9`): CI green; promotion
  44049053024 green in all three jobs with nothing pending and nothing migrated;
  `staging-preview` and the staging host at `0eec8b9`; staging at 50 of 50. The verify job
  made two tickets and ran five tests green in 16.6 s: readiness and the commit, a
  made-up ticket refused, the admin held to `E2E_COMPANY_ID` and rewriting the fixture
  customer, the spent ticket refused, the worker refused the office. The log holds no
  ticket and no key; no artifact exists. Read back from the database: one company, two
  users, one customer, its notes carrying the run's stamp. Branch `o0-record`, documents
  only: O0 ticked.
- **Decided:** nothing new. Not done: the committed `.claude/settings.json` and the
  owner's local file both still deny `gh pr merge` and every `gh workflow run`, against
  the 2026-11-17 policy in RULES; a session's edit of its own rules was refused, rightly,
  so the change is the owner's to make. No session has merged yet. P1 is not ticked: a
  run for a commit already promoted, a merge carrying a flagged migration and a dispatch
  with a wrong code are each unseen. Clerk's test mode being off rests on the owner's
  word.
- **Release 0.1 state:** `main` at `0eec8b9`, staging serving it at the journal, the
  suite green. Still on GitHub: `overhaul-reliability` and `release-0.1`, each deletion
  the owner's.
- **Next:** O3, staging from `main` by the deploy hook (plan first: CI); it needs the
  owner's deploy hook as a secret of the `staging` environment.

### 2026-11-17 — The DNS wrapper's `inspect` installed; the zone read whole

- **Did:** on the owner's instruction, `~/.config/trader/staging-dns` extended with
  `inspect [NAME]`, the earlier file kept beside it; its write path is the installed one
  unchanged (four lines of argument handling differ). Seen: `inspect` listing the zone's
  ten records and the staging host's CNAME with both resolvers' answers; `list` and
  `plan` as before, all four records "ok"; `apply` not run. Watched refusing: a name
  outside the zone, a name that is not a host name, a second name, an argument to `list`
  and to `plan`, an unknown command; and, with the wrapper's request function run alone
  against a stand-in for `curl`, every method but GET under `inspect`. The zone read
  the same before and after. Branch `dns-inspect-docs`, documents only: RULES' Toolbox
  line, one decision row, a Note.
- **Decided:** by the owner on 2026-11-17, the row of that date: one token, no read-only
  second one. Not done: whether the Keychain item named "TRADER Cloudflare DNS
  Automation" holds the same token as `trader-cloudflare-dns-token` — a session does not
  read the Keychain, so the comparison is the owner's one command; the committed
  settings still deny a `trader-cloudflare-dns-read` item that no longer exists. No DNS
  record was written.
- **Release 0.1 state:** unchanged: `main` at `0eec8b9`, staging serving it at 50 of 50,
  the suite green; #127 open, this branch stacked on it.
- **Next:** O3, staging from `main` by the deploy hook (plan first: CI).

### 2026-11-17 — Staging from `main` (O3) and the final two-branch workflow: built, not yet run

- **Did:** read first, on the owner's report: #122 and #123 merged, `main` at `0eec8b9`
  with `check` green, staging at 50 of 50 and its host naming that commit, the three
  `E2E_*` variables set, both numbers already in E.164 with their `+`. Branch
  `o3-staging-from-main`, stacked on #128 (#129). `promote-staging.yml`: no
  `staging-preview` anywhere; `deploy` calls the staging project's deploy hook with no
  checkout and no token, only while `main`'s head is the run's commit; `verify` holds
  the host to the commit before the suite; a `report` job writes the `staging` status.
  `apps/web/vercel.json` stops a push to `main` building. `TRADER_ENVIRONMENT`
  (`environment.ts`): required at start, the only thing that lifts the mail allow-list,
  the name on an error report. The audit's one exception, by name. Watched red: the
  workflow's four text tests against the old file; seven tests of the environment before
  its code. The deploy and report steps run by hand against stand-ins for `curl`, `git`
  and `gh`, fourteen cases. RULES, `CLAUDE.md`, the README, the runbook (the staging
  project's settings, expand and contract, releasing to production and its setup order),
  one decision row, TASKS.
- **Decided:** by the owner on 2026-11-17, the row of that date (two branches and a
  release by pull request): the staging project keeps `main` as its Production branch;
  the owner merges every pull request; no separate GitHub identity; a release is a pull
  request into `production`. In the plan: the hook stays, since a native build starts
  before the migration; a superseded run is green with a `pending` status. A first
  version of this batch made staging a Preview with the project's Production branch
  moved off `main`; the owner corrected it before it merged. Not done: **nothing has
  run.** The workflow cannot be tried from a branch and the hook does not exist yet.
  Unseen until the first merge: the hook building `main` with `git.deploymentEnabled`
  off, that build being the project's Production deployment, the host moving to it, the
  status written, a deployment starting with `TRADER_ENVIRONMENT`. Not built: the
  `release` check (P6); nothing of production exists. O3 is not ticked. Notes about
  `staging-preview` stand until the cutover is seen.
- **Release 0.1 state:** `main` at `0eec8b9`, staging serving it at 50 of 50. Before #129
  merges, the owner's, on the staging project (the runbook's list): every variable for
  Production as well, `CLERK_AUTHORIZED_PARTIES` and `TRADER_ENVIRONMENT=staging` added,
  the ignored build step removed, one deploy hook for `main` stored as
  `STAGING_DEPLOY_HOOK`, the staging host made the Production domain. Merge #129 alone:
  it carries #127 and #128.
- **Next:** the first promotion after the merge, read end to end; a second merge unaided;
  then O3's tick, the `release` check, and the branch deletions on the owner's word. O4
  only after.

### 2026-11-17 — Restore and reconcile (O8): the dropped row and entries back; a session merges into `main`

- **Did:** from the audit taken at `0eec8b9`, read at `82b33b9`. Branch
  `o8-restore-reconcile`, five commits, documents and settings only. Restored, each equal
  byte for byte to `c5a1cae`: ARCHITECTURE's row "`main` worked autonomously", and the Log
  entries "Gate #3 read" and "#124 merged". Counted: of the lines `main` had added since
  the merge base, `23a5001` lost that one row and those 48 lines and nothing else; every
  other removal in that merge was a commit of the branch. One answer to who merges, in
  RULES (Git and CI, Toolbox, Session protocol), `CLAUDE.md`, the README, TASKS, the
  database runbook, `pr-prep` and the committed settings, which no longer deny
  `gh pr merge`. TASKS lines O8 to O13. Watched: `gh pr merge --help` refused before the
  change.
- **Decided:** by the owner on 2026-11-17, the row of that date (a session merges into
  `main`; `production` stays the owner's), which supersedes the owner's merge in the
  two-branches row written the same day. Not done: the owner's local settings file still
  denies `gh pr merge`, so no session can merge until the owner removes that line, and
  this pull request is the owner's to merge; nothing refuses a merge into `production`
  but the rule (Notes); "Isolated identity before production" is not brought back; of the
  audit's decisions only D1 and D9 are recorded — D2 to D8 are each its batch's plan.
- **Release 0.1 state:** `main` at `82b33b9`. O3's first promotion is still unread in
  this file: this session did not look at staging.
- **Next:** owner merges this branch and lifts the local deny; then O3's first promotion
  read end to end, and O9, plan first.

### Ticked in TASKS, moved 2026-11-17

#### Overhaul — toolbox, cleanup, staging from `main`

- [x] O0 — The migration backlog `0040` to `0049` applied by the owner's dispatch before
      anything else merges, with Clerk's test mode off and the suite's three `E2E_*`
      variables set first. Done when staging is at the journal, the host names `main`'s
      commit and the browser suite is green there
- [x] O2 — Reliability and cleanup: the two flaky material tests, the roster import cycle,
      one receipt-standing read, the retired screen's strings, the README. Done when
      `pnpm check` is green five times running
- [x] O8 — Restore and reconcile: the decision row and the two log entries that merge
      `23a5001` dropped, back byte-identical; one answer to who merges into `main` in
      RULES, `CLAUDE.md`, the README, the committed settings and `pr-prep`. Done when a
      byte comparison with `c5a1cae` is empty and no file gives a different answer

#### Release 0.1 — first production release

- [x] R0 — Documents: the Release 0.1 decision rows, PRD Access, Invoicing and the release
      definitions, this track. Documents only
- [x] R1 — Phone identity (plan first: schema, auth). Work: the identity adapter carries a
      verified phone number or a verified email; `roster.invite` takes a phone number, an
      email, or both; first sign-in binds on either; an additive migration for the binding
      key; the roster screen. Tests: a phone invitation binds once and only to its number;
      one number invited by two companies binds neither; an email invitation binds as
      today; a caller with neither is UNAUTHORIZED; `me.update` cannot change a number that
      is a binding key; every existing identity test green
- [x] R2 — Clerk behind the identity seam (plan first: auth; takes Stage 6's Clerk line).
      Depends on R1 and the owner's Clerk application. Work: the Clerk adapter for the
      route handler, office sign-in and sign-out, an invitation sent on `roster.invite`,
      the development adapter absent from a production build. Installs `@clerk/nextjs`,
      consumed by `apps/web`: the adapter, the proxy, the provider and the sign-in page.
      Tests: a request with no
      session is 401; a session whose number or email matches no invitation is refused
      and binds nothing; the development route answers 404 in a production build
- [x] R3 — Production path on staging (plan first: CI, auth; takes Stage 6's Neon owner-role
      **decide**, Neon, Environments and Sentry lines, and the security headers of its edge
      line). Work: the owner role's attributes read on Neon and decided; `trader_app` as
      the login role over the pooled endpoint, migrations over the direct one; the
      environment validated at start; a readiness check that touches the database and
      asserts the role; an owner-run onboarding script for a company, its invoice counter
      and its first admin; a content security policy and transport security; the Sentry
      reporter behind `ErrorReporter`; the migration procedure in `packages/db/README.md`;
      the restore window read and recorded. Installs `@sentry/nextjs`, consumed by
      `apps/web`: the reporter and the start-up hook. Done when the office runs on the staging
      deployment as `trader_app`, a forced error reaches Sentry with no PII, and a
      point-in-time restore of staging has been timed
- [x] Toolbox (documents only; plan first). A "Toolbox" section in RULES with its row in the
      home table, and the lines in `CLAUDE.md` that point to it: how a session discovers its
      tools, which tool is preferred for which job, what a vendor tool may read and may
      never write, how a tool is upgraded, and how one is verified before it is relied on.
      Consumer: every session that reads the deployed stack. No new document
- [x] Staging operator access (plan first: it changes what a session can do). The staging
      owner's connection string in the macOS Keychain, used through two wrappers kept
      outside the repository — one runs `onboard` and `psql` against staging as the owner,
      one makes and deletes test users on Clerk's development instance — and the Vercel
      CLI, for `vercel redeploy` of a Preview alone; every use is prompted. Consumer: R3's
      staging acceptance, then the checks of R9 and R10. Production has none of it. Done
      when a denied command is refused, a prompted one runs against staging, and the
      runbook and a decision row state the rule
- [x] Staging project (plan first: it changes what a session can do; by the owner,
      2026-11-14). Staging moves from branch previews of the one Vercel project to a
      project of its own, previews only. Work: a wrapper outside the repository pinned to
      that project's ids, for Preview deployments, their logs and their non-secret
      variables; the browser-suite wrapper takes the URL Vercel reports; the unpinned
      Vercel rules removed; the decision row and RULES, Toolbox. Consumer: R3's
      acceptance, then the staging checks of R4 to R10. Done when a Preview of that
      project is deployed and READY, a Production or other-project command is refused,
      and the browser suite's five steps pass on it
- [x] Permanent staging branch (by the owner, 2026-11-14). `staging-preview` is made from
      merged `main` and kept: it holds only commits of `main` and moves by an ordinary
      fast-forward push after each owner merge (RULES, Git and CI). Work: the branch; its
      Preview on the staging project; the alias read from Vercel and named by a
      branch-scoped `CLERK_AUTHORIZED_PARTIES`; the decision row, RULES. Consumer: the
      staging checks of R4 to R10, which need an origin that outlives a feature branch.
      Done when the browser suite's five steps pass on that alias, pass again after a
      redeploy, and pass again after a fast-forward to a newly merged `main`, each run
      recorded in MEMORY
- [x] Staging browser suite (takes the place of hand-made browser checks on a deployment).
      Installs `@playwright/test`, consumed by `apps/web/e2e`: one serial flow against a
      protected preview through Vercel's automation bypass — the wall without the bypass
      and readiness with it, an admin's sign-in through Clerk, one fixture customer
      rewritten and read back, sign-out, a worker refused the office. Run on demand from
      the owner's machine, never in `pnpm check` or CI; it deletes nothing. Done when the
      five steps pass on a preview and the run is recorded in MEMORY
- [x] S0 — Documents: the weekly schedule decisions (documents only; by the owner,
      2026-11-15). The decision rows of that date in ARCHITECTURE with its Office
      authority, Audit trail and pull-extension passages; PRD, Weekly schedule; DESIGN;
      lines S1 to S9. Each S line is planned and approved on its own, one line to a
      session, and none of S1 to S8 turns schedule enforcement on
- [x] S1 — Schedule eligibility rules as a pure module in `packages/api` (no schema, no
      procedure). Depends on S0. Work: for one person's shifts and overrides on one day,
      the one eligible shift at every scheduled moment, the early-arrival rule, and the
      refusals — an overlap with no decision, a circular or ambiguous precedence, a shift
      left with no eligible time. Consumer: S3's writers, S4's push, every schedule read.
      Tests: every order of two and of three overlapping shifts; the circular three-shift
      case refused with the time it would leave uncovered; each boundary minute, start
      included and end excluded; shifts that touch; an early start at 15 minutes and at
      16, and beside a shift already eligible; every accepted day has exactly one eligible
      shift at every covered minute
- [x] S2 — Schedule schema (plan first: schema). Depends on S1. Work: several shifts for
      one person, job and day, an exact duplicate refused; the punch lock; overlap
      overrides with their reason; their append-only history; the mark of a copied week.
      The plan decides the tables, the history's store and what becomes of the natural
      key `assignment.create` relies on, and counts `job_assignments` in every environment
      before a migration runs there. Tests: an invariant test per guard, each watched red;
      tenant isolation; the application role's grants
- [x] S3 — Validated shift writers and the week read (plan first: schema, sync). Depends
      on S2. Work: `assignment.*` create, change and remove under S1's rules, ids made by
      the browser, overrides and their history written with them, a Monday-to-Sunday read
      with each shift's eligible hours; the demo. Of the V1-D07 line's built behaviour it
      retires one row per person, job and day and "overlapping times not judged". Tests:
      an exact duplicate; one job twice in a day; an overlap refused without a decision; a
      blank reason; a shift left no eligible time, on create and on change; a shift across
      midnight; a week that does not start on Monday; another company's ids FORBIDDEN; a
      worker and a foreman refused; two admins on one person's day at once; a resend
      answers `duplicate`; every override write leaves its history entry and a
      rolled-back one leaves none
- [x] S4 — Clock-in eligibility and the punch lock, behind the enforcement switch (plan
      first: schema, sync, CI). Depends on S3. Work: the server-controlled switch, off by
      default; with it on, a `started` judged by the schedule as the 2026-11-15 rows
      state, the shift locked by the start it admits, a start captured offline that the
      schedule no longer admits stored for review; whether enforcement is on, in the
      pull. Of the V1-D07 line's tests it retires "changes no push answer", with the
      switch on only. Tests: with the switch off, every existing test unchanged and a push
      that never reads the schedule; with it on — the eligible job, another job, no shift,
      each boundary minute, the early window, an override's holder, an admin's own start,
      a foreman's start for a member with and without that member's shift, a worker
      outside the job's crew admitted by their shift, the days the clocks change, a start
      near midnight; pause, resume and end never judged; a locked shift's change and
      removal refused by the procedure and by the database; a write that would alter a
      locked shift's authorization refused; an edit and a start on one person's day in
      both orders, committed; a stored offline start counts toward nothing until decided
      and its later events are accepted. Rollback: the switch off and a new deployment
- [x] S5 — Copy Last Week (plan first: schema, if S2 left the copy's mark open). Depends on
      S3. Work: preview, confirm, one transaction, a resend that creates nothing twice,
      undo. No override is copied: a shift that would overlap is listed and left out.
      Tests: what is confirmed is what was previewed, or nothing is written and the new
      preview is answered; a deactivated person, an archived job, a duplicate and an
      overlap each left out and listed; a failure part-way writes nothing; two admins
      copying at once; undo removes every copied shift, or none when one is locked
- [x] A01 — Overview and the office navigation (DESIGN, Layout; Overview). Work: the
      navigation regrouped under the 2026-11-15 names, routes unchanged, Invoices and
      Developer appearing with their screens (R6, D01); `overview.get`, one admin read of
      four counts; `/overview`, which `/` opens. Tests: each count against the rows that
      make it and against its own screen's read — the queue, the week, the hours; nothing
      of another company; the gate line. One read, so a failure is the whole screen's
- [x] D01 — Developer console (DESIGN, Developer console). Work: `developer.get`, one
      admin read — the sync mode, minimum builds and protocol as the service reads them,
      the company's enforcement setting, the database role, the newest refused entries —
      and `/developer`, read-only, with the deployment's commit, environment and readiness
      beside it. Tests: the gate line; the caller's own lines newest first and none past
      their retention; nothing of another company, its enforcement setting included;
      nothing written
- [x] Payroll-hours CSV in Release 0.1 (2026-11-15 scope row): takes Stage 4's line as it
      is written there
- [x] Edge protection for a public host (takes, of Stage 6's edge line, the rate limits, the
      body limit and the `Origin` check). Work: limits per identity and per address on the
      API route, their store chosen on the vendor's page; tests of each locally. Done when
      a burst answers 429 on a Preview and an ordinary session never does
- [x] R4 — Field app skeleton (takes Stage 5's client-safe contract, Expo and development
      sign-in lines). Work: `@trader/api/contract`; the Expo app `app.jpteq.trader` with
      the theme and brand assets; a development build on the iOS simulator and the Android
      emulator; the i18n layer with English and Spanish catalogs; one Maestro smoke flow.
      Installs, in `apps/mobile`, at the versions Expo SDK 58's template and `expo install`
      choose (registry read 2026-11-15: `expo` 58.0.25, `react-native` 0.88.1): `expo`,
      `react`, `react-native`, `expo-router`, `expo-constants`, `expo-linking`,
      `expo-status-bar`, `expo-splash-screen`, `react-native-safe-area-context` and
      `react-native-screens`, consumed by the app's shell and navigation;
      `expo-dev-client`, by the development build; `expo-localization`, by the i18n
      layer's first choice of language; `@trpc/client` 11.23.0 and `superjson`, by the
      API client; `@types/react` and `typescript`, by typecheck; `vitest`, by the
      catalog tests. `zod` reaches the app only through `@trader/api/contract`. No i18n
      library: the catalogs are two typed objects. No `eas.json` yet: it is the device
      builds' line, which needs the Expo project.
      Done when the flow signs in as the demo foreman and reads the job list on both
      platforms.
- [x] S7 — Scheduled shift on the phone's clock (plan first: sync). Depends on R4, R5 and
      S4; it takes none of R5's lines and adds to its clock and pull. Work: the caller's
      own shifts and their eligible hours in the pull; under enforcement the clock offers
      the eligible jobsite alone, or says to ask the office; a start the server stored for
      review or refused, shown as what it is; English and Spanish; a `testID` on every
      control. Tests: Maestro flows on the iOS simulator and the Android emulator; a
      worker receives no other person's shift
- [x] R6 — Invoices (plan first: money; takes Stage 7's drafting and issue lines, less
      credit memos). Work: draft, lines priced by the admin, tax, issue with gap-free
      numbering continuing the partner's series, void; the office screens. Tests as those
      two lines state them

#### Automation — promotion, tests and release gates

- [x] P0 — Documents and reconciliation: the 2026-11-16 decision rows; RULES (Git and CI,
      Toolbox); this section; the Expo project's id and owner in `apps/mobile/app.json`;
      the staging host's origin added to `staging-preview`'s `CLERK_AUTHORIZED_PARTIES`.
      Documents and configuration only
- [x] The browser suite refuses to run untold (ARCHITECTURE, 2026-11-16, shared
      database): `E2E_COMPANY_ID`, `E2E_ADMIN_PHONE` and `E2E_WORKER_PHONE` have no
      default; with one unset the ticket step makes no ticket and the suite loads no
      test. Done when each is watched refusing in `e2e-tickets.test.ts`

#### Stage 0 — Repo rebuild

- [x] `archive/pre-rebuild` tagged; rebuilt workspace, frozen lockfile, CI job `check` with caps, six documents, brand assets; swapped to `main` under protection; Dependabot off

#### Stage 1 — Development environment (Mac)

- [x] Node and pnpm pinned; Compose Postgres, `db:up`/`db:down`; `.env.example` as the contract

#### Stage 2 — Data foundation (`packages/db`)

- [x] Driver seam, zod env, `migrate`; core, labor, pay, billing, audit tables; append-only guards; RLS ENABLE + FORCE under `trader_app`, startup guard; owner-only seed (`tsx`)

#### Stage 3 — API (`packages/api`)

- [x] Identity binding, tRPC context, role gates; fold and validation; day closeout, review fingerprint, material corrections; approval facts, queue, office repairs; sync with the six-scenario suite; kill switch, error reporting

#### Stage 4 — Office API and web (`apps/web`)

- [x] Next.js app hosting the tRPC route handler; development sign-in behind the identity adapter;
      mark and favicon from `assets/brand/logo.png` (`next`, `react`, `react-dom`, their `@types`, `eslint-config-next`)
- [x] Roster: invite, deactivate, role, effective-dated pay rates; own name and contact phone (`@trpc/client`, `@trpc/tanstack-react-query`, `@tanstack/react-query`, `superjson` in `apps/web`; `@trpc/server` pinned exact in `apps/web` and `packages/api`)
- [x] Customers and jobs with crew assignment; membership writes lock the crew row, race-tested;
      deactivation, transfers and offline backlogs decided before code
- [x] Demo fixture: owner-run script writing a synthetic company through the real procedures; never raw inserts, never the pilot's database (`tsx` in `packages/api`)
- [x] UX review of the populated office screens, phone and desktop, in the browser against the demo fixture; Figma as the exploration surface (DESIGN, Design tooling); findings become DESIGN.md amendments and lines here, no screen change in the review itself
- [x] Office shell (DESIGN, Layout): 56 pt header with the icon mark, the signed-in name and sign-out; navigation grouped by workflow, Escape closes the menu; `/` opens Jobs; no sideways scroll at 768; focus outline
- [x] Office list pattern on roster, customers, jobs and crews (DESIGN, UI components): page header with an on-demand create form, two-line narrow rows, sectioned row editors, result notes, exception pills; shared page-header, field, note and row-editor modules; no API change
- [x] V1 readiness pass after the audit at `fbf2e5d`: API plumbing under `core/`, tests
      mirroring `src/`; pool bounds and error listener; default timeouts on protected calls;
      batch cap; bounded client instants; tests and seed refuse `DATABASE_URL`; gate inventory
      test; typed lint; `0027` revoking UPDATE on `pay_rates`; office result notes, confirmed
      destructive actions, load retry, error and not-found screens, baseline headers; document
      caps removed; the 2026-11-11 decision rows
- [x] V1 owner decisions V1-D01 to V1-D21 written into PRD, ARCHITECTURE, DESIGN and this
      file (the `V1-Dnn` decision rows); documents only, nothing below is built by it
- [x] Event time kept and judged (V1-D01; plan first: sync). Objective: a suspicious time is
      reviewed at its captured value and a future one is refused recoverably. Work: the fold's
      effective instant becomes `client_timestamp` for every event, with the closeout day
      query; a new review-fingerprint version and the stated reading of closeouts sealed under
      the old fold; in `sync.push`, the receipt comparison, the `clock_skewed` flag and reason,
      `time_in_future`. Tests: a backdated "online" event is flagged, pending, and keeps its
      time; a valid two-day offline backlog is accepted in order at its captured times; a
      future event is rejected, writes nothing, and its hours are entered by the office
      through `labor.repair`; a skewed multi-event backlog; a duplicate push and a dropped
      response replay to the same ledger; UPDATE and DELETE on the ledger and on a submitted
      closeout still fail. Done when the Stage 3 six-scenario suite and these pass
- [x] Rejected-record diagnostics (V1-D04; plan first: the store and the retention period).
      Depends on nothing above. Work: a request id per HTTP request; one minimized line per
      identifiable record rejected or omitted, and per request failed as a whole; bounded
      retention enforced by the store or a scheduled delete. Tests: no payload, location or
      time in a line; a malformed record with no readable id leaves no record id; lines older
      than the period are gone. Done when the office can find a refusal by worker and day
- [x] Audit rows (V1-D20). Work: `audit_log` written in the same transaction by the
      invitation, role, activation and deactivation, and pay-rate writers, `labor.repair` and
      `approval.decide`, each with actor, company and changed fields only. Tests: every listed
      write leaves exactly one row; a rolled-back write leaves none; a row is invisible to
      another tenant; no other procedure writes one (inventory test). Done when all pass
- [x] Dated worker-job assignments with expected times (V1-D07; plan first: schema; zone and
      DST rules decided in the plan). Work: table, migration, invariant tests, admin-gated
      writers for any worker and any job of the company, the authorization-mismatch flag on
      the office read, the office screen (DESIGN, Assignment row). Tests: an assignment
      creates no `crew_members` row and changes no push answer — a worker assigned to a job
      outside their crews is still `not_permitted` there; a worker reads only their own; a
      job or worker of another company is FORBIDDEN; the mismatch flag follows a membership
      change. Done when an admin plans a week for a worker on phone and desktop
- [x] Admin closeout (V1-D08; plan first: closeout locks). Work: `closeout.review` and
      `closeout.submit` admit an admin for any job of the company, archived and crew-less
      included, on the foreman procedures; the office screen, review then submit (DESIGN,
      Closeout). Tests: every existing foreman test unchanged and green; an admin closes out
      an archived job and a crew-less job, status not written for the archived one; a foreman
      is still FORBIDDEN on a crew-less job and on another crew's; a worker is FORBIDDEN;
      another company's job is FORBIDDEN; retry by id answers `duplicate`; a stale fingerprint
      is `review_stale`; a concurrent push on the job waits or is omitted, never lost
- [x] Worker ledger read: one worker's sessions and events for a date range with approval
      state, admin-gated; the read `labor.repair` needs for its event ids; its read-only
      office screen (DESIGN, Worker ledger). Tests: gate inventory line; another company's
      worker is FORBIDDEN
- [x] Approval queue screen with reason tags, approve and reject, the recorded and received
      times of a `clock skew` entry side by side (DESIGN, Approval row); labor repair from the
      worker's ledger screen. Depends on the ledger read and the event-time line
- [x] An admin's own labor needs no approval (V1-D10 as amended; plan first: schema, sync).
      Work: push and `labor.repair` write no approvals row for an event whose worker is an
      admin at receipt; the deferred triggers of 0022 and 0026 relaxed for those events by a
      new migration, with its decision row; evidence columns stored as before; the queue's
      `ownEntry` for labor retired or kept for receipts and corrections only. Tests: an
      admin's flagged own event is eligible with no approvals row; the same event from a
      worker or a foreman is pending and its worker's own decision is still `own_entry`; an
      admin's receipt and correction still refuse their own decision; a repair of another
      person stays pending; a role change after receipt moves nothing
- [x] Material cost entry by the office: API under the closed-day freeze's cost exception,
      and its screen. Tests: only `cost_cents` and `currency` change on a frozen receipt
- [x] Office-created material entries (V1-D09; plan first: schema). Work: the provenance
      column and its migration, an admin-gated insert under the shared field-write lock, the
      form (DESIGN, Material entry). Tests: provenance is stored and shown and a device push
      cannot claim it; an entry on a closed-out day is pending `after_closeout` and its
      author's decision is `own_entry`; no existing receipt, sealed member or frozen row
      changes; a concurrent closeout either includes the entry or sends it to approval
- [x] Hours and cost aggregation (V1-D13): approved hours per worker, job and work date,
      summed in milliseconds then rounded half-up to 0.01 h; job cost to date from the rate
      in force and priced materials; pending and unpriced shown apart; one derivation used by
      every consumer below. Tests: three sessions of 20 min 10 s on one job and day round
      once on their sum, not three times; a half-way value rounds up; ledger rows unchanged;
      money in integer cents with no float
- [x] Reconciliation view and job cost on the job screen; a job detail route; unresolved
      entries shown apart. The view reads a range of work dates: its period picker and the
      carried adjustments (DESIGN, Adjustment line) are the pay-period line's, below
- [x] Pay periods (V1-D03; plan first: schema, money). Depends on the aggregation. Work: the
      INSERT trigger, open and close, the acknowledged close with approvals unresolved, the
      basis stored at close, adjustments in the next period to close, a rate inside a closed
      period; the reconciliation view reading a period, with the adjustments it carries
      shown apart (DESIGN, Adjustment line); the close screen (DESIGN, Pay-period close).
      Tests: a close with pending
      entries is refused without the acknowledgment and succeeds with it; a closed period
      and its export are byte-identical before and after a later approval, correction and
      repair; each of those appears as one adjustment, in one period, once — closing two
      further periods adds nothing; a correction that lowers hours is a negative adjustment;
      two admins closing at once leave one close
- [x] Payroll-hours CSV of a closed period's approved hours and adjustments (V1-D18): its own
      file, no pay calculation; columns decided in the plan. Test: the file's totals equal
      the reconciliation view's

#### Stage 5 — Field app (`apps/mobile`)

- [x] Client-safe contract: the sync, status and rejection-code schemas in
      `packages/api/src/contract/`, importing only zod, exported as `@trader/api/contract`;
      database enums restated there and pinned to the schema by a test; lint forbids any
      other value import from `@trader/api` in `apps/mobile`
- [x] Maestro CLI and its MCP server on the Mac, Java from Android Studio's bundled runtime;
      consumer: the flows in `apps/mobile/.maestro/`. Done when the MCP lists the local
      devices and returns a screenshot of a booted simulator and of the emulator
- [x] `expo-sqlite` store through Drizzle; outbox; sync cycle with coalesced triggers and
      reclamation; `ended` before `started` on a job switch; a rejected record kept, shown as
      needing attention, never retried. Tests: a duplicate send and a dropped response leave
      one row on the server and one settled record on the phone; a record omitted from a
      response is retried under the same id
- [x] Sync states on the device (V1-D21): a fresh `status.get` before each cycle; under
      `read_only`, `paused`, `update_required` or the server's restricted answer the outbox,
      ids and records are kept and nothing is marked rejected or failed; sync resumes on
      `normal`. Tests: each state entered mid-backlog and left again delivers every record
      once

#### Stage 6 — Accounts, deploy, operations

- [x] **decide** Neon owner role: checked for `rolbypassrls` on the role itself; if absent, a
      decision covering the migrator-as-owner, onboarding and `pg_dump` under forced RLS
- [x] **decide** A staging domain (decided 2026-11-16: a host of its own, attached to
      `staging-preview`): until then staging's
      standing origin is the `staging-preview` branch's alias on `vercel.app` (Release 0.1
      track, permanent staging branch), which lasts as long as that branch does. Done when
      the owner has decided whether staging takes a host of its own and, if it does, the
      Preview variables name it
- [x] Migration procedure, written in `packages/db/README.md`: who runs it, in what order
      against deploys, how a failed migration is rolled forward, the `0021` precondition

### 2026-11-17 — The log (O9): three moves, the union merge and the append-only step

- **Did:** read O3's first promotions before anything: runs 44204928849 (`82b33b9`) and
  44209049814 (`223ac5a`), `check` green on both commits, `database` green, `deploy` red at
  its first guard with `STAGING_DEPLOY_HOOK` empty, `verify` skipped, `report` green and the
  `staging` status `failure` on both. The owner then set the secret; no promotion has run
  with it. Branch `o9-log` from `223ac5a`, seven commits. `docs/LOG.md`: MEMORY's Log (1,700
  lines, 67 entries), ARCHITECTURE's 237 decision rows as bullets under their days (228
  with a last cell, 9 without) and TASKS' 61 ticked items (322 lines), under 19 day
  headings. `.gitattributes`; `.github/scripts/log-append-only.mjs`, first in the `check`
  job and in `pnpm check`, with an ESLint block naming its two globals; RULES (Authority,
  the document set, Git and CI, Session protocol), `CLAUDE.md`, `pr-prep`, both READMEs;
  14 cites rewritten in RULES, TASKS and MEMORY; TASKS line O9b; the Note about merges at
  the Log's end deleted. A proof script, kept out of the repository, holds every removed
  line to the log. Watched red: the proof five ways (a word changed in a bullet, a line
  deleted, a row under the wrong day, a two-cell row given a last cell, an entry under
  another day); the step on a deleted line, a changed word, two entries swapped and a
  repeated heading, and green on a repeated heading of the base taken out and on a branch
  one log line behind `main`; two appending branches conflicting without the attribute and
  merging clean with it. 1,666 tests.
- **Decided:** by the owner on 2026-11-17 (the plan approved with three answers and ten
  corrections), the bullet of this date above. The match made for it: 141 rows have a line
  that states them, about forty of those only their core rule; 96 have none. Changed from
  the plan: no cite outside the documents this batch edits; the proof compares each row
  with its bullet for equality; the local step compares with the merge base. Not done: no
  merge — the owner reads the diff first; the step has not been seen red in CI, since
  `main` has no log to lose until this merges; the 58 cites in code, workflows and
  `pnpm-workspace.yaml`, and the undated ones (`row N`, `V1-Dnn`); MEMORY's reshaping
  (O10). The match is three readers' judgement, each row read once. For the owner: PRD,
  Access, still says an admin is invited by email, against the 2026-11-12 bullet "A
  sign-in number on every new invitation"; the staging host was not asked which commit it
  serves; `STAGING_DEPLOY_KEY` is still a secret of the `staging` environment; whether the
  hook builds `main` while `apps/web/vercel.json` stops its pushes is unproven.
- **Next:** the owner's review of this branch's diff and the merge word; then the promotion that
  follows read end to end, the first with the hook set, and a draft pull request that shows
  the step red; then O9b, plan first.

- [x] O9 — `docs/LOG.md`, the three moves, the union merge and the append-only step: the
      session log, the Decisions table and the ticked TASKS items moved without a word
      changed; `.gitattributes` gives the log `merge=union`; a step in `check` fails when
      the log loses a line relative to `main`; RULES names the log in its authority table
      and document set. Plan first: each decision row matched to the line that states its
      fact. Done when a script shows every line removed from the three documents present
      in the log, and the step is watched red

### 2026-11-17 — O9b: the rows written into their homes; not done, 31 sentences withheld

- **Did:** branch `o9b-rows-home` from `40ce65d`, after the plan and the owner's answers and
  corrections C1 to C13. Read first: promotion 44218631940 green on its second attempt, the
  first cancelled after Vercel's "Canceled by Ignored Build Step". Each planned sentence was
  checked against the code by three readers before any edit: 74 written, 31 withheld because
  the code contradicts a clause of them. Five commits: ARCHITECTURE (the sentences, the day
  lock at 8, the pointer paragraph, lines 74, 194, 223, 302 to 305 and 449), RULES with
  CLAUDE.md, DESIGN, PRD, `packages/db/README.md`; `pnpm check` green before each. Then a
  second match by a reader given the five documents alone: 223 rows in force by its count,
  185 with a home, 33 in part, 5 with none (lines 57, 103, 217, 240, 1756). Watched failing
  once: invariant 9 removed in the working tree, line 58 asked again, "none", restored.
- **Decided:** by the owner, the bullet of this date (the decision rows written into their
  homes). O9b is not ticked: its done-criterion asks a home for every row in force. Found
  and not changed: `confirmCopy` locks a `users` row before `jobs` rows
  (`assignments/copy.ts`), against the lock order's items 1 and 4; three code comments
  still count three seams; ARCHITECTURE's "built in Stage 5" for the reachability reading.
- **Next:** the owner's word on each withheld sentence — the code or the row — then O9b's
  remaining rows; the second reader holds line 217 in force where the plan held it
  superseded.
