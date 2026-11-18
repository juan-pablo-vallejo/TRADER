# TRADER — Tasks

The order of work and what is still open, as one list: every line between here and V1
complete, in the order it is worked. A line's dependencies stand above it; of the lines that
are free, the most critical is first. No dates. A task is ticked when its done-criterion
holds, not when the code exists; it is then moved to [LOG.md](LOG.md). A line marked
**decide** ends in a line in LOG.md, not in code.

- **Current work: the Release 0.1 track**, the path to production. A session works the track's
  first open line that waits on nothing of the owner's; a line marked Owner, and every line
  under "The owner's, started now", is the owner's. Nothing below the track is started before
  its go/no-go line is recorded as passed, unless the owner names the line.
- A line states what is still open and when it is done, and nothing else. What was built, seen
  or decided on the way is the log's; a line's plan is its pull request's.
- A new idea enters under Parked, as one line. It moves up only on the owner's word and is
  written out only then.
- An id (R5, S9, P4, O11) never changes and is never reused; the order is the list's, not the
  id's. A line with no id is cited by its stage and subject, and Stages, near the end, says
  where each stage's open lines stand.

## Release 0.1 — the path to production

Done when the go/no-go line is recorded as passed and D Sierra Painting's crew is on the store
builds (LOG, the 2026-11-12 Release 0.1 rows). Each line is planned in its pull request and
worked without a per-line approval (LOG, 2026-11-15, autonomous execution) unless it says to
wait, and names the packages it installs here before they are installed. Staging and
production are separate databases and identity instances throughout; nothing paid is created
and no production migration runs without the owner's approval of that step. Production starts
with schedule enforcement on, once S9 is passed (LOG, 2026-11-18).

### The owner's, started now

Each has a wait no session can shorten, so each starts now, beside the lines in order. Also
the owner's, as they arrive: the reading of R8's draft; and R10's App Store Connect and Play
Console records and listings, which need no build.

- [ ] R19 — Owner, for P4's builds: the Expo token as a secret of the `staging` environment;
      an Apple team on the Expo account, the first iOS ad hoc credentials and the test iPhone
      registered; the first Android keystore, and its fingerprint at Clerk. Done when P4's
      first builds ask for none of them
- [ ] R18 — A sign-in address for every person on the roster (2026-11-12 Release 0.1 sign-in):
      the roster checked with the partner, each crew member's own mobile number and each
      admin's own email recorded before their invitation; no shared number or address. Done
      when every roster row to be invited has a distinct one its owner has confirmed

### In order

- [ ] R11 — A way in without an SMS (**decide**, then build; plan first: auth; taken out of
      R10). For the stores' reviewers — TestFlight's, App Review, Play's — who receive no
      code, and for staging's phone flows, where Clerk's test mode is off and the phone has no
      ticket path (LOG, 2026-11-16, staging sign-in by ticket). The three vendors' pages are
      read first and the options put to the owner; Clerk warns against its test mode on a
      production instance (its page, read 2026-11-18). Built to admit only the demonstration
      company's people in production and the fixture numbers on staging. Done when the
      decision is in LOG, staging's smoke flow signs in on both platforms with no code sent,
      and the reviewer's way in is seen on a preview build
