# TRADER — Tasks

The build order and what is done: every line between here and a deployed V1. Stages are
dependency-ordered; a stage starts when the one before it is done, except where a stage says
it may overlap. No dates. A task is ticked when its done-criterion holds, not when the code
exists. A line marked **decide** ends in a decision row in ARCHITECTURE.md, not in code.
**Current work: the Release 0.1 track**, taken ahead of the open lines of Stages 4 to 10.

## Overhaul — toolbox, cleanup, staging from `main`

The owner's mandate of 2026-11-17, worked in batches beside the Release 0.1 track; each batch
is one pull request, planned in its description. Its decisions (two permanent branches,
staging deployed from `main` by a deploy hook, no native runner for now) are written into
ARCHITECTURE by the batch that enacts them. Phone scope stays the PRD's.

- [ ] O0 — The migration backlog `0040` to `0049` applied by the owner's dispatch before
      anything else merges, with Clerk's test mode off and the suite's three `E2E_*`
      variables set first. Done when staging is at the journal, the host names `main`'s
      commit and the browser suite is green there
- [ ] O1 — Toolbox: `.claude/settings.json` shared rules and three project skills; a
      dependency audit and a secret scan as a workflow beside CI; Clerk's connector under
      rules; the DNS wrapper's read-only `inspect`; Cloudflare's documentation connector;
      consumer: every later batch. Done when each tool answers a known read and each new
      rule is watched refusing
- [x] O2 — Reliability and cleanup: the two flaky material tests, the roster import cycle,
      one receipt-standing read, the retired screen's strings, the README. Done when
      `pnpm check` is green five times running
- [ ] O3 — Staging from `main`: the promotion workflow deploys by Vercel's deploy hook and
      pushes no branch; a readiness summary and a commit status per run (P2). Done when two
      merges in a row are migrated, deployed and verified with no session open; then
      `staging-preview` and `release-0.1` are deleted, each on the owner's word
- [ ] O4 — Office design pass: shared loading and pill, one list editor, tokens for every
      size, a sidebar from 768, search and filter on the lists; a local browser suite with
      axe (`@axe-core/playwright`, consumer: `apps/web/e2e-local`). Done when every route is
      clean at 390, 768 and 1280
- [ ] O5 — Phone polish inside Release 0.1: tab icons, own profile, accessibility labels,
      Spanish layouts measured, Clerk sign-in on Android, `eas.json` (with P4)
- [ ] O6 — Staging acceptance: R7's one send, the fixture tenants, S9, R8's pages
- [ ] O7 — Production prepared, not created: P6's gate, the owner's setup list in the
      database runbook, the readiness assessment

## Release 0.1 — first production release

Done when the go/no-go line is recorded as passed and D Sierra Painting's crew is on the
store builds (ARCHITECTURE, the 2026-11-12 Release 0.1 rows). Lines are ordered by
dependency; R4 to R5 and R6 to R7 may run beside each other, S1 to S6 beside R4, and the
owner's lines beside R1. Each line is planned in its pull request and worked without a
per-line approval (ARCHITECTURE, 2026-11-15, autonomous execution), and names the packages
it installs here before they are installed. A line that takes a stage's line ticks it there.
Staging and production are separate databases and identity instances throughout; nothing
paid is created and no production migration runs without the owner's approval of that step.

- [x] R0 — Documents: the Release 0.1 decision rows, PRD Access, Invoicing and the release
      definitions, this track. Documents only
- [ ] Owner — accounts, checked before anything is created (no secret enters the repository
      or a session): whether an Expo account or project, an App Store Connect record, a Play
      Console record and a Sentry organization already exist for TRADER; the Play account's
      creation date, which decides whether a closed test precedes production; the
      `jpteq.app` zone active in Cloudflare. Then: a Neon project with production and
      staging branches; a Clerk application with SMS and email codes, invitation-only; a
      Vercel project rooted at `apps/web` with production and preview environments; the
      Resend sending domain. Done when each is reported as existing or created
