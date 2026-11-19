# TRADER: tasks

The MVP, the one ordered list that reaches it, and what comes after. The owner's notebook
decides; this is its typed copy.

## The MVP

**One sentence.** A painter sees their week and clocks in and out on their phone, with or
without signal; the office schedules the crew, exports payroll hours and invoices the customer
from the same record.

**Phone (worker)**

- Sign in by texted code. English and Spanish.
- My week: my shifts.
- Clock in, switch job, clock out on my shift's job. Works offline, sends later. Location
  stamped at each tap.
- My hours.

**Office (admin, web)**

- People: invite, deactivate, make admin.
- Customers and jobs.
- Weekly schedule: one person, one job, one day, start to end.
- Hours: each worker's day by job. Every entry counts. Offline, edited, off-site and
  schedule-changed entries are flagged. A mistake is fixed with a correcting entry. Payroll
  hours export as CSV for any date range.
- Invoices: draft → issued → void, numbered in D Sierra's series, PDF, emailed to the
  customer, payments recorded.

**Out until after MVP:** approval queue, pay periods, pay rates and job cost, day closeout,
materials, photos, credit memos, QuickBooks exports, Smart Clock-In, biometrics, overview,
developer console, crews and foremen, public store listings.

**Finish line.** D Sierra's whole crew runs one full pay period on it: every hour clocked on
a phone, payroll hours exported from TRADER, one real invoice issued and emailed.

**How it reaches phones** (checked against Apple's and Google's pages, 2026-11-18)

- iPhone: TestFlight public link with a tester cap set to the crew's size. Apple's beta
  review gates the first build that goes to outside testers, so the Demo sign-in without an
  SMS is needed first. A build stops working 90 days after upload: ship a fresh one every 80
  days at most.
- Android: Play's internal testing track (100 testers at most, no review). The tester list
  is made of email addresses, so collect each Android user's Google account email with
  their phone number.
- Later: a public Play listing first needs a closed test of 12 testers for 14 straight days.

**What follows from these choices**

1. Payroll export is a date-range CSV. There is no pay period to close and nothing is frozen
   after an export.
2. Invoice lines are typed by the admin, with the job's hours shown beside them. No pay
   rates, no job cost.
3. No shift, no clock-in: the worker calls the office. An offline clock-in the schedule no
   longer allows is kept, flagged, and counts unless the office corrects it.

## The list

One ordered list. The owner owns the order. Tick an item when its "Done when" holds. Add what
you find under "Found along the way". Never reorder, never add scope.

### The cut

- [x] 1. **Documents and rules.** Commit the new `CLAUDE.md` and `.claude/settings.json`.
      Delete `docs/RULES.md`, `docs/MEMORY.md`, `docs/LOG.md`, `docs/PRD.md`,
      `docs/DESIGN.md`, `.github/scripts/log-append-only.mjs`, the log line in
      `.gitattributes`, the `check:log` script, CI's log step and `.claude/skills/pr-prep`.
      Before `MEMORY.md` goes, move each of its notes that still applies after the cut to a
      comment beside the code it concerns. Write `docs/ARCHITECTURE.md` from NOTEBOOK Pages 2
      to 5 and `README.md` from Page 9: both describe the target, and the items below bring
      the code to them. Done when `pnpm check` is green without the log step and the only
      prose left is the four documents, `LICENSE` and `packages/db/README.md`.
- [x] 2. **One short deploy job.** Delete `.github/workflows/promote-staging.yml`,
      `packages/db/src/promotion/`, `packages/db/src/run-promotion.ts` and
      `packages/db/test/promotion/`. `check` runs on pushes to `main` and
      `production` and on pull requests into either. After a green `check` on a push, a
      `deploy` job runs in the `staging` environment for `main` and in the `production`
      environment for `production`: migrate with the environment's migrator URL, call its
      deploy hook, wait until `/api/ready` answers 200 on this commit, then, on staging, run
      the browser smoke test. One deploy at a time per environment. No `workflow_dispatch`.
      Staging's secrets exist: `STAGING_MIGRATOR_URL`, `STAGING_DEPLOY_HOOK`, `STAGING_URL`,
      `CLERK_STAGING_SECRET_KEY`. Production's are the owner's to create later:
      `PRODUCTION_MIGRATOR_URL`, `PRODUCTION_DEPLOY_HOOK`, `PRODUCTION_URL`. Keep the guard
      that refuses to migrate a deployed database unless the caller states its purpose. Keep
      actions pinned by commit, and never run a job that holds a secret on a pull request's
      event. `audit.yml` stays. Update `.claude/skills/staging-status` to the new job. Done
      when a push to `main` runs `check` then `deploy`, staging answers ready on that
      commit, and the smoke test is green.
- [x] 3. **Delete what the MVP doesn't have.** From the API, the office, the phone and the
      tests: materials and their corrections, photos, day closeout, pay periods and pay
      rates, job cost, the overview, the developer console, refusals and sync diagnostics,
      the audit log, credit memos, shift overrides (an overlapping shift is simply
      refused), the invoice CSV export, and the database rate limiter (keep the request-body
      limit and the origin check). The office menu becomes six entries: People, Customers,
      Jobs, Schedule, Hours, Invoices. Their tables stay in the schema until item 8. Done
      when none of those routers, screens or tests exist, nothing reads their tables, and
      `pnpm check` is green.
