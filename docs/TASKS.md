# TRADER — Tasks

The build order and what is done. Stages are dependency-ordered; a stage starts when the one
before it is done. No dates. A task is ticked when its done-criterion holds, not when the code
exists. **Current stage: 2.**

## Stage 0 — Repo rebuild

Done when `main` is the rebuilt branch, CI is green on it, and the protection rule requires
`check`.

- [x] Tag the old `main` as `archive/pre-rebuild` and push the tag
- [x] Orphan branch `rebuild`: root manifest, workspace, TypeScript, ESLint, Prettier, gitignore
- [x] `@trader/db` and `@trader/api` scaffolds
- [x] Lockfile pruned to the rebuilt workspace; `pnpm install --frozen-lockfile` passes
- [x] `.github/workflows/ci.yml` with the single job `check`, document caps included
- [x] `README.md`, `CLAUDE.md`, `LICENSE` and the six documents
- [x] Brand assets in `assets/brand/`; DESIGN.md palette adopts the logo colours
- [x] Swap `rebuild` → `main`; protection rule on `main` requiring `check`
- [x] Delete the Dependabot branches; turn off Dependabot security updates in settings
- [ ] Resync every other clone to the new `main`

## Stage 1 — Development environment (Mac)

Done when `pnpm install && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` is
green locally and a Postgres container answers on `localhost:5432`.

- [x] Node LTS through a version manager; pnpm at the `packageManager` version
- [x] Docker runtime; `docker-compose.yml` with Postgres; `pnpm db:up` and `pnpm db:down`
- [x] `.env.example` restored as the environment contract; `.env` local and gitignored

## Stage 2 — Data foundation (`packages/db`)

Done when migrations apply to an empty database, every invariant test fails when its guard is
removed and passes when restored, and RLS blocks a cross-tenant read under the app role.

- [x] Drizzle config; client with the driver seam (`pg` locally, Neon deployed); environment
      contract validated with zod; `migrate`
- [x] Core tables: `companies`, `users`, `crews`, `crew_members`, `customers`, `jobs`, with
      `company_id NOT NULL`, unique `(company_id, id)` and composite foreign keys
- [x] `work_session_events`: append-only trigger (UPDATE, DELETE, TRUNCATE), `schema_version`,
      attestation level, location stamp, skew flag
- [ ] `pay_rates` (effective-dated), `pay_periods`, `approvals`
- [ ] `materials`, `photos`, `invoices`, `invoice_line_items`, `credit_memos`, per-company
      invoice number sequence
- [ ] `audit_log`
- [ ] RLS `ENABLE` and `FORCE` on every tenant table; app role created in SQL with
      `NOBYPASSRLS`; startup guard
- [ ] Invariant tests against the container; seed for one company and one admin

## Stage 3 — API (`packages/api`)

Done when both sync procedures pass a failure-injection suite: duplicate push, out-of-order
arrival, two-day backlog, dropped response, wrong device clock, deactivated user.

- [ ] tRPC with superjson and zod; request context with the identity adapter (development
      identity now, Clerk later) and JIT provisioning, select-first
- [ ] Role gates; a deactivated account is rejected exactly like an anonymous one
- [ ] Session fold with two-sided transition validation; derivations: `work_date`, duration,
      open sessions
- [ ] `sync.push` idempotent with per-record results; `sync.pull` per-user snapshot
- [ ] Approval queue procedures implementing the approval rule
- [ ] Kill-switch state endpoint; error-reporting wrapper

## Stage 4 — Office web (`apps/web`)

Done when an admin runs a pay period end to end locally: roster, jobs, approvals, close, export.

- [ ] Next.js app hosting the tRPC route handler; development sign-in behind the identity adapter;
      favicon and header mark from `assets/brand/logo.png`
- [ ] Roster: invite, deactivate, role, effective-dated pay rates
- [ ] Customers and jobs with crew assignment
- [ ] Approval queue with reason tags; reconciliation view; job cost to date
- [ ] Pay periods: close, late-entry adjustments; payroll CSV export of approved hours
- [ ] Full data export

## Stage 5 — Field app (`apps/mobile`)

Done when a worker tracks a real day across airplane-mode gaps on a physical phone and the
office sees correct, deduplicated hours per job.

- [ ] Xcode with the iOS Simulator (Mac)
- [ ] Android Studio with one emulator (Linux workstation)
- [ ] Expo app with a development build; `app.jpteq.trader`; theme module from DESIGN.md; app
      icon, adaptive icon and splash from `assets/brand/` (asset specs checked on docs.expo.dev)
- [ ] i18n layer with English and Spanish catalogs; every crew string through it
- [ ] `expo-sqlite` store through Drizzle; outbox; sync cycle with coalesced triggers and
      reclamation
- [ ] Clock in/out, pause/resume, job switch with biometric attestation and the foreground
      location stamp
- [ ] Job list, own hours, status pills and sync banner; kill-switch handling
- [ ] Materials with receipt photo; job-progress photos with deferred upload
- [ ] Day closeout: review and submit

## Stage 6 — Accounts, deploy, operations

Done when the deployed stack serves a physical phone over the internet, a restore drill has
passed, and Sentry shows no PII.

- [ ] Clerk production instance: passkeys on `jpteq.app`, email-code fallback, invitation-only,
      30-day sessions
- [ ] Neon Launch project; app role created in SQL; migrations re-baselined before the first run
- [ ] Vercel Pro project on `jpteq.app` with the domain layout; Vercel Cron for daily jobs
- [ ] Associated Domains and `assetlinks.json` served from the apex
- [ ] Sentry with PII scrubbing; PostHog; EAS project
- [ ] Nightly encrypted `pg_dump` to R2 and weekly restore-verify in Actions; timed restore drill

## Stage 7 — Pilot

Done when the pilot success criteria, written with the partner, are met.

- [ ] Pilot success criteria written with the partner
- [ ] Privacy policy and terms (RISEUP legal clinic); account deletion flow; both store privacy
      forms
- [ ] TestFlight public link and Play internal track; crew onboarding in English and Spanish
- [ ] Weekly feedback loop; defects become tasks here

## Stage 8 — Invoicing and exports

Done when the office issues an invoice from a completed job, exports it to QuickBooks, and the
number continues the partner's series without a gap.

- [ ] Invoice drafting from job labor and materials as snapshots; tax entered per invoice
- [ ] Issue (immutable), void, credit memos; gap-free numbering continuing the partner's series
- [ ] PDF on demand; QuickBooks CSV export

## Stage 9 — V1 complete

Done when the partner signs the acceptance checklist and the first invoice to the partner goes
out.

- [ ] Play closed test (12 or more testers, 14 days), then production; App Store listing; US
      storefronts only
- [ ] Acceptance checklist drafted, walked with the partner, signed
- [ ] First invoice to the partner — issued through TRADER

## After V1 (unscheduled)

Push notifications and web approval by push · SMS · roster self-service · audit log wiring ·
dark theme · per-company logo (additive `companies` column, upload, shown in crew app and office
header) · second contractor onboarding · payments · customer portal · PowerSync re-evaluation.
