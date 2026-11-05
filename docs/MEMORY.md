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
  first closeout. Postgres aborts one; the call is retried.

## Log

### 2026-10-09 → 2026-11-04 — rolled up

- 10-09: tagged `archive/pre-rebuild`; orphan `rebuild` scaffolds; public repo, no trailers.
- 10-13: six documents replace DECISIONS/ROADMAP/WORKFLOW/ADRs; Stripe, Resend, Inngest out.
- 10-13: D Sierra Painting mark adopted; accent `#2808AC`, `brand` red for the mark only.
- 10-21: Compose Postgres 18, `db:up`/`db:down`, `.env.example`; Stage 0 closed on evidence.
- 10-21: Compose project renamed `trader-local`; the pre-rebuild volume left untouched.
- 10-27: Stage 1 closed: `trader-local_pgdata` healthy on loopback; `.nvmrc` Node 24.
- 10-27: Stage 2 line 1: Drizzle config, `pg` client behind the seam, `migrate`, CI migrates.
- 10-28: Stage 2 line 2: six core tables, composite foreign keys, `uuidv7()` office ids.
- 10-28: Stage 2 line 3: `work_session_events`, `0002` append-only guard (SQLSTATE 23000).
- 10-29: Stage 2 line 4: pay rates, pay periods, approvals, voids and corrections; 53 tests.
- 11-03: Stage 2 line 5: materials, photos, invoices, lines, credit memos, counter; 105 tests.
- 11-03: Stage 2 line 6: `audit_log` append-only by 0002's guard, API-written, empty in V1.
- 11-03: Stage 2 line 7: `trader_app`, per-table grants, FORCE RLS on 17 tables, startup guard.
- 11-03: Stage 2 line 8: owner-only seed (`pnpm db:seed`, `tsx`), 136 tests; Stage 2 closed.
- 11-03: TASKS condensed: closed stages to one ticked line; closeout and onboarding tasks.
- 11-04: Smart Clock-In scoped in PRD (post-pilot, local reminders); Stage 9; `rv.sh` retired.
- 11-04: Stage 3 line 1a: `0015` identity binding, `users_identity_guard`; 167 tests.
- 11-04: Stage 3 line 1b: tRPC, per-call transaction, identity adapters, `me.get`; 34 api tests.
- 11-04: Stage 3 line 2: `roleProcedure` allowlist, 401/403 answers; 216 tests.
- 11-04: Stage 3 line 3: fold, `validateEvent`, `deriveSessions`, worker lock; 293 tests.

### 2026-11-04 — Stage 3 line 4: day closeout record and `closeout.submit`

- **Did:** `0016`–`0018`: `day_closeouts` with sealed worker marks and material membership,
  append-only, RLS, grants; the closed-out material freeze; the company field-write lock in
  `loadWorkerTimeline`; the rolled-back caller; `gatherJobDay`; `closeout.submit`. 353 tests
  (190 db, 163 api); 28 protections watched red, 2 found layered (freeze DELETE branch, the
  step-2 role check), 2 untestable here (the seal's visibility clause, the in-call seal).
- **Decided:** nine decision rows. Owner defaults taken: foreman-only with the own-id answer
  first, record shape C, material freeze, two new Stage 3 lines. Open: O5 (an ordinary event
  on a closed day: a new approval reason, after-day closeout, or counted normally) blocks line 5.
- **Next:** O5 from Juan Pablo, then Stage 3 line 5 (TASKS:46) — `sync.push` and `sync.pull`.

### 2026-11-04 — Stage 3 line 5: crew day-review read and review fingerprint

- **Did:** `closeout.review` (foreman gate, scope rows `FOR SHARE`, no field-write lock);
  `closeout/fingerprint.ts` (`v1.` SHA-256, job status bound); `closeout/scope.ts` shared with
  submit; submit requires `reviewFingerprint` and answers `review_stale` after `sessions_open`.
  No migration. 377 tests (190 db, 187 api); 17 protections watched red, `voided` layered.
- **Decided:** two decision rows; R1–R6 defaults (no stored fingerprint, sessions-only workers,
  no cost, no approvals, new id after stale, existing closeout flagged). O5 still open, before
  TASKS:46. The previous entry's Next skipped TASKS:44–45.
- **Next:** Stage 3 line 6 (TASKS:45) — material corrections.
