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
- drizzle-kit never sees triggers or functions. They live in `generate --custom` files, which
  start with a comment line to replace; a plain generate afterwards emits nothing. Separate
  statements with `--> statement-breakpoint`; pass flags without `--` (pnpm forwards them).
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

## Log

### 2026-10-09 — Archived the old repository, started the rebuild

- **Did:** tagged `main` as `archive/pre-rebuild`; began orphan branch `rebuild` with root
  config and workspace scaffolds, one file per commit, each verified against the tag.
- **Decided:** repository stays public on GitHub Free; proprietary LICENSE in Juan Pablo's own
  name; Dependabot off; one CI workflow; no commit trailers.
- **Next:** finish the scaffolds.

### 2026-10-13 — Six-document set replaces the previous documentation plan

- **Did:** pushed `rebuild`; added the remaining scaffolds, the pruned lockfile, the CI
  workflow, `LICENSE`, the six documents, `CLAUDE.md` and `README.md`.
- **Decided:** PRD · ARCHITECTURE · RULES · DESIGN · TASKS · MEMORY replace DECISIONS, ROADMAP,
  WORKFLOW and the ADR register; biometric attestation stays in V1 mobile; three roles and the
  day closeout stay; the geofence spike is dropped; Stripe, Resend, Inngest and Expo push are
  out of V1; light theme only.
- **Next:** TASKS.md Stage 0 — swap `rebuild` → `main`.

### 2026-10-13 — D Sierra Painting logo adopted as the brand; indigo accent

- **Did:** converted the partner's 7740 px JPEG into `assets/brand/logo.png` (2048, full mark)
  and `icon.png` (1024, tools glyph only, cropped by colour so no text survives); rewrote the
  DESIGN.md palette and Brand section with computed contrast; decisions row; TASKS lines naming
  the Stage 4 and 5 consumers; per-company branding listed after V1 in PRD and TASKS.
- **Decided:** the logo is TRADER's own mark in V1 and every tenant sees it; accent is the logo's
  outline indigo `#2808AC`; `brand` red `#BC0C0C` colors only the mark and wordmark so it never
  competes with `attention`. Expo icon and splash specs are checked on docs.expo.dev at Stage 5.
- **Next:** Stage 0 — swap `rebuild` → `main` and set the protection rule.

### 2026-10-21 — Local Postgres through Docker Compose; Stage 0 closed on evidence

- **Did:** `docker-compose.yml` (`postgres:18-alpine`, named volume, `pg_isready` healthcheck,
  loopback port, credentials interpolated from `.env` with `:?`), `.env.example` with the three
  Postgres variables, `!.env.example` in `.gitignore`, `db:up` as `up -d --wait` and `db:down`.
  Verified: healthy in 6 s, `psql` from the host, a row survives down/up, `db:up` fails closed
  with no credentials. Ticked Stage 0 lines 1–2 on evidence: protection on `main` requires
  `check`; no Dependabot branches, open PRs or security updates remain. Node 24 is Maintenance
  LTS per nodejs/Release; nvm's `lts/*` moves to 26 on 2026-10-28 while CI pins 24.
- **Decided:** nothing.
- **Next:** Juan Pablo copies `.env.example` to `.env` (a permission rule keeps Claude from
  writing it) and ticks Stage 1 line 3; the Linux clone stays unverified until the workstation
  answers; Stage 1 line 4's Android half contradicts the Mac's no-Android rule and needs his call.
  Then Stage 2 line 1.

### 2026-10-21 — Compose project renamed to `trader-local`

- **Did:** changed `name:` in `docker-compose.yml` from `trader` to `trader-local` so the
  development database is isolated from the pre-rebuild Compose project; the named volume
  configuration is unchanged and the old volume `trader_trader-pgdata` was not touched. `.env`,
  application code and dependencies untouched. Rewrote the Notes entry that described the old
  name.
- **Decided:** nothing.
- **Next:** unchanged from the entry above.

### 2026-10-27 — Stage 1 closed: Postgres answers under `trader-local`

