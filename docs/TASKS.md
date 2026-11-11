# TRADER — Tasks

The build order and what is done: every line between here and a deployed V1. Stages are
dependency-ordered; a stage starts when the one before it is done, except where a stage says
it may overlap. No dates. A task is ticked when its done-criterion holds, not when the code
exists. A line marked **decide** ends in a decision row in ARCHITECTURE.md, not in code.
**Current stage: 4.**

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
- [x] Office shell (DESIGN, Layout): 56 pt header with the icon mark, the signed-in name and sign-out; navigation grouped by workflow, Escape closes the menu; `/` opens Jobs; no sideways scroll at 768; focus outline
- [x] Office list pattern on roster, customers, jobs and crews (DESIGN, UI components): page header with an on-demand create form, two-line narrow rows, sectioned row editors, result notes, exception pills; shared page-header, field, note and row-editor modules; no API change
- [x] V1 readiness pass after the audit at `fbf2e5d`: API plumbing under `core/`, tests
      mirroring `src/`; pool bounds and error listener; default timeouts on protected calls;
      batch cap; bounded client instants; tests and seed refuse `DATABASE_URL`; gate inventory
      test; typed lint; `0027` revoking UPDATE on `pay_rates`; office result notes, confirmed
      destructive actions, load retry, error and not-found screens, baseline headers; document
      caps removed; the 2026-11-11 decision rows
- [ ] Event-time plausibility in `sync.push` (2026-11-11 row): the receipt comparison, the
      `clock_skewed` flag and reason, `time_in_future`; failure-injection tests for a
      backdated "online" event, a future event, and a skewed multi-event backlog
- [ ] Rejected-record trace (2026-11-11 row): a request id per HTTP request, one minimized
      line per record not accepted, through the reporter seam; a test that no payload,
      location or time appears in it
- [ ] Audit rows (2026-11-11 row): `audit_log` written in the same transaction by role,
      activation, invitation and pay-rate writers, `labor.repair` and `approval.decide`
- [ ] Dated worker-job assignments with expected times (schema, migration, invariant tests,
      API, office screen); never read by push authority, the fold or approvals; writers and
      zone rules decided first
- [ ] **decide** closeout of archived and crew-less jobs; then admin closeout on the foreman
      procedures, unchanged for a foreman, with its office screen (review, then submit)
- [ ] Worker ledger read: one worker's sessions and events for a date range with approval
      state, admin-gated; the read `labor.repair` needs for its event ids
- [ ] Approval queue screen with reason tags, approve and reject; labor repair from the
      worker's ledger screen
- [ ] Material cost entry by the office (API under the closed-day freeze's cost exception,
      screen); **decide** office entry of a receipt the crew never logged
- [ ] Hours and cost aggregation (2026-11-11 rounding row): approved hours per worker, job and
      work date; job cost to date from the rate in force and priced materials; pending and
      unpriced shown apart; one derivation used by every consumer below
- [ ] Reconciliation view and job cost on the job screen; a job detail route
- [ ] Pay periods (2026-11-11 membership row): the INSERT trigger, open and close, late-entry
      adjustments, a rate inside a closed period; payroll CSV of approved hours
- [ ] Full data export
- [ ] Office lists: search and an active/all filter on roster, customers and crews; filter
      state in the URL; a refusal names the field it is about
- [ ] One browser smoke test of the pay period end to end at 390 and 1280 against the demo
      fixture, run in CI (`@playwright/test` in `apps/web`)
- [ ] Carry-over cleanups, each when its file is next touched: `row N` and `D1–D6` comment
      citations replaced by date and subject; the Stage 8 comments noted in MEMORY; `job.ts`'s
      erased literal type; the `pay-rates.ts` currency default

## Stage 5 — Field app (`apps/mobile`)

Done when a worker tracks a real day across airplane-mode gaps on a physical phone and the
office sees correct, deduplicated hours per job. May overlap Stage 6.

- [ ] Client-safe contract: the sync, status and rejection-code schemas in
      `packages/api/src/contract/`, importing only zod, exported as `@trader/api/contract`;
      database enums restated there and pinned to the schema by a test; lint forbids any
      other value import from `@trader/api` in `apps/mobile`
- [ ] **decide** the pull extension's fields (2026-11-11 row): job coordinates and radius,
      customer name, own assignments, approval reasons; then build it with a compatibility
      test against the protocol-1 snapshot
- [ ] Foreman crew-state read: the current session state of the members of crews the caller
      leads, online only