- [x] 4. **Hours without an approval queue.** Every accepted clock event counts toward hours
      at once. The reasons `sync/reasons.ts` computes today (`offline`, `corrected`,
      `user_timed`, `location`, `clock_skewed`, `unscheduled`; `after_closeout` goes) are
      returned with each entry and shown as flags on the Hours screen. The `approvals`
      table's readers, the queue, decisions and every "pending" state are gone. A correcting
      entry takes effect when it is written and carries `corrected`. Done when a test shows
      an offline-captured session counted in the day's hours with its flag, and no code
      reads `approvals`.
- [x] 5. **Two roles, no crews.** Remove the `foreman` role and crews from the API, the
      office, the phone, the seed, the demo and the tests. Authority comes from the shift.
      Where the company's schedule switch is on, a worker starts only on a shift of theirs
      that day, by the eligibility rules already built, and with no shift is told to call
      the office. Where it is off, a worker starts on any open job. An offline start the
      schedule no longer allows on arrival is accepted and flagged `unscheduled`. An admin
      does everything in the office for their company. Done when no code names a foreman or
      a crew and tests cover those four cases.
- [x] 6. **Payroll hours by date range.** An admin export from Hours: CSV, one row per
      worker, day and job, for any from-to range; hours rounded as today (the day's total
      per job, half-up to the hundredth); the entry's flags in a column. Done when the Hours
      screen downloads it and a test fixes the rounding.
- [x] 7. **Invoices trimmed.** Lines are typed by the admin. The draft screen shows the
      job's hours beside them and may copy hours into a line's quantity, never a price. No
      materials on lines, no credit memos. Draft, issue, void, numbering, PDF, email and
      payments stay as built. Done when `pnpm check` is green and no invoice code names a
      material or a credit memo.
- [x] 8. **One fresh baseline.** The schema is the eleven tables of ARCHITECTURE. Replace
      the 50 migrations with one journal that builds exactly that on an empty database:
      tables, enums, the append-only trigger, row-level security enabled and forced on
      every company table, and the `trader_app` role created if absent, without
      `BYPASSRLS`, with its grants. Recreate the local and demo databases. Empty staging's
      database as its owner just before the push that replaces the journal, so the deploy
      job migrates it from nothing; then onboard staging's fixture companies again with
      their fictional numbers, and have the smoke test find its company through its
      signed-in user, not a stored id. Needs `STAGING_MIGRATOR_URL` in `.env.staging`: if
      it is missing, stop and ask. Done when a fresh database has exactly eleven tables,
      staging answers ready, and the smoke test is green on the new schema.
- [x] 9. **The role check runs once per server start.** `assertRuntimeRole` leaves the
      per-request transaction. A server instance's first database use checks the role and
      forced row-level security once, remembers a pass, and refuses to serve on a fail.
      `/api/ready` keeps its own check. Done when a request after the first makes no
      catalog query and a test shows a bypassing role refused.
- [x] 10. **Documents match the code.** Fold what is still true of
      `packages/db/README.md` into `README.md` and delete it. Run every command in
      `README.md` once. Re-read `docs/ARCHITECTURE.md` against the code: where they differ
      the code changes, or you stop and ask. Update `.claude/skills/ui-check` to the six
      screens. Done when the four documents and `LICENSE` are the repository's only prose
      and each `README.md` command has run in this session.
- [x] 11. **Staging proven.** On staging, in a browser: sign in as an admin, add a customer
      and a job, schedule a shift, see hours with their flags, export the CSV, create and
      issue an invoice, send it to an allow-listed address, record a payment. On a
      simulator: sign in, see the week, clock in, switch job, clock out with the network
      off, reconnect, and see the entry once in the office with its `offline` flag. Maestro
      flows and the smoke test green. Done when each step has been seen and the owner's
      report is printed. Then stop.

### To the MVP

- [ ] 12. **The origin rule fails closed.** An empty `CLERK_AUTHORIZED_PARTIES` refuses a
      session token that names an origin (`apps/web/src/server/clerk-identity.ts`,
      `admitsParty`). Done when a test fails without the fix and staging signs in from the
      office and from a phone build.
- [ ] 13. **The Demo sign-in without an SMS.** OWNER decides the way first, because it goes
      into Apple's beta review notes: read Clerk's, Apple's and Google's pages, put the
      options to the owner, then build the one chosen so that it admits only the Demo
      company's people in production and the fixture numbers on staging. Done when
      staging's phone flow signs in with no code sent.
- [ ] 14. **The office, rebuilt around six screens.** People, Customers, Jobs, Schedule,
      Hours, Invoices, laid out for a phone and for a desktop. Done when each screen has
      been checked at both widths on staging.
