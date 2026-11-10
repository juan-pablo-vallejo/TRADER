# TRADER — Tasks

The build order and what is done. Stages are dependency-ordered; a stage starts when the one
before it is done. No dates. A task is ticked when its done-criterion holds, not when the code
exists. **Current stage: 4.**

## Stage 0 — Repo rebuild

Done when `main` is the rebuilt branch, CI is green on it, and protection requires `check`.

- [x] `archive/pre-rebuild` tagged; rebuilt workspace, frozen lockfile, CI job `check` with caps, six documents, brand assets; swapped to `main` under protection; Dependabot off
- [ ] Resync every other clone to the new `main`

## Stage 1 — Development environment (Mac)

Done when `pnpm install && pnpm check` is green and Postgres answers on `localhost:5432`.

- [x] Node and pnpm pinned; Compose Postgres, `db:up`/`db:down`; `.env.example` as the contract

## Stage 2 — Data foundation (`packages/db`)

Done when migrations apply to an empty database, every invariant test fails when its guard is
removed and passes when restored, and RLS blocks a cross-tenant read under the app role.

- [x] Driver seam, zod env, `migrate`; core, labor, pay, billing, audit tables; append-only guards; RLS ENABLE + FORCE under `trader_app`, startup guard; owner-only seed (`tsx`)

## Stage 3 — API (`packages/api`)

Done when both sync procedures pass a failure-injection suite: duplicate push, out-of-order
arrival, two-day backlog, dropped response, wrong device clock, deactivated user.

- [x] Identity binding, tRPC context, role gates; fold and validation; day closeout, review fingerprint, material corrections; approval facts, queue, office repairs; sync with the six-scenario suite; kill switch, error reporting

## Stage 4 — Office API and web (`apps/web`)

Done when an admin, on a phone and on a desktop, runs a pay period end to end locally: roster,
jobs, assignments, approvals, a closeout, close, export.

- [x] Next.js app hosting the tRPC route handler; development sign-in behind the identity adapter;
      mark and favicon from `assets/brand/logo.png` (`next`, `react`, `react-dom`, their `@types`, `eslint-config-next`)
- [x] Roster: invite, deactivate, role, effective-dated pay rates; own name and contact phone (`@trpc/client`, `@trpc/tanstack-react-query`, `@tanstack/react-query`, `superjson` in `apps/web`; `@trpc/server` pinned exact in `apps/web` and `packages/api`)
- [x] Customers and jobs with crew assignment; membership writes lock the crew row, race-tested;
      deactivation, transfers and offline backlogs decided before code
- [x] Demo fixture: owner-run script writing a synthetic company through the real procedures; never raw inserts, never the pilot's database (`tsx` in `packages/api`)
- [x] UX review of the populated office screens, phone and desktop, in the browser against the demo fixture; Figma as the exploration surface (DESIGN, Design tooling); findings become DESIGN.md amendments and lines here, no screen change in the review itself
- [ ] Office shell (DESIGN, Layout): 56 pt header with the icon mark, the signed-in name and sign-out; navigation grouped by workflow, Escape closes the menu; `/` opens Jobs; no sideways scroll at 768; focus outline
- [ ] Office list pattern on roster, customers, jobs and crews (DESIGN, UI components): page header with an on-demand create form, two-line narrow rows, sectioned row editors, result notes, exception pills; shared page-header, field, note and row-editor modules; no API change
- [ ] Dated worker-job assignments with expected times (schema, migration, invariant tests, API);
      never read by push authority, the fold or approvals; writers and zone rules decided first
- [ ] Admin closeout on the foreman procedures, unchanged; archived, crew-less jobs decided first
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
- [ ] Job list, own hours and own assignments, status pills and sync banner; kill-switch handling
- [ ] Job suggestion on app open (PRD, Smart Clock-In): authorized jobs' locations in an extended
      pull, one foreground reading, manual fallback; physical iOS and Android tests
- [ ] Own profile: name and contact phone
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
- [ ] Vercel Pro project on `jpteq.app` with the domain layout; Vercel Cron for daily jobs; `attachDatabasePool` from `@vercel/functions`
- [ ] Associated Domains and `assetlinks.json` served from the apex
- [ ] Sentry with PII scrubbing; PostHog; EAS project
- [ ] Nightly encrypted `pg_dump` to R2 and weekly restore-verify in Actions; timed restore drill
- [ ] Worker sign-in and recovery without an individual email: pilot roster surveyed, provider
      options checked on the vendor's pages; owner decision before Stage 8

## Stage 7 — Invoicing and exports

Done when the office issues an invoice from a completed job, exports it to QuickBooks, and the
number continues the partner's series without a gap.

- [ ] Invoice drafting from job labor and materials as snapshots; tax entered per invoice
- [ ] Issue (immutable), void, credit memos; gap-free numbering continuing the partner's series
- [ ] Credit-memo ceiling and the void of an invoice with memos decided, then enforced in SQL;
      issue retries idempotent; numbering tested under concurrency
- [ ] PDF on demand; QuickBooks CSV export

## Stage 8 — Pilot

Done when the pilot success criteria, written with the partner, are met.

- [ ] Pilot success criteria written with the partner
- [ ] Privacy policy and terms (RISEUP legal clinic); account deletion flow; both store privacy
      forms
- [ ] Pilot onboarding: owner-run insert of the pilot's company and its counter at 1/1,
      before any crew signs in
- [ ] Release gate: email-less worker sign-in and an admin's own entries decided
- [ ] TestFlight public link and Play internal track; crew onboarding in English and Spanish
- [ ] Weekly feedback loop; defects become tasks here

## Stage 9 — Smart Clock-In arrival reminders

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

Push notifications and web approval by push · SMS · roster self-service beyond own name and phone
· audit log wiring · dark theme · per-company logo (additive `companies` column, upload, shown in
crew app and office header) · second contractor onboarding · payments · customer portal ·
PowerSync re-evaluation · periodic location-sampling experiment (separate owner approval).