- [ ] R21 — The origin rule fails closed (plan first, and wait: auth; LOG, 2026-11-18, the
      owner's word on the 31 sentences). An empty `CLERK_AUTHORIZED_PARTIES` admits a session
      token that names any origin (`apps/web/src/server/clerk-identity.ts`, `admitsParty`).
      Work: `admitsParty` refuses a named origin when the list is empty; a test watched
      failing first; `.env.example` says local development with Clerk sets the list. Done
      when that test is green and staging signs in from the office and from a phone build
- [ ] P4 — Preview builds (takes the device builds' line; plan first: CI). Depends on R19, and
      on R11 for its sign-in. Work: `eas.json` with development, preview, preview-simulator
      and production profiles; the build number from EAS in place of the constant in
      `config.ts`; the API's address and Clerk's publishable key as preview variables; a
      workflow that builds a candidate or a named commit and skips an unchanged native
      fingerprint; a Maestro sign-in part by R11's path. Tools on the runner: `eas-cli`, at a
      version read from its registry, consumed by that workflow. The production profile is
      never run by automation. Done when one commit has an APK and a simulator build, the
      smoke flow signs in to staging on both, and the development sign-in is seen absent from
      the preview build (Stage 5's development sign-in line)
- [ ] P7 — Fixture tenants on the shared database (LOG, 2026-11-16, shared database). Work:
      `R3 Staging Co` stays the browser suite's and nothing else's; one company for the phone
      flows, with jobs, a crew, a foreman and a worker, and one for development by hand,
      through the owner-role wrapper's `onboard` and the office's own invitations, each with
      identities no other company holds — fictional numbers ending `0100`–`0109` for the
      browser suite, `0110`–`0119` for the phone flows, `0120`–`0129` for development by hand.
      Nothing is deleted and no destructive test runs there. Done when the three companies
      exist, each signs in as its own people, and a read as `trader_app` under each company's
      setting counts no row of the other two; and when the three checks of the public staging
      host still unseen are seen (2026-11-15 row): another company's rows refused on it, a
      burst answered 429, every other Preview still answering 302
- [ ] R5 — Field app, time tracking (plan first: sync; with Stage 5's sign-in, offline
      evidence, history and own profile lines). Still open: the SMS-code sign-in on Android;
      all of it against the staging deployment; own profile, name and contact phone. Depends
      on P4's preview builds, ad hoc on the registered iPhone, and on P7, with a real number
      on a staging roster to receive the code. Done when a worker on a physical iPhone and a
      physical Android phone signs in by SMS code, clocks in on an assigned job, switches jobs
      and clocks out across an airplane-mode gap, and the office shows the hours once, per job
- [ ] S8 — The worker's own week, and a schedule gone stale (DESIGN, Own history): the
      caller's shifts for the week, read-only, from the last pull, with how old that pull is;
      a schedule the office changed while the phone was offline. Built on the simulators. Done
      on a physical iPhone and a physical Android phone across an airplane-mode gap, with R5's
      phones
- [ ] O5 — Phone polish inside Release 0.1: tab icons; accessibility labels; layouts measured
      with the Spanish strings (Stage 5's i18n line); the app icon, adaptive icon and splash
      checked against the asset specs on docs.expo.dev (Stage 5's Expo line). Own profile and
      the sign-in on Android are R5's; `eas.json` is P4's
- [ ] S10 — `confirmCopy`'s lock order (plan first, and wait: locks). Copy Last Week's confirm
      takes the caller's `users` row before it locks `jobs` rows
      (`packages/api/src/assignments/copy.ts`), against ARCHITECTURE, Concurrency: `jobs`
      first, `users` fourth. Its plan says whether any other writer does the same. Done when a
      two-connection test, watched hanging before the fix, is green and `confirmCopy` takes
      its locks in the stated order
- [ ] S6 — Weekly Schedule office screen (DESIGN, Weekly Schedule). Still open: the week
      planned with about 24 people; one pass with a screen reader; the reviewed prototype's
      fourth revision reconciled with the screen, or set aside by the owner. Done when an
      admin plans, overrides, copies and undoes a week by keyboard at 390, 768, 1024 and 1280
      with about 24 people, no control under its target, no sideways page scroll, a refused
      circular choice said in words, a locked shift read-only, and one pass with a screen
      reader
- [ ] S9 — Schedule enforcement, rollout acceptance. Depends on S6 and S8. The switch on for
      staging alone; the browser suite; both physical phones; a worker scheduled on a job
      outside their crew clocks in on a physical phone; refusals and error reports read
      after. The owner means production to start with it on (LOG, 2026-11-18). Done when the
      owner's approval to turn it on in production is recorded in LOG, or withheld;
      production's setting is the owner's
- [ ] R7 — Invoice PDF, payments and delivery. Still open: one send seen arriving. Done when
      an issued invoice is sent from staging to the allow-listed address, the send is recorded
      as sent, and the owner has seen the message arrive with its PDF
- [ ] R8 — Public pages and account deletion (plan first: auth; takes Stage 8's privacy line).
      Work: privacy policy, terms, support and the deletion request on the apex; the deletion
      request in the app's profile, after R5's; deactivate-and-pseudonymize as an
      admin-confirmed action. The text is drafted for the owner's approval and reviewed by the
      RISEUP legal clinic when it can be booked; nothing is published before the owner
      approves it (LOG, 2026-11-18). The pseudonymization accounts for `audit_log` rows that
      hold a user's id beside a pay rate. Seen on staging before production
- [ ] R12 — Release 0.1's acceptance checklist (documents only; the wording is the owner's):
      what the partner's admin signs at the go/no-go line, drafted from PRD's Release 0.1
      definition, one line a thing the admin does or sees. Its plan says where it lives in the
      fixed document set. Done when the owner has approved its wording
- [ ] R17 — A changed sign-in number, by hand (LOG, 2026-11-18): the owner changes it on the
      person's Clerk user; the roster row, found by its subject, is expected to keep working,
      and its stored `sign_in_phone` goes stale. Done when it has been tried once on staging,
      the same roster row signing in on the new number, and the runbook its plan names says
      how, with the stale number stated as known
- [ ] R14 — The pool on Vercel (Stage 6's Vercel line): `attachDatabasePool` from
      `@vercel/functions`, consumed where the pool is made (`packages/db/src/client.ts`) or
      beside it in `apps/web`; the pool's size set against Neon's limit. Each is read on its
      vendor's page first, and the line is struck with its reason if the page shows the pooled
      endpoint needs neither. Done when staging runs with it
- [ ] O3 — Staging from `main`. Done when two merges in a row are migrated, deployed and
      verified with no dispatch and no session open; then `staging-preview` is deleted, on the
      owner's word. Also the owner's to remove, each on its own word: the branches
      `dns-inspect-docs` and `o9-step-red`, the retired secret `STAGING_DEPLOY_KEY`, and, if
      they still stand, `release-0.1`'s scoped variable and the Neon branch
      `restore-drill-20261114`
- [ ] R20 — The repository's settings, read back from GitHub by a session: fork pull requests
      held for approval, secret scanning with push protection, a read-only default workflow
      token, vulnerability alerts on. One that is off is the owner's to turn on. Done when
      each is recorded in LOG as on
- [ ] P6 — Release gate. Depends on the `staging` status every promotion writes; until P5
      exists a candidate reads not native-verified, and the physical phones' checklist is its
      native evidence (LOG, 2026-11-18, lean automation). Work: a check `release` on a pull
      request into `production`, holding its head to a commit of `main` with `check` passed
      and a successful `staging` status (RULES, Git and CI; the runbook's "Releasing to
      production"), with no secret; `release-readiness.yml` on a candidate; the
      production-tree check; the dependency audit; the manual checklist for physical phones,
      "not performed" by default; O7's readiness assessment of the first candidate. Done when
      a candidate's report names every gate and one with a platform missing reads not
      native-verified
- [ ] R13 — Owner: production set up, in the runbook's order and no other
      (`packages/db/README.md`, "Setting production up"), each step on the owner's own word:
      the ruleset and the GitHub environment `production`; the Neon project on the Launch
      plan, its owner role read for `rolbypassrls` before its first migration; the Clerk
      production instance on the paid plan, on `jpteq.app`, with the development instance's
      settings and its four session claims copied and 30-day sessions; the Vercel project on
      Pro, with ARCHITECTURE's domain layout, its variables for Production alone, the customer
      domain last. Done when the runbook's steps 1 to 5 are each recorded in LOG
- [ ] R9 — Production cutover, each step approved by the owner when it is reached. Depends on
      R13 and P6. The journal migrated into production and proven against a fresh replay (the
      runbook); the first release, by pull request into `production`; D Sierra Painting
      onboarded with its first admin and its invoice counter; the roster invited by phone
      number, after R18; a demonstration company for store reviewers
- [ ] R15 — The production host checked (Stage 6's edge line; ARCHITECTURE, Before the first
      deployment): a burst answered 429; a state-changing request from another origin refused;
      the content security policy and transport security present; the session cookie's
      attributes read, and decided with the identity provider. A session prepares the commands
      and the owner runs them. Done when each is recorded in LOG
- [ ] R10 — Stores (takes Stage 10's store line and Stage 8's distribution line). Depends on
      R8, R9 and R11. Work: EAS production builds, run by the owner; App Store Connect and
      Play Console records, listings, privacy labels and the Data safety form declaring name,
      phone number, location at clock events and diagnostics; reviewer access by R11's path;
      submission to both reviews; TestFlight and the Play closed track opened to the crew once
      the go/no-go line is passed, with crew onboarding in English and Spanish. Play gives
      this account production access only after a closed test with twelve testers opted in for
      fourteen days running (Google's page, read 2026-11-18): the crew's Android users are its
      testers, counted with the partner before the track opens
- [ ] R16 — Owner, with the partner's admin: week one's schedule entered in production before
      the crew starts (LOG, 2026-11-18). With enforcement on, a worker with no shift is
      refused a clock-in. Done when every invited crew member has a shift on their first
      working day, or is known to have none
- [ ] Go/no-go, recorded in LOG with who checked each: production's login role is
      `trader_app`, neither superuser nor `BYPASSRLS`, and a second company's rows cannot be
      read; the staging restore drill timed; R5's done-criterion repeated on the store builds;
      the office corrects an entry, closes a pay period, issues an invoice, receives its PDF
      by email, records a payment and reads it as paid; a forced error from the web and from
      each store build reaches Sentry; sync paused and resumed with `TRADER_SYNC_MODE` and a
      minimum build refused, nothing lost; the public pages live and both store forms
      accepted; a Spanish speaker has read the crew screens; the partner's admin has signed
      the acceptance checklist (R12)

## After Release 0.1 — toward V1 complete

Started once the go/no-go line is recorded as passed, in this order; the pilot runs on Release
0.1 meanwhile (PRD, Pilot and V1 completion). Outside the Automation lines, a line touching
schema, auth, sync, money or CI is planned first and waits (RULES).

### Pilot safety and operations

- [ ] Sign-in address change by an admin (plan first: auth; Stage 6; the first line after the
      release: LOG, 2026-11-18). A bound person's sign-in number or email changed from the
      roster, at the identity provider and in `users` together. Until then it is done by hand
      at the provider and the roster's stored number goes stale (R17). Its plan decides how
      `users.email` and a bound phone number follow the change
- [ ] Weekly feedback loop; defects become tasks here
- [ ] Nightly encrypted `pg_dump` to R2 and weekly restore-verify in Actions, after
      Release 0.1, which runs on Neon's point-in-time restore; timed restore drill; the
      restore creates `trader_app` first
- [ ] Server-enforced sync states (V1-D21; plan first: sync). Depends on Stage 5's contract.
      Work: `sync.push` and `sync.pull` read the state at a transaction boundary — push
      before each record's transaction — and answer one stable retryable result under
      restriction (ARCHITECTURE, Operational sync states); the answer added to the contract.
      Tests: `read_only` refuses push and serves pull; `paused` refuses both;
      `update_required` refuses both for a build below the minimum and serves a compatible
      one; a state change mid-batch returns the completed results and omits the rest; a
      retry after `normal` is accepted or `duplicate`, never lost or doubled; no restricted
      answer is a per-record `rejected`; a client that ignores `status.get` is still stopped
- [ ] `status.get` answers without running the identity adapter; the startup guard also
      checks `session_user` and that every tenant table has its policy
- [ ] Daily delete of expired `sync_diagnostics` lines under Vercel Cron, in every company
      (ARCHITECTURE, rejected-record diagnostics: the writer deletes only its own company's).
      Plan first: the role it runs as, since the application role sees one tenant. Tests: a
      company that writes nothing loses its expired lines; an unexpired line stays. Done
      when no line older than the period survives a day
- [ ] Sentry event tidy-up (found by R3's staging event, 2026-11-13; accepted as it is for
      Release 0.1). Three things reach Sentry that the allow-list in `sentry-event.ts` does
      not name or cannot help: a `user.geo` Sentry derives from the sending server's
      address, a `trace` context the SDK adds after `beforeSend`, and `error_names` holding
      class names the build has shortened (`k>e>DatabaseError`). Work: send
      `user.ip_address` as null so nothing is inferred, drop the trace context where it is
      added, and keep the reported class names readable. Tests: the byte-for-byte event
      tests state the new shape. Done when a forced staging event shows no location, no
      trace context and real class names
- [ ] Approval separation checked on the deployed stack (V1-D10 as amended): an admin's own
      labor carries no approval; a receipt's logger and a correction's submitter are refused
      their own decision; recorded with the partner: who the second active admin is, since
      an office material entry on a closed-out day waits for one
- [ ] Pilot success criteria written with the partner
- [ ] An invitation notice to the person (2026-11-12 invitation at the provider: none is
      sent): what it says, and whether it is an email through Resend, after R7. Until then
      the office tells each person to sign in with their number

### Automation — what follows the release

Permanent: what carries every later merge to staging and every later release to its gate (LOG,
the 2026-11-16 rows). Each line is planned in its pull request and worked without a per-line
approval. Nothing here is paid, touches production, or stores a production value. P4 and P6
are on the track above (LOG, 2026-11-18, lean automation). Done, with them, when two merges in
a row reach staging with no session open, a release candidate's report names every gate, and a
candidate missing a platform reads as not native-verified.

- [ ] P1 — Staging promotion. Still unseen, of its done-criterion: a run for a commit already
      promoted changes nothing; a merge carrying a flagged migration stops before staging
      changes; a dispatch with any other code, or with no earlier rehearsal, is refused, that
      dispatch being the owner's own. Done when each is seen
- [ ] P2 — The browser suite on every promotion, and the readiness report. Still open:
      fixtures ensured through the real procedures, with Clerk test numbers alone — a
      customer, jobs, a crew, a foreman, a worker; one flow each for the schedule, an invoice
      issued and paid, and the payroll CSV; the wall checked on the alias from the Mac;
      `readiness.json`; an issue opened on red and closed on green. Done when a planted red
      flow reports "deployed and failing" and the next green closes it
- [ ] P3 — Staging mail. Still open: one tagged flow that sends an invoice to Resend's test
      inbox, run weekly and for a candidate; the one send seen arriving is R7's. Done when
      that flow's send is recorded as sent on its schedule
- [ ] P5 — Native runner on the Mac. Deferred: no native runner for now, decided at the
      release gate (LOG, 2026-11-17, toolbox). Depends on P4 for the staging smoke, on nothing
      for the local suite. Work: a runner script around `suite.sh` with a report per platform;
      a launchd agent the owner installs, with its statuses-only token; statuses `native/ios`,
      `native/android` and a heartbeat; the watchdog workflow. Done when a night's run posts
      both platforms, and with the agent stopped the watchdog says the runner is offline

### V1 on the phone

Stage 5's open lines beyond the track.

- [ ] Pull extension (V1-D12; plan first: sync). Depends on the contract line and Stage 4's
      assignments. Work: optional protocol-1 fields — coordinates and detection radius of the
      jobs the caller may start on, their customer name, the caller's own dated assignments,
      the approval reasons of the caller's own entries. Tests: the shipped protocol-1 client
      schema still parses the extended snapshot; a worker receives no other worker's
      assignment or reasons, no job outside push authority, no cost or rate; another
      company's data never appears; `protocolVersion` stays 1
- [ ] Photo sync on the server: the `photo` record kind, presigned upload to R2, object key
      assignment, content-type allowlist (no SVG), size limit, upload-state read
      (`@aws-sdk/client-s3` and its presigner in `packages/api`, or the vendor's lighter
      client, chosen on the vendor's page)
- [ ] Materials with receipt photo; job-progress photos with deferred upload
- [ ] Foreman crew-state read: the current session state of the members of crews the caller
      leads, online only
- [ ] Crew labor for a foreman; day closeout: review and submit; material correction
- [ ] Biometric attestation on clock in/out, pause/resume and job switch (Stage 5's clock
      line, what R5 leaves: the clock and the foreground location stamp are R5's)
- [ ] Job suggestion on app open (PRD, Smart Clock-In): one foreground reading, manual
      fallback; physical iOS and Android tests
- [ ] Accessibility pass: screen-reader labels, dynamic type at the largest sizes, 48 pt
      targets, contrast, in both languages
- [ ] Mobile flow suite (Maestro): one flow per crew workflow as its screen lands, selected
      by `testID`; every flow that writes is followed by a server assertion against
      `trader_demo_e2e`, reset before each run; run on the Mac before a release build, not
      in CI
- [ ] O16 — The phone's value imports held by lint (LOG, 2026-11-18, the owner's word on the
      31 sentences): `apps/mobile` imports values from `@trader/api/contract` and
      `@trader/api/eligibility` alone, and lint refuses every other value import of
      `@trader/api`, subpaths included (`eslint.config.mjs`). Done when a test, watched
      failing on a third subpath, is green

### V1 in the office

Stage 7's and Stage 4's open lines beyond the track, and what is left of Stage 6's reporting
line.

- [ ] Credit memos: the procedure and its screens (Stage 7's issue line, what R6 leaves)
- [ ] Credit ceiling and void rule in SQL (V1-D15): the sum of an invoice's memos never
      exceeds its total as issued; an invoice with a memo cannot be voided; the application
      role's UPDATE on `invoice_counters` narrowed to the trigger's path. Tests: a memo one
      cent over is refused and one to the cent accepted; two concurrent memos that together
      exceed the total leave one; a void racing a memo leaves exactly one of them
- [ ] QuickBooks Online invoice CSV (V1-D16, V1-D18): an adapter over the issued snapshot,
      its columns and limits checked on Intuit's current import page. Done when a file of
      real pilot-shaped invoices imports into a QuickBooks Online test company and its
      totals reconcile to TRADER's
- [ ] QuickBooks Desktop invoice IIF (V1-D16, V1-D18): a second adapter over the same
      snapshot, its format checked on Intuit's current IIF documentation. Done when the same
      invoices import into QuickBooks Desktop and reconcile; if no Desktop installation can
      be reached for the test, that is reported to the owner, not assumed to pass
- [ ] Manual entry and reconciliation guidance (V1-D19) on the export screen (DESIGN, Export
      panel): for each edition, what its import does not take — tax configurations, credit
      memos, whatever the two lines above found — with the figures to enter and the totals
      to check. Done when the partner's bookkeeper reconciles one exported batch, a credit
      memo included, from the screen alone
- [ ] Full data export
- [ ] O4 — Office design pass: shared loading and pill, one list editor, tokens for every
      size, a sidebar from 768, search and filter on the lists; a local browser suite with
      axe (`@axe-core/playwright`, consumer: `apps/web/e2e-local`). Done when every route is
      clean at 390, 768 and 1280
- [ ] Office lists: search and an active/all filter on roster, customers and crews; filter
      state in the URL; a refusal names the field it is about
- [ ] One browser smoke test of the pay period end to end at 390 and 1280 against the demo
      fixture, run in CI (`@playwright/test` in `apps/web`)
- [ ] PostHog; structured request logs carrying the request id (Stage 6's reporting line, what
      is left)

### Smart Clock-In arrival reminders

Stage 9.

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

### V1 complete

Stage 8's release gates are V1-D17's; the go/no-go line replaced them for Release 0.1 alone
(LOG, 2026-11-12). Then Stage 10.

- [ ] Release gates, automated: `check` green on the release commit; the gate inventory
      passes; the journal replays into an empty database; the browser smoke test passes at
      390 and 1280; the last restore-verify run passed
- [ ] Release gates, technical, checked on the deployed stack: the login role is `trader_app`
      with neither superuser nor `BYPASSRLS`; timeouts and pool limits in force; no
      development-identity route reachable; rate limits live; Sentry events inspected for PII
- [ ] Release gates, human: an airplane-mode day on one physical iPhone and one physical
      Android phone, with the server's duplicate and rejection counts recorded; sign-in
      by SMS code on both, and by email code in the office; a Spanish-language pass at large
      type sizes; a timed restore drill on the production database's backup; the partner
      walks one real pay period, closed with an entry still pending and its adjustment in the
      next, and one invoice exported for the edition they run; every roster row's sign-in address
      confirmed (Stage 6); sync paused and resumed on both phones with nothing lost
- [ ] Production on the App Store and Google Play, US storefronts only: both reviews passed,
      and Play's production access granted after its closed test (R10 submits; Play requires
      the test of this account)
- [ ] Acceptance checklist drafted from PRD's V1 features, walked with the partner, signed
- [ ] First invoice to the partner — issued through TRADER

## Overhaul and upkeep — frozen until the go/no-go line

The owner's mandate of 2026-11-17, and what keeps the repository and its sessions in order.
Frozen until the go/no-go line is recorded as passed (LOG, 2026-11-18); O5 and O3 are on the
track. Each O line is one pull request, planned in its description and merged once `check`
is green.

- [ ] O11 — The two hooks, and always-loading the four connectors on the owner's machine:
      a hook on Bash that answers a raw vendor command with the wrapper or connector to
      use, and one on `git commit` that refuses until `pnpm check` has passed on the
      staged tree. Done when each hook is watched refusing and each connector answers
      with no search first
- [ ] O10 — MEMORY.md reshaped, package notes to `.claude/rules/`, `CLAUDE.md`'s duplicate
      removed, the byte budget: MEMORY as Now, Context and Notes; a rules file per package
      with `paths:`; the session protocol stated once, in RULES; `check` fails when
      `CLAUDE.md`, RULES.md and MEMORY.md together pass 40 KB. Done when one rules file is
      watched loading on a matching file, then the other three, and the budget is watched
      red
- [ ] O1 — Toolbox. Still unseen in a session: Cloudflare's documentation connector answering
      a known read; the upgraded `eas-cli`; the pinned Playwright connector; the Audit
      workflow's first run on its schedule. Done when each tool answers a known read and each
      new rule is watched refusing
- [ ] Staging tools (by the owner, 2026-11-14). Still open: RULES, Toolbox, names the job of
      Clerk's connector — it reads, asks before it changes the development instance, and never
      creates an application or a production instance (LOG, 2026-11-17, toolbox). Done when
      the Toolbox says so
- [ ] Staging autonomy (by the owner, 2026-11-14). Still open, of its done-criterion: the
      owner has seen a command that must ask, ask; the test people P7 makes at Clerk are the
      next such. Done when an allowed staging command runs unprompted, a destructive one
      prompts, a production one is refused, and the documents state the rule
- [ ] Owner — Claude Code connectors, each the vendor's own with browser sign-in: of the Expo
      plugin, Vercel, Neon read-only, Clerk, Sentry and Resend, those that do not yet answer
      in a session. Cloudflare's is its documentation connector alone (LOG, 2026-11-17,
      toolbox). Consumer: reading staging instead of screenshots; production is read by the
      owner (RULES, Toolbox). No connector for either store: none is published by Apple or
      Google
- [ ] O9b — The decision rows with no home: each row in force that no line of PRD, ARCHITECTURE, RULES or DESIGN states (the list in O9's pull request) written into the section the match names, and the rows the match marked partial completed. It changes words in decided documents: plan first. Done when a second match finds a home for every row in force. The wording for the 31 withheld sentences is the 2026-11-18 O15 bullet's (LOG, the owner's word on the 31 sentences)
- [ ] O12 — Code residue, the audit's H6 to H8 and L2 to L8. Done when each item is closed
      or struck with its reason and `pnpm check` is green
- [ ] O13 — The snapshots: `0000` to `0048` deleted in a pull request of their own, after
      the audit's experiment is repeated on this machine; RULES gains "only the newest
      snapshot is kept". Done when a generate with the newest snapshot alone emits nothing
- [ ] Remove the audit's one exception (`pnpm-workspace.yaml`, `audit.ignore`,
      GHSA-fc5q-39xc-vjpf) and hold `picomatch` at its fixed release by override, consumer:
      the Audit workflow. Done when the registry publishes the fix and `pnpm audit` is
      clean of it with no exception
- [ ] Repository hygiene: a sweep of leftover `trader_t_*` test databases in the suites'
      global setup; `seed.test.ts` in a database of its own (Stage 6; Actions are pinned by
      commit, and vulnerability alerts are R20's)
- [ ] Carry-over cleanups, each when its file is next touched: `row N` and `D1–D6` comment
      citations replaced by date and subject; `job.ts`'s
      erased literal type; the `pay-rates.ts` currency default

## Parked

One line an idea. Nothing here is planned or worked until the owner moves it up.

Nothing yet.

## Stages

The stages keep their numbers and their done-criteria. Their open lines stand in the list
above, where each entry says.

- **Stages 0 to 3** — repo rebuild, development environment, data foundation (`packages/db`),
  API (`packages/api`). Done; their lines are in [LOG.md](LOG.md) under 2026-11-17, and Stage
  0's last under 2026-11-18.
- **Stage 4 — Office API and web (`apps/web`).** Done when an admin, on a phone and on a
  desktop, runs a pay period end to end locally: roster, jobs, assignments, approvals, a
  closeout, close, export. Open: the full data export, the office lists and the browser smoke
  test, under V1 in the office; the carry-over cleanups, under upkeep.
- **Stage 5 — Field app (`apps/mobile`).** Done when a worker tracks a real day across
  airplane-mode gaps on a physical phone and the office sees correct, deduplicated hours per
  job. Open: on the track, R5, S8 and O5; the rest under V1 on the phone.
- **Stage 6 — Accounts, deploy, operations.** Done when the deployed stack serves a physical
  phone over the internet, a restore drill has passed, and Sentry shows no PII. Every item
  under "Before the first deployment" in ARCHITECTURE.md is one of its lines. Open: on the
  track, R13 to R15, R17, R18 and R20; under pilot safety, the address change, the nightly
  backup, the enforced sync states, `status.get` and the guard, the daily delete and the
  invitation notice; PostHog and the request logs under V1 in the office; repository hygiene
  under upkeep.
- **Stage 7 — Invoicing and exports.** Done when the office issues an invoice from a completed
  job, exports it for QuickBooks Online and for QuickBooks Desktop, and the number continues
  the partner's series without a gap. Open: on the track, R7; credit memos and both exports
  under V1 in the office.
- **Stage 8 — Pilot.** Done when the pilot success criteria, written with the partner, are
  met. The whole crew starts together, on Release 0.1's go/no-go line (LOG, 2026-11-12); no
  smaller first group is required. Open: on the track, R8, R10 and the go/no-go line; under
  pilot safety, the feedback loop, the approval separation and the success criteria; V1-D17's
  release gates under V1 complete.
- **Stage 9 — Smart Clock-In arrival reminders.** Done when, on physical iOS and Android
  phones, an activated employee is reminded on arrival inside the work window and never
  outside it, the privacy release gate holds, and the office sees ordinary clock events (PRD,
  Smart Clock-In). Open: its five lines.
- **Stage 10 — V1 complete.** Done when the partner signs the acceptance checklist and the
  first invoice to the partner goes out. Open: its three lines, under V1 complete.

## After V1 (unscheduled)

Push notifications and web approval by push · SMS notifications · roster self-service beyond own name and phone
· audit log of every write beyond the V1 actions · dark theme · per-company logo (additive
`companies` column, upload, shown in crew app and office header) · second contractor onboarding
· payment processing · customer portal · PowerSync re-evaluation · ledger checkpointing if replay cost is
ever measured as a problem · periodic location-sampling experiment (separate owner approval).