- [ ] Photo sync on the server: the `photo` record kind, presigned upload to R2, object key
      assignment, content-type allowlist (no SVG), size limit, upload-state read
      (`@aws-sdk/client-s3` and its presigner in `packages/api`, or the vendor's lighter
      client, chosen on the vendor's page)
- [ ] Xcode with the iOS Simulator (Mac)
- [ ] Android Studio with one emulator (Linux workstation)
- [ ] Expo app with a development build; `app.jpteq.trader`; theme module from DESIGN.md; app
      icon, adaptive icon and splash from `assets/brand/` (asset specs checked on docs.expo.dev)
- [ ] i18n layer with English and Spanish catalogs; every crew string through it; layouts
      measured with the Spanish strings
- [ ] Sign-in on the device: the identity provider's Expo SDK, token storage in the secure
      store, the token on every API call; capture never waits on a session
- [ ] `expo-sqlite` store through Drizzle; outbox; sync cycle with coalesced triggers and
      reclamation; `captured_offline` by the 2026-11-11 definition; `ended` before `started`
      on a job switch; a rejected record kept, shown as needing attention, never retried
- [ ] Clock in/out, pause/resume, job switch with biometric attestation and the foreground
      location stamp
- [ ] Job list, own hours and own assignments, status pills and sync banner; kill-switch
      handling; a wrong-clock warning when a push reports skew
- [ ] Job suggestion on app open (PRD, Smart Clock-In): one foreground reading, manual
      fallback; physical iOS and Android tests
- [ ] Own profile: name and contact phone
- [ ] Materials with receipt photo; job-progress photos with deferred upload
- [ ] Crew labor for a foreman; day closeout: review and submit; material correction
- [ ] Accessibility pass: screen-reader labels, dynamic type at the largest sizes, 48 pt
      targets, contrast, in both languages

## Stage 6 — Accounts, deploy, operations

Done when the deployed stack serves a physical phone over the internet, a restore drill has
passed, and Sentry shows no PII. Every item under "Before the first deployment" in
ARCHITECTURE.md is a line here.

- [ ] **decide** Neon owner role: checked for `rolbypassrls` on the role itself; if absent, a
      decision covering the migrator-as-owner, onboarding and `pg_dump` under forced RLS
- [ ] **decide** worker sign-in and recovery without an individual email: pilot roster
      surveyed, provider options checked on the vendor's pages; owner decision before Stage 8
- [ ] Clerk production instance: passkeys on `jpteq.app`, email-code fallback,
      invitation-only, 30-day sessions; the Clerk identity adapter behind the seam, with the
      development adapter left out of the production wiring; invitations sent on
      `roster.invite`; how `users.email` follows a changed sign-in email
- [ ] Neon Launch project; `trader_app` created in SQL and used as the login role;
      migrations re-baselined before the first run, with a full catalog diff against the
      27-file journal proving nothing hand-written was lost; the Neon driver behind the seam
      if the pooled connection needs it
- [ ] Environments: production and preview with separate databases and identity instances;
      the environment validated at start; a readiness check that touches the database and
      asserts the role
- [ ] Vercel Pro project on `jpteq.app` with the domain layout; Vercel Cron for daily jobs;
      `attachDatabasePool` from `@vercel/functions`; pool size set against Neon's limit
- [ ] Migration procedure, written in `packages/db/README.md`: who runs it, in what order
      against deploys, how a failed migration is rolled forward, the `0021` precondition
- [ ] Edge protection: rate limits per identity and per address, a request body limit, an
      `Origin` check on state-changing requests, session-cookie attributes, a content
      security policy and transport security tested on the deployed app
- [ ] Server-enforced sync brake: `sync.push` and `sync.pull` honour the kill-switch state
- [ ] `status.get` answers without running the identity adapter; the startup guard also
      checks `session_user` and that every tenant table has its policy
- [ ] Associated Domains and `assetlinks.json` served from the apex
- [ ] Sentry reporter implementing `ErrorReporter` with the minimized event only; PostHog;
      EAS project; structured request logs carrying the request id
- [ ] Nightly encrypted `pg_dump` to R2 and weekly restore-verify in Actions; timed restore
      drill; the restore creates `trader_app` first
- [ ] Repository hygiene: vulnerability alerts on; Actions pinned by commit; a sweep of
      leftover `trader_t_*` test databases in the suites' global setup; `seed.test.ts` in a
      database of its own

## Stage 7 — Invoicing and exports

Done when the office issues an invoice from a completed job, exports it to QuickBooks, and the
number continues the partner's series without a gap. May start once Stage 4 is done.

- [ ] Invoice drafting from job labor and materials as snapshots, using Stage 4's
      aggregation; tax entered per invoice; the office screens
- [ ] Issue (immutable), void, credit memos; gap-free numbering continuing the partner's
      series; the issue transition compares the frozen columns and refuses a void in the same
      statement (2026-11-11 row)
- [ ] Credit-memo ceiling and the void of an invoice with memos enforced in SQL (2026-11-11
      row); issue retries idempotent; numbering tested under concurrency; the application
      role's UPDATE on `invoice_counters` narrowed to the trigger's path
- [ ] PDF on demand; QuickBooks CSV export, its columns checked against Intuit's import page

## Stage 8 — Pilot

Done when the pilot success criteria, written with the partner, are met.

- [ ] Pilot success criteria written with the partner
- [ ] Privacy policy and terms (RISEUP legal clinic); account deletion flow; both store privacy
      forms
- [ ] **decide** an admin's own entries (who approves them in a one-admin company)
- [ ] Pilot onboarding: owner-run insert of the pilot's company and its counter at 1/1,
      before any crew signs in; the time zone validated on write
- [ ] Release gates, automated: `check` green on the release commit; the gate inventory
      passes; the journal replays into an empty database; the browser smoke test passes at
      390 and 1280; the last restore-verify run passed
- [ ] Release gates, technical, checked on the deployed stack: the login role is `trader_app`
      with neither superuser nor `BYPASSRLS`; timeouts and pool limits in force; no
      development-identity route reachable; rate limits live; Sentry events inspected for PII
- [ ] Release gates, human: an airplane-mode day on one physical iPhone and one physical
      Android phone, with the server's duplicate and rejection counts recorded; a passkey
      created and used on both, and the email-code fallback; a Spanish-language pass at large
      type sizes; a timed restore drill; the partner walks one real pay period and one invoice
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
- [ ] Acceptance checklist drafted from PRD's V1 features, walked with the partner, signed
- [ ] First invoice to the partner — issued through TRADER

## After V1 (unscheduled)

Push notifications and web approval by push · SMS · roster self-service beyond own name and phone
· audit log of every write beyond the V1 actions · dark theme · per-company logo (additive
`companies` column, upload, shown in crew app and office header) · second contractor onboarding
· payments · customer portal · PowerSync re-evaluation · ledger checkpointing if replay cost is
ever measured as a problem · periodic location-sampling experiment (separate owner approval).
