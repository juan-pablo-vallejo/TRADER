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

## Log

### 2026-10-09 → 2026-11-03 — rolled up

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

### 2026-11-03 — Stage 2 line 8: the owner-only seed; Stage 2 closed

- **Did:** `seed.ts` and `run-seed.ts` behind `pnpm db:seed`, `tsx` declared; 3 tests watched
  red, 136 in all; empty database migrated, seeded twice, counts 1/1/1; one decision row;
  Stage 2 closed on "shows only the tenant's rows in every table".
- **Decided:** fixed company id; counter 1/1 inserted once, the partner's series at Stage 8;
  the seed refuses a role that cannot bypass RLS; proven by tests, not a CI step.
- **Next:** the TASKS condense PR, then Stage 3 line 1. Pilot onboarding (its company and
  counter continuation, owner-run) still needs a TASKS line.

### 2026-11-03 — TASKS condense: closed stages rolled up, three tasks added

- **Did:** Stages 0–2 rolled to one ticked line each, TASKS 142 → 125; the Neon owner check
  moved from Notes to a Stage 6 task; day closeout record (Stage 3) and pilot onboarding
  (Stage 7) added; `packages/db` loses "(scaffold)" in ARCHITECTURE.
- **Decided:** a closed stage keeps its heading, done-criterion and one ticked line; the detail
  lives in the Log. No decision rows.
- **Next:** Stage 3 line 1 (TASKS:34) — "tRPC with superjson and zod; request context with the
  identity adapter (development identity now, Clerk later) and JIT provisioning,
  select-first".

### 2026-11-04 — Smart Clock-In V1 scope documented

- **Did:** PRD Smart Clock-In section, location bullet narrowed, pilot marked manual, compliance
  extended (PRD at 150); two decision rows superseding row 136's halves; TASKS Stage 9 inserted,
  V1 complete renumbered to Stage 10, sampling experiment listed after V1; two Log entries
  rolled up. The `rv.sh` review channel retired.
- **Decided:** the owner's scope as written in PRD, Smart Clock-In: post-pilot, admin
  eligibility plus employee activation, the shared job radius, local notifications only, and a
  privacy release gate that V1 waits on.
- **Next:** Stage 3 line 1 (TASKS:34).

### 2026-11-04 — Stage 3 line 1a: users identity binding

- **Did:** split line 1 into 1a/1b (line 2 keeps the deactivation proof); `0015` custom
  (`app_identity_subject()`, `app_identity_email()`, two `users` policies, `users_identity_guard`);
  31 tests under `trader_app`, each protection watched red; 167 in all; `0000`–`0015` replayed
  into an empty database, seeded twice 1/1/1; two decision rows; rolled up one Log entry.
- **Decided:** a trigger, not column grants or SECURITY DEFINER, protects columns on the bind;
  whole-row comparison; a bound row is unreachable under an identity alone; no unbinding yet.
- **Next:** Stage 3 line 1b — tRPC, the request context and the development identity.

### 2026-11-04 — Stage 3 line 1b: tRPC, request context, development identity

- **Did:** `@trpc/server` 11.23.0 (quarantine passed over 11.24.0), superjson, zod; identity
  adapter and development adapter; `protectedProcedure` with one transaction per call;
  select-first resolution and bind; `me.get`; 34 api tests, 15 guards watched red; guard.ts
  comment corrected; four decision rows; plan revised after review (context by value, GUC
  test inside the transaction, guard per transaction, bind conflicts and deactivation race).
- **Decided:** per-call transaction, `ok: false` rethrown; one `UNAUTHORIZED`; deactivated
  resolves to no user and is never bound; the dev identity only under development or test.
- **Next:** Stage 3 line 2 — role gates, the deactivated-as-anonymous suite.

### 2026-11-04 — Stage 3 line 2: role gates

- **Did:** RULES fail-closed line clarified (404 switched-off route, 401/403 API); `roleProcedure`
  allowlist on the protected procedure; 15 role tests, 49 api and 216 in all; allowlist,
  deactivated rejection and rollback each watched red; `http()` moved to helpers with statuses;
  four decision rows.
- **Decided:** no role hierarchy; `FORBIDDEN` "Not permitted." after resolution; gates are entry
  checks only, resource scope lives in each business procedure.
- **Next:** Stage 3 line 3 (TASKS:40) — session fold with two-sided transition validation.