- [ ] Owner — Claude Code connectors, each the vendor's own with browser sign-in: the Expo
      plugin; Vercel; Neon, read-only; Clerk; Cloudflare; Sentry; Resend. Consumer: reading
      the deployed stack in R3, R9, R10 and the go/no-go line instead of screenshots. No
      connector for either store: none is published by Apple or Google
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
- [ ] PRD Access brought into line with the sign-in decisions (documents only; the wording
      is the owner's). PRD says an office admin is invited by their own email address; since
      the 2026-11-12 row "A sign-in number on every new invitation" every invitation requires
      a number and takes an email beside it. Done when PRD Access and its summary sentence
      state the rule the decision row states
- [x] Toolbox (documents only; plan first). A "Toolbox" section in RULES with its row in the
      home table, and the lines in `CLAUDE.md` that point to it: how a session discovers its
      tools, which tool is preferred for which job, what a vendor tool may read and may
      never write, how a tool is upgraded, and how one is verified before it is relied on.
      Consumer: every session that reads the deployed stack. No new document
- [ ] `.claude/settings.json` committed with a deny list for the vendor tools that write or
      read a secret (plan first: it changes what a session can do). Depends on the Toolbox
      line. Consumer: Claude Code in this repository. Done when a denied tool is refused in
      a new session and a read tool still answers
- [x] Staging operator access (plan first: it changes what a session can do). The staging
      owner's connection string in the macOS Keychain, used through two wrappers kept
      outside the repository — one runs `onboard` and `psql` against staging as the owner,
      one makes and deletes test users on Clerk's development instance — and the Vercel
      CLI, for `vercel redeploy` of a Preview alone; every use is prompted. Consumer: R3's
      staging acceptance, then the checks of R9 and R10. Production has none of it. Done
      when a denied command is refused, a prompted one runs against staging, and the
      runbook and a decision row state the rule
- [ ] Sentry event tidy-up (found by R3's staging event, 2026-11-13; accepted as it is for
      Release 0.1). Three things reach Sentry that the allow-list in `sentry-event.ts` does
      not name or cannot help: a `user.geo` Sentry derives from the sending server's
      address, a `trace` context the SDK adds after `beforeSend`, and `error_names` holding
      class names the build has shortened (`k>e>DatabaseError`). Work: send
      `user.ip_address` as null so nothing is inferred, drop the trace context where it is
      added, and keep the reported class names readable. Tests: the byte-for-byte event
      tests state the new shape. Done when a forced staging event shows no location, no
      trace context and real class names
- [ ] Staging autonomy (plan first: it changes what a session can do; by the owner,
      2026-11-14). On staging, routine work that destroys nothing is Claude Code's without
      a prompt: the application role's connection, onboarding, test users, a preview's
      redeploy and its non-secret variables, the feature branch's push and its pull
      request. A destructive step, a test fixture's cleanup included, is approved one at a
      time; production has none of it. Work: the wrappers and rules outside the repository,
      RULES (Git and CI, Session protocol), `CLAUDE.md`, the database runbook,
      `.env.example`, the decision rows. Consumer: R3's acceptance, then the staging checks
      of R4 to R10. Done when an allowed staging command runs unprompted, a destructive one
      prompts, a production one is refused, and the documents state the rule
- [ ] Staging tools (by the owner, 2026-11-14), each at a version read from its registry
      and pointed at staging alone: the Neon CLI, through a key scoped to the staging
      project (consumer: branch work, then the restore drill); the Clerk CLI and Clerk's
      MCP server, on the development instance (consumer: reading the instance's settings,
      test users); the Sentry CLI, with a read token (consumer: reading events from a
      shell; releases at R9). Done when each answers one read against staging and the
      Toolbox section names it
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
- [ ] S6 — Weekly Schedule office screen (DESIGN, Weekly Schedule; replaces
      `/assignments`). Depends on S3 and S5. Work: the screen on the reviewed prototype's
      fourth revision with DESIGN's refinements; the detailed interaction of the drawer
      overlay and of employee navigation on a phone, decided in this line's plan. Done
      when an admin plans, overrides, copies and undoes a week by keyboard at 390, 768,
      1024 and 1280 with about 24 people, no control under its target, no sideways page
      scroll, a refused circular choice said in words, a locked shift read-only, and one
      pass with a screen reader
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
- [ ] Public staging host for the phones (2026-11-15 row; 2026-11-16, it serves
      `staging-preview`). Depends on the edge line. Seen on 2026-11-16 at the commit of
      2026-11-15's merge: readiness 200 with no bypass. Done
      when the host serves `staging-preview` with no bypass, a call without a session is 401,
      another company's rows are refused, a worker is refused the office, a burst is 429,
      and every other Preview still answers 302; or the exemption is reported unavailable
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
- [ ] R5 — Field app, time tracking (plan first: sync; takes Stage 5's pull extension,
      sign-in, outbox, offline evidence, clock, job list and history, sync states and own
      profile lines, less biometrics, the job suggestion and pause/resume if the plan
      leaves it out). Depends on R2 and R4. Done when a worker on a physical iPhone and a
      physical Android phone signs in by SMS code, clocks in on an assigned job, switches
      jobs and clocks out across an airplane-mode gap, and the office shows the hours once,
      per job
      Installs, in `apps/mobile`, at the versions `expo install` chooses for SDK 58:
      `expo-sqlite`, consumed by the device store and outbox, with `drizzle-orm` at the
      workspace's own range over it; `expo-crypto`, by the UUIDv7 minter's random bytes;
      `expo-location`, by the foreground location stamp; `expo-secure-store` and
      `@clerk/expo` (registry read 2026-11-15: 4.16.1), by the SMS-code sign-in and its
      token cache; `react-dom` at the app's own React version, consumed by `@clerk/react`
      inside it, which requires one and otherwise resolves the office's.
      Built so far (2026-11-15), on the development sign-in: the device store and outbox,
      the sync cycle and its states, offline evidence, the location stamp, the clock with
      breaks and a job switch, own hours, both languages, and the flow suite green on the
      iOS simulator and the Android emulator; the SMS-code sign-in screen and the
      provider's token on every call, seen on the iOS simulator on 2026-11-16 against
      Clerk's development instance and a local API with its origin list set: a sign-in
      by code, the bind, the session kept across relaunches, a clock-in and clock-out
      stored. Still open: the same on Android and on a deployment, own profile, and the
      done-criterion on two physical phones.
- [x] S7 — Scheduled shift on the phone's clock (plan first: sync). Depends on R4, R5 and
      S4; it takes none of R5's lines and adds to its clock and pull. Work: the caller's
      own shifts and their eligible hours in the pull; under enforcement the clock offers
      the eligible jobsite alone, or says to ask the office; a start the server stored for
      review or refused, shown as what it is; English and Spanish; a `testID` on every
      control. Tests: Maestro flows on the iOS simulator and the Android emulator; a
      worker receives no other person's shift
- [ ] S8 — The worker's own week, and a schedule gone stale (DESIGN, Own history). Depends
      on S7. Work: the caller's shifts for the week, read-only, from the last pull, with
      how old that pull is; a schedule the office changed while the phone was offline.
      Done on a physical iPhone and a physical Android phone across an airplane-mode gap
- [ ] S9 — Schedule enforcement, rollout acceptance. Depends on S4 and S6 to S8. The
      switch on for staging alone; the browser suite; both physical phones; refusals and
      error reports read after. Done when the owner's approval to turn it on in
      production is recorded in MEMORY, or withheld; production's setting is the owner's
- [x] R6 — Invoices (plan first: money; takes Stage 7's drafting and issue lines, less
      credit memos). Work: draft, lines priced by the admin, tax, issue with gap-free
      numbering continuing the partner's series, void; the office screens. Tests as those
      two lines state them
- [ ] R7 — Invoice PDF, payments and delivery (plan first: schema, money; takes Stage 7's
      PDF line). Built so far (2026-11-15): recorded payments with reversal, what is owed,
      the void rule, the plain CSV of issued invoices, the PDF made on demand with its
      button on the invoice page, and its email through a mailer seam with each send
      recorded and the allow-list; still open: one send seen arriving, which needs the
      Resend domain, key and an approved recipient on staging. Depends on R6 and the Resend domain. Work: the PDF from the issued
      snapshot; recorded payments and the derived amount owed; the PDF sent by email with
      each send recorded. Tests: a payment changes no invoice row; payments never total
      more than the invoice unless the plan allows an overpayment and says how it reads;
      a void invoice takes no payment; a failed send records its failure and can be sent
      again; another company's invoice is FORBIDDEN on every procedure. Also the plain CSV
      of issued invoices (2026-11-15 scope row), its totals equal to the list's; on
      staging a send goes only to an address the deployment's allow-list names
      Installs `pdf-lib` in `packages/api` (registry read 2026-11-15: 1.17.1, pure
      JavaScript with its standard fonts inside, so it needs no file at run time under
      Next's bundling), consumed by `invoices/pdf.ts`. The email goes to Resend's HTTP API
      with `fetch`: no mail package.
- [ ] R8 — Public pages and account deletion (plan first: auth; takes Stage 8's privacy
      line). Work: privacy policy, terms, support and the deletion request on the apex;
      the deletion request in the app's profile; deactivate-and-pseudonymize as an
      admin-confirmed action. The policy's text is the owner's to supply or approve
- [ ] R9 — Production cutover, each step approved by the owner when it is reached: the
      journal migrated into production; D Sierra Painting onboarded with its first admin
      and its invoice counter; the roster invited by phone number; a demonstration company
      for store reviewers
- [ ] R10 — Stores (takes Stage 10's store line and Stage 8's distribution line). Work: EAS
      production builds; App Store Connect and Play Console records, listings, privacy
      labels and the Data safety form declaring name, phone number, location at clock
      events and diagnostics; reviewer access, how a reviewer passes the SMS code checked
      on Clerk's page first; TestFlight and the Play closed track opened to the crew;
      submission to both reviews
- [ ] Go/no-go, recorded in MEMORY with who checked each: production's login role is
      `trader_app`, neither superuser nor `BYPASSRLS`, and a second company's rows cannot
      be read; the staging restore drill timed; R5's done-criterion repeated on the store
      builds; the office corrects an entry, closes a pay period, issues an invoice,
      receives its PDF by email, records a payment and reads it as paid; a forced error
      from the web and from each store build reaches Sentry; sync paused and resumed with
      `TRADER_SYNC_MODE` and a minimum build refused, nothing lost; the public pages live
      and both store forms accepted; a Spanish speaker has read the crew screens; the
      partner's admin has signed the acceptance checklist

Left where they are until this track is done: every other open line of Stages 4 to 10.

## Automation — promotion, tests and release gates

Permanent, and not Release 0.1's alone: what carries every later merge to staging and every
later release to its gate (ARCHITECTURE, the 2026-11-16 rows). Lines are ordered by
dependency, each planned in its pull request and worked without a per-line approval. It runs
beside the Release 0.1 track and gives that track's staging and device lines their evidence.
Nothing here is paid, touches production, or stores a production value. Done when two
merges in a row reach staging with no session open, a release candidate's report names
every gate, and a candidate missing a platform reads as not native-verified.

- [x] P0 — Documents and reconciliation: the 2026-11-16 decision rows; RULES (Git and CI,
      Toolbox); this section; the Expo project's id and owner in `apps/mobile/app.json`;
      the staging host's origin added to `staging-preview`'s `CLERK_AUTHORIZED_PARTIES`.
      Documents and configuration only
- [ ] P1 — Staging promotion (plan first: CI, and it changes what moves staging). Work:
      `.github/workflows/promote-staging.yml`, started by a passed `check` on `main` or
      by hand in a rehearse-only mode; the preflight; a reading of pending migrations
      that flags a DROP, a TRUNCATE, a DELETE or UPDATE without a key, a REVOKE, a role
      change and a NOT NULL column without a default; the rehearsal and its schema
      comparison against a fresh replay; the migration; the fast-forward; the wait on
      GitHub's deployment record; the deployed commit in `/api/ready`'s answer; every
      action in every workflow pinned by commit; the browser suite on staging's public
      host with no bypass. No tool and no package is installed: the schema comparison
      reads the catalog through `pg`, which `packages/db` already has. Tests: the
      migration reading, red on a planted DROP; the plan, for every way it can be asked;
      the readiness answer. A promotion
      started by a merge migrates only when every pending migration is past the owner's
      gate (`0049`, the backlog of 2026-11-16) and the reading flags none of them;
      otherwise it rehearses, reports and stops before staging changes, and the
      migration runs only on a dispatch by the repository's owner that carries the
      approval code an earlier run's report printed for that commit and those
      migrations' contents, the rehearsal branch already at the journal; each migrator
      string is held to its stated endpoint; `drizzle-kit` refuses a deployed database
      without a stated purpose; the development identity is refused on one
      (ARCHITECTURE, 2026-11-16, promotion safeguards); the browser suite signs in with
      single-use Clerk tickets made in a step of their own (2026-11-16, staging sign-in
      by ticket). No GitHub environment beyond `staging` is used
      for it. The backlog, `0040` to `0049`, is rehearsed and its results and risks put
      to the owner first; a session never makes that dispatch. Done when a rehearse-only
      run is green and its report is with the owner; then, on the owner's dispatch,
      staging stands at the journal's count with its host serving `main`'s commit and
      the suite green; a run for a commit already promoted changes nothing; a merge
      carrying a flagged migration stops before staging changes; and a dispatch with
      any other code, or with no earlier rehearsal, is refused
- [x] The browser suite refuses to run untold (ARCHITECTURE, 2026-11-16, shared
      database): `E2E_COMPANY_ID`, `E2E_ADMIN_PHONE` and `E2E_WORKER_PHONE` have no
      default; with one unset the ticket step makes no ticket and the suite loads no
      test. Done when each is watched refusing in `e2e-tickets.test.ts`
- [ ] Fixture tenants on the shared database (ARCHITECTURE, 2026-11-16, shared
      database). The code is ready: the browser flow holds its admin to
      `E2E_COMPANY_ID` before its first write and its worker to the same company
      (seen green on staging's alias, and red on a wrong id with nothing written). The
      onboarding depends on P1's first promotion: `onboard` and the roster's invitation
      run `main`'s code, which needs the journal's schema. Work then: `R3 Staging Co`
      stays the browser suite's and nothing else's; one company for the phone flows and
      one for development by hand, through the owner-role wrapper's `onboard` and the
      office's own invitations, each with identities no other company holds — fictional
      numbers ending `0100`–`0109` for the browser suite, `0110`–`0119` for the phone
      flows, `0120`–`0129` for development by hand. Nothing is deleted and no destructive
      test runs there. Done when the three companies exist, each signs in as its own
      people, and a read as `trader_app` under each company's setting counts no row of
      the other two
- [ ] P2 — The browser suite on every promotion, and the readiness report. Depends on P1.
      Work: fixtures ensured through the real procedures, with Clerk test numbers alone —
      a customer, jobs, a crew, a foreman, a worker; one flow each for the schedule, an
      invoice issued and paid, and the payroll CSV; the wall checked on the alias from
      the Mac; `readiness.json`, the
      `staging` status on the commit, an issue opened on red and closed on green. Done
      when a planted red flow reports "deployed and failing" and the next green closes it
- [ ] P3 — Staging mail (takes R7's open half). Depends on the owner's Resend domain and
      key. Work: the DNS wrapper, watched refusing a name it does not own; the
      subdomain's records; `MAIL_FROM` and `INVOICE_EMAIL_ALLOWLIST` on the Preview; one
      tagged flow that sends an invoice to Resend's test inbox, run weekly and for a
      candidate. Done when the domain reads verified, that send is recorded as sent, and
      the owner has seen one message arrive
- [ ] P4 — Preview builds (takes the device builds' line; plan first: CI). Depends on the
      owner's Expo token and first credentials. Work: `eas.json` with development,
      preview, preview-simulator and production profiles; the build number from EAS in
      place of the constant in `config.ts`; the API's address as a preview variable; a
      workflow that builds a candidate or a named commit and skips an unchanged native
      fingerprint; a Maestro sign-in part for Clerk's test number. Tools on the runner:
      `eas-cli`, at a version read from its registry, consumed by that workflow. The
      production profile is never run by automation. Done when one commit has an APK and
      a simulator build and the smoke flow signs in to staging on both
- [ ] P5 — Native runner on the Mac. Depends on P4 for the staging smoke, on nothing for
      the local suite. Work: a runner script around `suite.sh` with a report per platform;
      a launchd agent the owner installs; statuses `native/ios`, `native/android` and a
      heartbeat; the watchdog workflow. Done when a night's run posts both platforms, and
      with the agent stopped the watchdog says the runner is offline
- [ ] P6 — Release gate. Depends on P2 and P5. Work: RULES' rule for `production` (Git
      and CI); `release-readiness.yml` on a
      candidate tag; the production-tree check; the dependency audit; the manual
      checklist for physical phones, "not performed" by default. Done when a candidate's
      report names every gate and one with a platform missing reads not native-verified
- [ ] Isolated identity before production (ARCHITECTURE, 2026-11-17, `main` worked
      autonomously). Depends on nothing; blocks the first production deployment. Work: a
      GitHub App or its equal for sessions, with contents and pull requests on this
      repository and no administration, environments or secrets; the owner's CLI token
      and account SSH key out of a session's reach; `production`'s branch and
      environment admitting the owner alone. Done when, from a session, a production
      dispatch, a settings change and a push to `production` are each watched refused
      by GitHub
- [ ] Owner — each when its line reaches it: merge #117 and each line's pull request;
      the GitHub environments `staging` and, at P6, `production`, and no other, with
      their secrets and variables (`STAGING_MIGRATOR_URL`, `REHEARSAL_MIGRATOR_URL`, a
      write deploy key as `STAGING_DEPLOY_KEY`, the host as the secret `STAGING_URL`,
      later the Expo token; the two endpoint ids `STAGING_ENDPOINT_ID` and
      `REHEARSAL_ENDPOINT_ID`), fork pull requests held for approval, secret
      scanning with push protection, a read-only default token; a compute on the
      rehearsal branch; the DNS wrapper installed; the Resend subdomain, its
      sending-only key, and `RESEND_API_KEY` on the Preview; the Expo token, the first
      iOS ad hoc credentials and device, the first Android keystore and its fingerprint
      at Clerk; the launchd agent and its statuses-only token; `production`, its
      ruleset, and the production project's settings. Each a separate approval:
      `release-0.1` and its scoped variable deleted, `restore-drill-20261114` deleted; and before any
      release, the owner's own test of staging after the automated checks

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
- [ ] Full data export
- [ ] Office lists: search and an active/all filter on roster, customers and crews; filter
      state in the URL; a refusal names the field it is about
- [ ] One browser smoke test of the pay period end to end at 390 and 1280 against the demo
      fixture, run in CI (`@playwright/test` in `apps/web`)
- [ ] Carry-over cleanups, each when its file is next touched: `row N` and `D1–D6` comment
      citations replaced by date and subject; `job.ts`'s
      erased literal type; the `pay-rates.ts` currency default

## Stage 5 — Field app (`apps/mobile`)

Done when a worker tracks a real day across airplane-mode gaps on a physical phone and the
office sees correct, deduplicated hours per job. May overlap Stage 6.

- [x] Client-safe contract: the sync, status and rejection-code schemas in
      `packages/api/src/contract/`, importing only zod, exported as `@trader/api/contract`;
      database enums restated there and pinned to the schema by a test; lint forbids any
      other value import from `@trader/api` in `apps/mobile`
- [ ] Pull extension (V1-D12; plan first: sync). Depends on the contract line and Stage 4's
      assignments. Work: optional protocol-1 fields — coordinates and detection radius of the
      jobs the caller may start on, their customer name, the caller's own dated assignments,
      the approval reasons of the caller's own entries. Tests: the shipped protocol-1 client
      schema still parses the extended snapshot; a worker receives no other worker's
      assignment or reasons, no job outside push authority, no cost or rate; another
      company's data never appears; `protocolVersion` stays 1
- [ ] Foreman crew-state read: the current session state of the members of crews the caller
      leads, online only
- [ ] Photo sync on the server: the `photo` record kind, presigned upload to R2, object key
      assignment, content-type allowlist (no SVG), size limit, upload-state read
      (`@aws-sdk/client-s3` and its presigner in `packages/api`, or the vendor's lighter
      client, chosen on the vendor's page)
- [ ] Xcode with the iOS Simulator (Mac)
- [ ] Android Studio with one emulator (Mac)
- [x] Maestro CLI and its MCP server on the Mac, Java from Android Studio's bundled runtime;
      consumer: the flows in `apps/mobile/.maestro/`. Done when the MCP lists the local
      devices and returns a screenshot of a booted simulator and of the emulator
- [ ] Expo app with a development build; `app.jpteq.trader`; theme module from DESIGN.md; app
      icon, adaptive icon and splash from `assets/brand/` (asset specs checked on docs.expo.dev)
- [ ] Development sign-in on the device behind the identity seam (plan first: auth): the two
      development headers, absent from a release build; a `testID` on every control; one
      Maestro smoke flow that launches the build, signs in as the demo foreman against
      `trader_demo_e2e` and reads the job list, on the iOS simulator and the Android emulator
- [ ] i18n layer with English and Spanish catalogs; every crew string through it; layouts
      measured with the Spanish strings
- [ ] Sign-in on the device: the identity provider's Expo SDK, token storage in the secure
      store, the token on every API call; capture never waits on a session
- [x] `expo-sqlite` store through Drizzle; outbox; sync cycle with coalesced triggers and
      reclamation; `ended` before `started` on a job switch; a rejected record kept, shown as
      needing attention, never retried. Tests: a duplicate send and a dropped response leave
      one row on the server and one settled record on the phone; a record omitted from a
      response is retried under the same id
- [ ] Offline capture evidence (V1-D02; plan first: the reachability reading and its
      staleness bound). Work: the device keeps the last confirmed API reachability reading;
      capture reads it and never probes or waits; unknown, absent or stale records
      `captured_offline` true. Tests: capture returns with the network stack stalled; a fresh
      reading records false and a stale or missing one true; an entry captured online and
      uploaded late stays false and is flagged by the server's receipt check instead
- [ ] Clock in/out, pause/resume, job switch with biometric attestation and the foreground
      location stamp
- [ ] Job list, own history and own assignments (V1-D11; DESIGN, Own history), status pills
      and sync banner; a wrong-clock warning when a push reports skew; a `time_in_future`
      refusal shown as needing attention with what to do
- [x] Sync states on the device (V1-D21): a fresh `status.get` before each cycle; under
      `read_only`, `paused`, `update_required` or the server's restricted answer the outbox,
      ids and records are kept and nothing is marked rejected or failed; sync resumes on
      `normal`. Tests: each state entered mid-backlog and left again delivers every record
      once
- [ ] Job suggestion on app open (PRD, Smart Clock-In): one foreground reading, manual
      fallback; physical iOS and Android tests
- [ ] Own profile: name and contact phone
- [ ] Materials with receipt photo; job-progress photos with deferred upload
- [ ] Crew labor for a foreman; day closeout: review and submit; material correction
- [ ] Accessibility pass: screen-reader labels, dynamic type at the largest sizes, 48 pt
      targets, contrast, in both languages
- [ ] Mobile flow suite (Maestro): one flow per crew workflow as its screen lands, selected
      by `testID`; every flow that writes is followed by a server assertion against
      `trader_demo_e2e`, reset before each run; run on the Mac before a release build, not
      in CI

## Stage 6 — Accounts, deploy, operations

Done when the deployed stack serves a physical phone over the internet, a restore drill has
passed, and Sentry shows no PII. Every item under "Before the first deployment" in
ARCHITECTURE.md is a line here.

- [x] **decide** Neon owner role: checked for `rolbypassrls` on the role itself; if absent, a
      decision covering the migrator-as-owner, onboarding and `pg_dump` under forced RLS
- [ ] A sign-in address for every person on the roster (2026-11-12 Release 0.1 sign-in): the
      roster checked with the partner, each crew member's own mobile number and each
      admin's own email recorded before their invitation; no shared number or address. Done
      when every roster row to be invited has a distinct one its owner has confirmed
- [ ] Clerk production instance (Release 0.1, R9; owner): the paid plan, the instance on
      `jpteq.app` with its DNS records, the development instance's settings and its four
      session claims copied, 30-day sessions, production keys and
      `CLERK_AUTHORIZED_PARTIES` in the deployment. The adapter, the sign-in and the
      invitation are R2's. Still to decide: how `users.email` and a bound phone number
      follow a changed sign-in address
- [ ] An invitation notice to the person (2026-11-12 invitation at the provider: none is
      sent): what it says, and whether it is an email through Resend, after R7. Until then
      the office tells each person to sign in with their number
- [ ] Neon Launch project; `trader_app` created in SQL and used as the login role; the
      journal replayed as it stands, with a schema diff against a fresh local replay proving
      nothing hand-written was lost (ARCHITECTURE, 2026-11-12 deployed database path)
- [ ] Environments: production and preview with separate databases and identity instances;
      the environment validated at start; a readiness check that touches the database and
      asserts the role
- [ ] Vercel Pro project on `jpteq.app` with the domain layout; Vercel Cron for daily jobs;
      `attachDatabasePool` from `@vercel/functions`; pool size set against Neon's limit
- [x] **decide** A staging domain (decided 2026-11-16: a host of its own, attached to
      `staging-preview`): until then staging's
      standing origin is the `staging-preview` branch's alias on `vercel.app` (Release 0.1
      track, permanent staging branch), which lasts as long as that branch does. Done when
      the owner has decided whether staging takes a host of its own and, if it does, the
      Preview variables name it
- [ ] Daily delete of expired `sync_diagnostics` lines under Vercel Cron, in every company
      (ARCHITECTURE, rejected-record diagnostics: the writer deletes only its own company's).
      Plan first: the role it runs as, since the application role sees one tenant. Tests: a
      company that writes nothing loses its expired lines; an unexpired line stays. Done
      when no line older than the period survives a day
- [x] Migration procedure, written in `packages/db/README.md`: who runs it, in what order
      against deploys, how a failed migration is rolled forward, the `0021` precondition
- [ ] Edge protection: rate limits per identity and per address, a request body limit, an
      `Origin` check on state-changing requests, session-cookie attributes, a content
      security policy and transport security tested on the deployed app
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
- [ ] Sentry reporter implementing `ErrorReporter` with the minimized event only; PostHog;
      EAS project; structured request logs carrying the request id
- [ ] Nightly encrypted `pg_dump` to R2 and weekly restore-verify in Actions, after
      Release 0.1, which runs on Neon's point-in-time restore; timed restore drill; the
      restore creates `trader_app` first
- [ ] Repository hygiene: vulnerability alerts on; Actions pinned by commit; a sweep of
      leftover `trader_t_*` test databases in the suites' global setup; `seed.test.ts` in a
      database of its own

## Stage 7 — Invoicing and exports

Done when the office issues an invoice from a completed job, exports it for QuickBooks Online
and for QuickBooks Desktop, and the number continues the partner's series without a gap. May
start once Stage 4 is done.

- [ ] Invoice drafting (V1-D14; plan first: money): lines drawn from job labor and materials
      as snapshots of description and quantity, using Stage 4's aggregation, or written
      free-hand; the customer price entered by the admin on every line; tax entered per
      invoice; the office screens (DESIGN, Invoice line). Tests: no line's price is derived
      from a pay rate or a receipt cost; a labor line's quantity is the rounded daily figure;
      a later change to the job's labor or materials changes no draft line
- [ ] Issue (immutable), void, credit memos; gap-free numbering continuing the partner's
      series; the issue transition compares the frozen columns and refuses a void in the same
      statement (2026-11-11 row). Tests: an issued invoice and its lines refuse every change
      but one void; issue retries are idempotent; fifty concurrent issues take fifty
      consecutive numbers with no gap and no duplicate
- [ ] Credit ceiling and void rule in SQL (V1-D15): the sum of an invoice's memos never
      exceeds its total as issued; an invoice with a memo cannot be voided; the application
      role's UPDATE on `invoice_counters` narrowed to the trigger's path. Tests: a memo one
      cent over is refused and one to the cent accepted; two concurrent memos that together
      exceed the total leave one; a void racing a memo leaves exactly one of them
- [ ] PDF on demand, rendered from the issued snapshot
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

## Stage 8 — Pilot

Done when the pilot success criteria, written with the partner, are met. The whole crew
starts together, and only once every release-gate line below is ticked (V1-D17); no smaller
first group is required.

- [ ] Pilot success criteria written with the partner
- [ ] Privacy policy and terms (RISEUP legal clinic); account deletion flow; both store privacy
      forms
- [ ] Approval separation checked on the deployed stack (V1-D10 as amended): an admin's own
      labor carries no approval; a receipt's logger and a correction's submitter are refused
      their own decision; recorded with the partner: who the second active admin is, since
      an office material entry on a closed-out day waits for one
- [ ] Pilot onboarding: owner-run insert of the pilot's company and its counter at 1/1,
      before any crew signs in; the time zone validated on write
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
- [ ] TestFlight and the Play closed track (Release 0.1, R10); crew onboarding in English and
      Spanish, opened to the whole crew when the gates above are recorded as passed
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

- [ ] Production on the App Store and Google Play, US storefronts only (Release 0.1, R10;
      a Play closed test first where Play requires one of the account)
- [ ] Acceptance checklist drafted from PRD's V1 features, walked with the partner, signed
- [ ] First invoice to the partner — issued through TRADER

## After V1 (unscheduled)

Push notifications and web approval by push · SMS notifications · roster self-service beyond own name and phone
· audit log of every write beyond the V1 actions · dark theme · per-company logo (additive
`companies` column, upload, shown in crew app and office header) · second contractor onboarding
· payment processing · customer portal · PowerSync re-evaluation · ledger checkpointing if replay cost is
ever measured as a problem · periodic location-sampling experiment (separate owner approval).
