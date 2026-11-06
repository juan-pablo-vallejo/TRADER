# TRADER — Tasks

The build order and what is done. Stages are dependency-ordered; a stage starts when the one
before it is done. No dates. A task is ticked when its done-criterion holds, not when the code
exists. **Current stage: 3.**

## Stage 0 — Repo rebuild

Done when `main` is the rebuilt branch, CI is green on it, and protection requires `check`.

- [x] `archive/pre-rebuild` tagged; rebuilt workspace, frozen lockfile, CI job `check` with caps,
      six documents, brand assets; swapped to `main` under protection; Dependabot off
- [ ] Resync every other clone to the new `main`

## Stage 1 — Development environment (Mac)

Done when `pnpm install && pnpm check` is green and Postgres answers on `localhost:5432`.

- [x] Node and pnpm pinned; Compose Postgres, `db:up`/`db:down`; `.env.example` as the contract

## Stage 2 — Data foundation (`packages/db`)

Done when migrations apply to an empty database, every invariant test fails when its guard is
removed and passes when restored, and RLS blocks a cross-tenant read under the app role.

- [x] Driver seam, zod env, `migrate`; core, labor, pay, billing and audit tables; append-only
      guards; RLS ENABLE + FORCE under `trader_app`, startup guard; owner-only seed (`tsx`)

## Stage 3 — API (`packages/api`)

Done when both sync procedures pass a failure-injection suite: duplicate push, out-of-order
arrival, two-day backlog, dropped response, wrong device clock, deactivated user.

- [x] `users` identity binding: policies on `app.identity_subject` and `app.identity_email`,
      an identity guard trigger (custom migration, tests under `trader_app`)
- [x] tRPC with superjson and zod; request context with the identity adapter (development
      identity now, Clerk later), JIT binding select-first; a deactivated account is no user
- [x] Role gates; tested against a deactivated account exactly like an anonymous one
- [x] Session fold with two-sided transition validation; derivations: `work_date`, duration,
      open sessions
- [x] Day closeout record per job and work date (schema, migration, invariant tests) and
      `closeout.submit`; locked once submitted, later changes are corrections (PRD, Day closeout)
- [x] Crew day-review read with a review fingerprint checked at submit; before Stage 5 closeout
- [x] Material corrections: rows naming the original, approval for materials (PRD, Day closeout)
- [x] Approval facts at push (`captured_offline`, `after_closeout`); receipt approvals, late corrections
- [x] `sync.push` idempotent with per-record results; `sync.pull` per-user snapshot
- [x] `closeout.submit`, `material.correct`: an id an invisible row holds is `id_conflict`, not 500
- [x] Approval queue procedures implementing the approval rule
- [x] Office labor repairs: append, correct, void; atomic repair sets validated as one timeline
- [x] Kill-switch state endpoint; error-reporting wrapper

## Stage 4 — Office web (`apps/web`)

Done when an admin runs a pay period end to end locally: roster, jobs, approvals, close, export.

- [ ] Next.js app hosting the tRPC route handler; development sign-in behind the identity adapter;
      favicon and header mark from `assets/brand/logo.png`
- [ ] Roster: invite, deactivate, role, effective-dated pay rates
- [ ] Customers and jobs with crew assignment; membership writes lock the crew row, race-tested
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
- [ ] Neon owner role checked for `rolbypassrls` on the role itself; if absent, a decision
      covering the seed, the migrator-as-owner and onboarding
- [ ] Vercel Pro project on `jpteq.app` with the domain layout; Vercel Cron for daily jobs
- [ ] Associated Domains and `assetlinks.json` served from the apex
- [ ] Sentry with PII scrubbing; PostHog; EAS project
- [ ] Nightly encrypted `pg_dump` to R2 and weekly restore-verify in Actions; timed restore drill

## Stage 7 — Pilot

Done when the pilot success criteria, written with the partner, are met.

- [ ] Pilot success criteria written with the partner
- [ ] Privacy policy and terms (RISEUP legal clinic); account deletion flow; both store privacy
      forms
- [ ] Pilot onboarding: owner-run insert of the pilot's company and its counter at 1/1,
      before any crew signs in
- [ ] TestFlight public link and Play internal track; crew onboarding in English and Spanish
- [ ] Weekly feedback loop; defects become tasks here

## Stage 8 — Invoicing and exports

Done when the office issues an invoice from a completed job, exports it to QuickBooks, and the
number continues the partner's series without a gap.

- [ ] Invoice drafting from job labor and materials as snapshots; tax entered per invoice
- [ ] Issue (immutable), void, credit memos; gap-free numbering continuing the partner's series
- [ ] PDF on demand; QuickBooks CSV export

## Stage 9 — Smart Clock-In

Done when, on physical iOS and Android phones, an activated employee is reminded on arrival
inside the work window and never outside it, the privacy release gate holds, and the office
sees ordinary clock events (PRD, Smart Clock-In).

- [ ] Policy (schema, migration, invariant tests, API): eligibility, company work window with
      employee overrides and a maximum override length; admin-only writes; own policy in the
      pull snapshot
- [ ] Office: eligibility per employee, work windows and overrides
- [ ] Feasibility on Expo, iOS and Android — background geofencing, local notifications,
      permissions, store policy — checked on vendor pages; findings before code
- [ ] Device: disclosure and activation, in-window geofences, policy check and expiry,
      reminders, strings through i18n
- [ ] Release gate: privacy enforcement verified on physical phones; store privacy forms
      updated; jurisdictional employment requirements identified

## Stage 10 — V1 complete

Done when the partner signs the acceptance checklist and the first invoice to the partner goes
out.

- [ ] Play closed test (12 or more testers, 14 days), then production; App Store listing; US
      storefronts only
- [ ] Acceptance checklist drafted, walked with the partner, signed
- [ ] First invoice to the partner — issued through TRADER

## After V1 (unscheduled)

Push notifications and web approval by push · SMS · roster self-service · audit log wiring ·
dark theme · per-company logo (additive `companies` column, upload, shown in crew app and office
header) · second contractor onboarding · payments · customer portal · PowerSync re-evaluation ·
periodic location-sampling experiment (separate owner approval).