- [ ] 15. **The invitation message.** From People, an admin opens a ready text message to
      the invited person, in English and Spanish, with the link to the app. Done when a
      fixture person is invited on staging and the message opens on a phone.
- [ ] 16. **Invoice email seen arriving.** One invoice sent from staging reaches an
      allow-listed inbox with its PDF. Done when the OWNER confirms it arrived.
- [ ] 17. **Preview builds.** `eas.json` with development, preview and production
      profiles; the build number from EAS; a workflow that builds a preview for a commit.
      OWNER first: the Expo token in GitHub's `staging` environment, the iOS ad hoc
      credentials with the test iPhone registered, the Android keystore and its
      fingerprint at Clerk. Done when one commit has an Android build and an iOS build that
      sign in to staging.
- [ ] 18. **Physical phones.** OWNER, with one iPhone and one Android phone: sign in by
      texted code, see the week, clock in, switch job and clock out across an airplane-mode
      gap; a schedule changed while the phone was offline shows as stale. Done when the
      office shows those hours once, per job, with their flags.
- [ ] 19. **Privacy policy and terms.** Drafted by Claude, approved by the OWNER, public on
      `jpteq.app`. Done when the owner has approved the text and both pages are live.
- [ ] 20. **Production exists.** OWNER, by `README.md`, "Make production exist".
- [ ] 21. **The release job builds the phone app.** On a push to `production`: build with
      the production profile and send it to TestFlight and to Play's internal track, with
      the Expo token and the store credentials read from the `production` environment
      only. Done when the workflow is on `main`, to be read in the first release's pull
      request.
- [ ] 22. **First release.** OWNER merges `main` into `production`. D Sierra and Demo are
      onboarded, TestFlight's link and Play's tester list go to the roster, and week one's
      schedule is entered before the crew starts.
- [ ] 23. **The finish line.** One full pay period on real phones, payroll hours exported
      from TRADER, one real invoice issued and emailed.

OWNER, any time: one rate-limit rule on `/api` in Vercel's firewall (the staging project
now, production when it exists); the roster's phone numbers, and a Google account email for
each Android user.

### Found along the way

- [ ] The deploy job spends most of its time installing a browser for the smoke test
      (`playwright install --with-deps chromium`, about ten minutes a run). Cache it.
- [ ] OWNER: `STAGING_MIGRATOR_URL` in `.env.staging` ends in a cut-off query parameter
      (`&ch`); the value in GitHub's `staging` environment is whole. Fix the file's copy.
- [ ] OWNER: the `staging` environment variable `E2E_COMPANY_ID` is no longer read; delete it.
- [ ] The company field-write lock (`packages/api/src/labor/timeline.ts`) is still taken
      shared by every labor writer, but nothing takes it exclusive since day closeout left.
      Remove it, with its two tests.
- [ ] `sync/push.ts` still turns a FORBIDDEN thrown by a record into `not_permitted`; no
      record path throws it any more.
- [ ] The push acknowledgement and the phone's outbox call an entry's flags `reasons`; the
      phone stores them and no screen reads them. Rename to `flags` or drop from the outbox.
- [ ] Clerk's fixed test code (424242) is refused on staging's sign-in form, so a person
      cannot sign in to staging's office by hand with a fixture number; the smoke test uses
      single-use tickets. OWNER: turn the development instance's test mode on, or accept
      tickets as the only way in.
- [ ] The phone has still never signed in to staging. A development build pointed at
      staging reaches Clerk and gets to the code step for a fixture number, and the fixed
      test code is refused there too, so item 11's phone steps were seen against the local
      server only. Blocked on the Clerk item above, then items 12 and 13.
- [ ] An entry the office adds from "Add missing hours" is flagged `user_timed` and
      `location` (it has no location stamp), never `corrected`. Decide whether an office
      entry should carry `location` at all.
- [x] Invoice email did not leave staging: Resend refused two sends of invoice 1
      (`provider_refused`). The owner corrected the staging Vercel project's mail variables;
      after a redeploy the third send went. Item 16 still waits on the owner seeing it
      arrive.

## After MVP

In the order it would come back. The owner reorders at will.

1. Phone error reporting to Sentry.
2. Change a worker's sign-in number from the office.
3. Pay periods: close, lock, late adjustments.
4. Materials and receipt photos.
5. Day closeout.
6. Pay rates and job cost.
7. QuickBooks exports, once the partner's edition is known.
8. Approval queue, only if the flags prove too weak.
9. Credit memos.
10. Public App Store and Play listings, with the account-deletion flow the stores require.
11. A nightly database backup outside Neon, with a restore check.
12. Push notifications.
13. Smart Clock-In and biometric confirmation.
14. Audit log, a sync diagnostics screen, an overview dashboard.
15. A second contractor: self-serve onboarding, the company's logo on invoices.
16. Payments and a customer portal.
17. For the workflow: scheduled Claude Code runs; a separate GitHub identity or a scoped
    token for a hard production lock; vendor sign-ins for Claude that cannot reach
    production.

**Still to decide:** what triggers the first bill to D Sierra, now that "V1 complete" no
longer means the old feature list.