- **Did:** with `.env` in place (never read by Claude), `pnpm db:up` created
  `trader-local_pgdata`, healthy, published on 127.0.0.1:5432 only, `pg_isready` from the host
  accepting connections; a probe row survived `db:down`/`db:up`; public schema empty after. The
  old volume `trader_trader-pgdata` and `.env.pre-rebuild` were already gone at the start.
  `.nvmrc` pins Node 24 to match CI's `node-version`. Simulator lines moved to Stage 5, split by
  machine; "Current stage" bumped to 2 in its own commit after a line-anchored `sed` missed it.
- **Decided:** simulators belong to the stage that consumes them — Xcode on the Mac, Android
  Studio on the Linux workstation; Stage 1 closes without them.
- **Next:** Stage 2 line 1 — Drizzle config, client with the driver seam, `migrate`, `seed`.
  Stage 0 line 10 (Linux clone resync) stays open until the workstation answers.

### 2026-10-27 — Stage 2 line 1: Drizzle config, client behind the driver seam, `migrate`

- **Did:** merge procedure in RULES; `@trader/db` gains zod, drizzle-orm, pg, @types/pg and
  drizzle-kit, each with its first importer; `env.ts` validates a passed record and entry points
  load `.env`; `pg` client; drizzle config, empty journal, `db:generate`/`db:migrate`; CI
  migrates against a Postgres 18 service; `migrations/` prettier-ignored. Found while verifying:
  drizzle-kit turns an absent `ssl` into `{}`, so the derived connection says `ssl: false`.
- **Decided:** branch protection now enforced for admins; merges are merge commits through pull
  requests. `loadEnvFile` over dotenv; `drizzle-kit migrate` over a tsx script; engines ≥ 24.
- **Next:** Stage 2 line 2 — core tables.

### 2026-10-28 — Stage 2 line 2: core tables

- **Did:** line 1 carry-overs (push-only Drizzle options dropped; one env parse in `createDb`;
  `./schema` export subpath; CI runner `ubuntu-24.04`); lines 2 and 7 rescoped; six core tables
  with composite foreign keys in one generated migration; nine schema tests in rolled-back
  transactions, each watched red by dropping its guard in the database; ARCHITECTURE condensed by
  two rows, three added.
- **Decided:** Postgres `uuidv7()` for office rows; enum types, `job_status` open · complete ·
  archived; `deactivated_at` over `active`; `identity_subject` globally unique (one login, one
  company; relaxing it is a decision); the foreman is also a `crew_members` row, API-enforced.
- **Next:** Stage 2 line 3 — `work_session_events`.

### 2026-10-28 — Stage 2 line 3: `work_session_events` and its append-only guard

- **Did:** the table and two enums; `0001` generated, `0002` through `generate --custom` with
  the trigger function and three statement-level triggers; `test/helpers.ts` shared; twelve
  tests, each watched red by dropping its guard; D14 (`prettier-ignore`) and D16 (ARCHITECTURE
  cap 200); three decision rows. Empty-schema migrate twice and the four rejections verified.
- **Decided:** `clock_skewed` plus `clock_skew_ms` as bigint; no `payload`, no `created_at`;
  SQLSTATE 23000; `voided` and the correction columns wait for line 4 (D15); cap 200 (D16).
- **Next:** Stage 2 line 4 — `pay_rates`, `pay_periods`, `approvals`, plus `voided` with
  `voids_event_id` and the correction columns.

### 2026-10-29 — Stage 2 line 4: pay_rates, pay_periods, approvals; voids and corrections

- **Did:** `voided` and four correction columns; `pay_rates`, `pay_periods`, `approvals`, two
  enums; `0003` generated, `0004` custom (btree_gist, no-overlap exclusion, three triggers); 26
  tests watched red, 53 in all; `0000`–`0004` replayed empty in one transaction; four rows. The
  TRUNCATE test needs `CASCADE`: a referenced table is 0A000 before any trigger fires.
- **Decided:** the plan's eighteen recommendations as given. Flag: PRD Office approval omits the
  skew condition ARCHITECTURE line 85 adds; `approval_reason` carries `clock_skewed`.
- **Next:** Stage 2 line 5 — materials, photos, invoices and the number sequence. Roll-up due.
