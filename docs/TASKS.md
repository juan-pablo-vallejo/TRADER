# TRADER: tasks

The MVP, the one ordered list that reaches it, and what comes after. The owner's notebook
decides; this is its typed copy. The screens and this list were set on 2026-11-19. Items 1 to
11 of the list before it, the cut, are done: git history is the record.

## The MVP

**One sentence.** A painter sees their week and clocks in and out on their phone, with or
without signal; the office schedules the crew, exports payroll hours and invoices the customer
from the same record.

**Twenty screens.** Four public, five on the phone, eleven in the office.

**Public**

- Home, at `dsierrapainting.jpteq.app`: D Sierra Painting's homepage. One page: their logo,
  what they do and where, call and email, their own photos, Team sign-in, Get the app.
- Get the app: where the invitation message points.
- Privacy. Terms.

**Addresses.** Everything of D Sierra's is at `dsierrapainting.jpteq.app`: the homepage at
`/`, and their sign-in, office and public pages beside it. `app.jpteq.app` is the neutral
address: the phone app's API, the Demo company, and the checks a release runs. `jpteq.app`
and `www` only send a visitor to `app.jpteq.app`.

**Phone, in English and Spanish, the language chosen in the app**

- Sign in with one field that takes a mobile number or an email, by texted or emailed
  code; or with Google, and on an iPhone with Apple, where the invitation carries that
  address; then by Face ID or fingerprint once the person turns it on. Trouble signing in?
  is always there: a new phone or a failed read falls back to a code.
- Today: the shift's job on a card and one Clock in button. On the clock: a running timer,
  break, switch job, and clock out, which asks once. Works offline, sends later; a chip
  always says where the entries stand. The job opens to its address in the phone's maps and
  the office's notes. A reminder from the phone itself at a shift's start and at its end.
  Location is stamped at each tap, unless the company's switch or the person's turns it off.
- Week: my shifts and my hours.
- Me: language, reminders, Face ID or fingerprint sign-in, my name and phone, sign out.
- Crew, admins only and online only: today's crew by person or by job, call, add a shift for
  today, move someone to another job, set a jobsite's location.

**Office, admin only, in English and Spanish**

- Sign in: one field for a mobile number or an email, and a texted or emailed code; or
  Google; then by passkey on a device where the admin added one.
- Today: who is on the clock, who is expected and late, sessions left open, money owed.
- Schedule: weekly; one person, one job, one day, start to end. An admin can end a started
  shift early to move someone. Removing a shift asks nothing: Undo brings it back.
- Hours: a week of people by days. Every entry counts. Flags are badges. A day opens in a
  side panel, where a mistake is fixed with a correcting entry. Payroll hours export as CSV
  for any date range.
- Jobs, and a page per job: its people, hours, invoices, notes and location. Customers
  beside Jobs.
- Invoices, and one invoice: draft → issued → void, numbered in D Sierra's series, with a
  due date and how to pay, PDF, emailed to the customer, payments recorded.
- People: invite by mobile number, by email or both; send the invitation by text or by
  email and see where it stands (not sent, sent, verified); change a worker's email and
  sign-in number, which signs them out and is kept on record; make admin, deactivate,
  location on or off per person.
- Settings: the company's details as they print on an invoice, schedule enforcement,
  location, my profile, language and passkeys.

**Across the office.** One table, one set of status badges, a side panel for a row's detail,
filters kept in the address, Undo on schedule edits, keyboard row movement, a command menu.
Compact on a laptop, large targets on a phone.

**The look.** D Sierra's brand. Their roller and brush is the icon, and their indigo is the
color of every action inside the office and the app. Their red belongs to the mark, the
homepage and the two sign-in screens, which take the homepage's navy, its red for their one
main button and Bodoni Moda for their heading. Red never sits on navy.

**Out until after MVP:** approval queue, pay periods, pay rates and job cost, day closeout,
materials, photos, credit memos, QuickBooks exports, Smart Clock-In by geofence, biometric
confirmation of a clock tap, passkeys in the phone app, product analytics, developer
console, crews and foremen, public store listings, online payment, a customer's invoice
page, payment reminders and receipts, an estimate request form.

**Finish line.** D Sierra's whole crew runs one full pay period on it: every hour clocked on
a phone, payroll hours exported from TRADER, one real invoice issued and emailed.

**One release.** Changed 2026-11-20; it replaces "Two releases". Everything on the list goes
out together: the second release's screens were built before the first went out. What ships
after it is a release of its own, when there is something to ship. The phone app changes only
with a new build; the office changes the moment a release merges.

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
3. No shift, no clock-in, while the company keeps that switch on: the worker calls the
   office, and an admin adds a shift or moves them from the Crew tab. An offline clock-in the
   schedule no longer allows is kept, flagged, and counts unless the office corrects it.
4. A started shift can be ended early by an admin. Nothing else about it changes, and no
   clock event is touched.
5. The dashboard is TRADER's own data. Sentry reports errors from the office, the API and
   the phone; nothing measures usage.
6. The product wears D Sierra's brand, and everything of theirs is at
   `dsierrapainting.jpteq.app`. The homepage's words and photos are theirs, kept in one
   file; nothing on it is invented. The homepage and the office share that address, so the
   homepage never loads anything from another host: no analytics, no widget, no embed. A
   `jpteq.app` address is only ever served by TRADER itself from the repository; a site a
   contractor hosts or edits themselves goes on the contractor's own domain.
7. What prints on an invoice is copied onto it at issue, so an issued invoice's page never
   changes: the company's block and how to pay, the customer's name and address, and the
   job's name. An invoice to a customer is in English.
8. An entry the office writes is flagged `corrected` and never `location`.
9. An address never decides whose data is shown: the signed-in person's company does. The
   phone app and the release checks use `app.jpteq.app`, so no customer's name is built into
   the phone app.
10. In production the Demo company reaches nobody outside: its invoices are emailed only to
    the deployment's allow-list, blank meaning nobody, and it can invite nobody and change
    nobody's sign-in address. Its code is shared by design, so whoever holds it must be
    harmless.

## The list

One ordered list. The owner owns the order. Tick an item when its "Done when" holds. Add what
you find under "Found along the way". Never reorder, never add scope.

An item that waits on the OWNER does not stop the list: say what is waiting, then take the
next item that does not depend on it.

Three things hold for every item and are not repeated in each:

- An office item is looked at with `ui-check` at 390, 768 and 1280, before and after.
- A phone item leaves the Maestro suite green, and the three failure tests of the clock
  and sync path green: a dropped response, a duplicate send, a wrong clock. Its screens are
  seen in English and in Spanish.
- A string lands in both languages in the commit that adds it: on the phone always, in the
  office from item 14 on.

### The owner's gates

In the order they block. Each can be done ahead of its item.

1. Staging by hand: decided 2026-11-20. The owner signs in to staging as himself, an admin
   of staging's company on his own number, by texted code. Clerk's test mode stays off, and
   the machine goes on signing in by ticket.
2. Item 3: choose how the Demo company signs in without an SMS.
3. Item 12: a Sentry project for the phone app, its DSN, and an upload token in EAS.
4. Item 13: the Expo token in GitHub's `staging` environment, the iOS ad hoc credentials
   with the test iPhone registered, and the Android keystore. Clerk asks for a fingerprint
   only for passkeys in the phone app and app links, which the MVP does not use.
5. Items 8 to 11 and 14: read the new Spanish once, on a simulator and on staging.
6. Item 18, from D Sierra: two sentences on what they do and where, in each language; the
   phone number and email their customers should use; three to six photos of their work that
   they own; their OK to publish them. The repository is public.
7. Item 21: approve the privacy policy and the terms.
   Items 21b to 21e, lettered so no gate is renumbered, on Clerk's development instance:
   before 21e's invitation by email alone, a mobile number no longer required at sign-up;
   before 21d, the Google connection, and then the owner's own two sign-ins with Google on
   staging, one as himself and one with an account on no roster; before 21b, Sign-in with
   passkey; before 21c, Sign-in with mobile biometrics, the Apple connection, and
   `trader://sso-callback` among the allowed redirects. For 21c also Sign in with Apple on
   the App ID. Then, once 21c is on `main`, new preview builds started by the owner
   (Actions, Preview builds, Run workflow) and installed on both phones.
8. Item 22: one iPhone and one Android phone.
9. Item 23: production, by `README.md`, which now carries D Sierra's address: its DNS
   record in Cloudflare, its domain on the Vercel project, and its name in Clerk's allowed
   subdomains, with gate 7's Clerk settings on the production instance and a Google Cloud
   OAuth client of the owner's for Google sign-in there. Then D Sierra's details in
   Settings, and the TestFlight and Play links for Get the app.
10. Items 25 and 34: the release, and the first fix release after it.
11. Item 30: confirm the invoice email arrived.

Any time: one rate-limit rule on `/api` in Vercel's firewall (the staging project now,
production when it exists); the roster's phone numbers, and a Google account email for each
Android user.

### The release: the crew's first day

- [x] 1. **Documents follow this list.** `docs/ARCHITECTURE.md`, People and roles: the
      roles line reads "admin (office web; on the phone, their own clock when they work a
      shift, and the Crew tab)", and "Admin can" ends "; on the phone, see today's crew,
      call, add a shift for today, move someone to another job, set a jobsite's location".
      Its sketch's Sentry line reads "Sentry (errors: office, API, phone)". `README.md`: the
      release step names "Preview builds" and "The release job builds the phone app" by
      title instead of "TASKS 17 and 21", and day-one support names "change a worker's
      sign-in number" by title instead of "After MVP 2". `CLAUDE.md` rule 5 reads "Every
      screen exists in English and Spanish. An invoice to a customer is in English." Done
      when the four documents agree with the MVP above and `pnpm check` is green.
- [x] 2. **The origin rule fails closed.** An empty `CLERK_AUTHORIZED_PARTIES` refuses a
      session token that names an origin (`apps/web/src/server/clerk-identity.ts`,
      `admitsParty`). Done when a test fails without the fix and staging signs in from the
      office and from a phone build.
- [x] 3. **The Demo sign-in without an SMS.** OWNER decides the way first, because it goes
      into Apple's beta review notes: read Clerk's, Apple's and Google's pages, put the
      options to the owner, then build the one chosen so that it admits only the Demo
      company's people in production and the fixture numbers on staging. The code is
      shared by design, so in production the company the door admits reaches nobody
      outside: its invoices are emailed only to the deployment's allow-list, blank meaning
      nobody, and `roster.invite` refuses it. Neither rule touches staging. `README.md` has
      the owner invite Demo's people before the Demo pair is set. Done when staging's phone
      flow signs in with no code sent, and tests show both refusals for the door's company
      under `TRADER_ENVIRONMENT=production` and neither under `staging`.
- [x] 4. **Loose ends.** Five small things the cut left, in one session. Cache the browser
      the deploy job installs for the smoke test (`playwright install --with-deps chromium`
      took 21 s to 8 m 47 s). Remove the company field-write lock
      (`packages/api/src/labor/timeline.ts`) with its two tests: nothing takes it exclusive
      any more. `sync/push.ts` stops turning a thrown FORBIDDEN into `not_permitted`, a path
      no record takes. The push acknowledgement and the phone's outbox call an entry's flags
      `flags`, not `reasons`. `apps/web/vercel.json` turns off Vercel's own deployments for
      `production` as it does for `main`. Done when `pnpm check` and the Maestro suite are
      green and a deploy run restores the browser from its cache.
- [x] 5. **Company settings, location switches, and what the phone is told.** One additive
      migration and the API behind three later screens. No screen changes here.
  - `companies` gains `address`, `phone`, `email` and `payment_instructions` (text,
    optional), `invoice_terms_days` (integer, default 0: due on receipt) and
    `location_stamps` (boolean, default true). `trader_app` may update those and
    `schedule_enforced`, which until now only the database's owner could.
  - `users` gains `location_stamps` (boolean; null means "as the company"). `jobs` gains
    `notes` (text).
  - `company.get` and `company.update`, admin only. `roster.setLocation`, admin only.
    `job.create`, `job.update` and `job.list` carry `notes`.
  - The pull also answers the company's phone, `locationStamps` (the caller's own: the
    person's setting, else the company's) and each job's `notes`. A snapshot an older build
    stored is thrown away and pulled again, never a crash.
  - Where a worker's stamps are off, a pushed event is stored with no location even if one
    was sent, and is never flagged `location`.
  - An entry the office writes (`labor/repair.ts`) is flagged `corrected` and never
    `location`. The office's word for `corrected` stays "edited".

  Done when tests cover each of those, staging's fixture companies keep their data through
  the migration, and `pnpm check` is green.

- [x] 6. **Ending a started shift early.** Today a shift someone clocked in on is locked
      whole and an overlapping shift is refused, so under schedule enforcement nobody can be
      moved to another job mid-day. Change the lock by a new migration: a locked shift's end
      may move earlier, to any minute after the clock-in that locked it, and nothing else
      about it may change (`check_job_assignment_mutation`; `assignments/day.ts`,
      `judgeDay`). Two admin procedures. `assignment.endEarly`: a shift and its new end.
      `assignment.moveToday`: a person, a job and a minute; the shift that covers that
      minute ends at it, and one on the other job runs from it to the old end, all or
      nothing. A person with no shift then simply gets the new one. Neither reads or writes
      a clock event. Done when tests show a started shift trimmed and a clock-in admitted on
      the second shift the same day, a trim to before the clock-in refused, and every other
      change to a locked shift still refused by the database.
- [x] 7. **The shell: D Sierra's brand, three layouts, laptop density.** The frame every
      later screen sits in. No screen's content is redesigned here.
  - Tokens. `apps/web/src/app/theme.css` and `apps/mobile/src/theme.ts` hold the same
    values, and a test fails when they differ. Ink `#111827`, secondary ink `#4B5563`,
    canvas `#F5F6F8`, surface white, hairline `#D9DCE3`, a control's border `#8A93A2` (3:1
    on white). Accent `#2808AC` for every action, link, focus ring and current item, with
    `#EEEBFA` behind a selected row. The mark's red `#BC0C0C` and the wordmark's navy
    `#140064` appear beside the logo and on the homepage, never on a control and never as a
    status.
  - Five status tones, each an icon, a word and a tint, never color alone: neutral
    `#374151` on `#EEF0F3`, active `#2808AC` on `#EEEBFA`, done `#166534` on `#E3F2E8`,
    attention `#92400E` on `#FBEFD9`, problem `#991B1B` on `#FBE6E6`. A test holds each
    pair at 4.5:1 or better.
  - Type. The office and the public pages use Inter, served by the app itself
    (`next/font/local`, the font file and its license in the repository): the content
    security policy admits no font host. Hours and money in tabular figures. The phone
    keeps the system font.
  - Density. From 768 px wide: 15 px text, 40 px table rows, 36 px controls. Below it: 17
    px text and 48 px targets, as now. A change of state moves in 150 ms, and not at all
    under reduced motion.
  - Three layouts. The public pages (`/`, `/get`, `/privacy`, `/terms`) with no menu and
    nothing of Clerk loaded; sign-in alone on its page under the logo; the office with its
    header and menu. Where a deployment has a public host and an office host, `/` on the
    office's host goes to the office.
  - Menu. Schedule, Hours, Jobs, Invoices, People; Today joins first with item 26.
    Customers is a tab beside Jobs. The header shows the mark and the company's name from
    `company.get`. The person's name opens their profile (Settings from item 20) and Sign
    out.
  - Cache, in `providers.tsx`. A list stays fresh for 30 s; a new range keeps the old rows
    on screen while it loads, as `schedule/schedule-screen.tsx` already does; a menu link
    fetches its screen's data on hover or focus. A screen visited before never shows
    "Loading…" again, and a first load shows placeholder rows.
  - `.claude/skills/ui-check` names the new routes and the density rule.

  Done when every existing screen has been seen at 390, 768 and 1280 in the new frame, the
  smoke test follows the new routes, and nothing scrolls sideways.

- [x] 8. **Phone: Today, rebuilt around one button.**
      `apps/mobile/src/app/(tabs)/today.tsx`, on item 7's tokens. The capture path is not
      touched: a tap still writes to the store and returns.
  - Off the clock: a card with the shift's job, its address and the shift's hours, and one
    full-width Clock in button in the bottom third of the screen. One tap, and nothing to
    pick when the schedule names the job. Where the schedule is not enforced the person
    still picks a jobsite first, as now.
  - On the clock: the job, a running timer in large tabular digits, Clock out as the main
    button, Start break and Switch job beneath it. Clock out asks once, in a sheet that
    names the job and the hours worked. Nothing else asks.
  - A session still open from an earlier day says so first, with Clock out now.
  - No shift today, where the schedule is enforced: no button, the reason, and Call the
    office, which dials the company's phone.
  - The sync banner becomes a chip under the title: Saved on phone, Sending, Sent, Needs
    attention. A tap opens what is waiting, each entry with its reason in plain words, and
    Send now.
  - A tap on the job card opens the job: its address, which opens the phone's maps, and the
    office's notes. Both come from the last pull, so they work offline.
  - Where `locationStamps` is off the app neither asks for location nor sends one.
  - The tabs get an icon beside each word. A capture answers with a check mark and a short
    haptic. A button grows to two lines before it cuts a Spanish label.

  Done when the screen has been seen in each of those states on an iOS simulator and an
  Android emulator, and the Maestro flows follow the new screen.

- [x] 9. **Phone: sign-in, Week and Me.**
  - Sign-in (`src/ui/phone-sign-in.tsx`): the mark, one large number field, then the code
    field, which takes the texted code from the keyboard's suggestion. Clerk's hooks stay
    as built. Clerk's prebuilt native screens are not used: they are in beta, and the
    language here must follow the app's own choice.
  - Week (`week.tsx`): each day a card, today first; a shift opens the same job sheet as
    Today; my hours by day beneath, with a flag in words where the office may look.
  - Settings becomes Me (`settings.tsx`): language, my name and contact phone
    (`me.update`), the build's number, and Sign out with its unsent-entries warning.

  Done when each screen has been seen on both simulators in both languages.

- [x] 10. **Phone: shift reminders.** Notifications the phone schedules for itself from the
      shifts in the last pull: at a shift's start when nobody has clocked in on it, and at
      its end while the clock is still running. A tap opens Today. No server, no push token,
      no location in the background.
  - One pure function decides the whole set from the shifts, the clock's state and the
    time. It runs after every pull and every tap, and it has tests.
  - Permission is asked once, after the first clock-in, with one sentence of why before the
    system's prompt. Refused, the app works as before. A switch in Me turns reminders off.
  - A reminder may arrive a few minutes late: no exact-alarm permission is requested.
  - Look up `expo-notifications` for the SDK in `apps/mobile/package.json` before
    installing it: what its config plugin adds to each platform's build. If it adds the
    push entitlement on iOS, say so under "Found along the way", because the signing in
    item 13 is the owner's.

  Done when a development build has shown both reminders on both simulators, in the
  language chosen in the app, and the function's tests are green.

- [x] 11. **Phone: the Crew tab.** A fourth tab for admins, by `me.role` in the pull. A
      worker never sees it. Online only: with no connection it says so, and shows nothing
      old as current.
  - `overview.today`, admin only. For the company's today: each person with a shift or a
    session, with their shifts, their clock state and since when, and their hours so far;
    and the sessions still open from an earlier day. One pure function, shared by the phone
    and the office, names each person's status from that answer and the minute: on the
    clock, on a break, expected, late (15 minutes past a start with no clock-in), done. The
    tag `archive/pre-simplify` holds the overview that was cut: read it for what it
    computed, and do not restore it.
  - The tab lists the crew by person or by job, with a count per status above. A person
    opens a sheet: status, today's shifts, hours today, Call (their contact phone, else
    their sign-in number), Add a shift today (`assignment.create`) and Move to another job
    (`assignment.moveToday`). A job opens a sheet: who is there, the address, and Set the
    jobsite's location here, which writes the phone's own fix and a 200 m radius to the job
    (`job.update`) after one confirmation.
  - An admin with no shift today opens the app on Crew.

  Done when tests cover `overview.today` and the status function, a Maestro flow signed in
  as the demo admin adds a shift for a worker and sees them expected, and the tab has been
  seen on both simulators.

- [ ] 12. **Phone errors reach Sentry.** OWNER first: a Sentry project for the phone app and
      its DSN, which is public by nature and goes in the build's `EXPO_PUBLIC_` variables,
      and an upload token for source maps in EAS's environment, never in the repository.
      Look up Sentry's current setup for this Expo SDK. A report carries the build's number
      and the screen, and never a name, a phone number, a coordinate or an entry's contents.
      A sync cycle that fails for a reason other than no connection is reported once, not
      every minute. Done when an error thrown on purpose in a staging build is read back
      through the read-only Sentry tools with a readable stack.
- [x] 13. **Preview builds.** `eas.json` with development, preview and production
      profiles; the build number from EAS; a workflow that builds a preview for a commit,
      told staging's API, Clerk's publishable key and the Sentry DSN. OWNER first: the Expo
      token in GitHub's `staging` environment; then, once `eas.json` is on `main`, the test
      iPhone registered and one build of the preview profile run by hand for each platform,
      which signs in to Apple, makes the ad hoc profile and makes the Android keystore. Done
      when one commit has an Android build and an iOS build that sign in to staging.
- [x] 14. **The office in English and Spanish.** `apps/web/src/app/strings.ts` becomes two
      typed catalogs, as the phone's are (`apps/mobile/src/i18n`): a key missing from one
      fails `pnpm typecheck`, and nothing falls back to English at run time. A person's
      choice is made from the header and from Settings, starts from the browser's language,
      is kept in a cookie so the first paint is already right, and sets `<html lang>`.
      Dates, hours and money follow the language (`format.ts`). What a person typed (a name,
      an address, a note, an invoice line) is shown as typed. The invoice a customer
      receives, its PDF and its email stay in English. The same thing has the same name in
      both apps: use the phone's `es.ts` for the trade's words. OWNER: read the Spanish once
      on staging. Done when every office screen has been seen in Spanish at 390 and 1280
      with no English left on it and no label cut.
- [x] 15. **Hours: the week table.** The first screen on the shared pieces, which are built
      here because it needs them: `DataTable` (columns, rows, a caption, its loading, empty
      and failed states, grouping, a row or a cell that opens), `StatusBadge` on the five
      tones, the flag badges, and `useUrlFilters`. Keep the native `<table>` and the
      container-query stacking of `table.module.css`.
  - A week is a table of people by days. Each cell is the day's hours with its flags as
    badges, each row ends in the week's total, and a totals row closes it. `labor.hours`
    answers those per-person and per-day sums, so the browser still adds and rounds
    nothing. A range that is not one week draws the list by person and date.
  - The range and the preset live in the address: This week, Last week, Flagged only, and
    any dates up to 31 days. A reload or a pasted link shows the same thing.
  - Sessions still open sit in a strip above the table, each with the day it was left
    open.
  - Export asks first: a dialog with the range, the total hours, and how many flagged
    entries and open sessions the range holds (`labor.export` answers those counts with the
    file), then Download. Nothing is frozen by an export.

  Done when a test holds the screen's totals equal to the CSV's for the same range, a
  reload keeps the range, and each of the six flags has been seen as a badge in both
  languages.

- [x] 16. **Hours: the day panel and corrections.** `SidePanel`: the schedule's drawer
      (`schedule/drawer.tsx`) lifted to a shared piece, still a native `<dialog>`, focus
      returned to what opened it, and its state in the address so a panel can be linked. A
      cell of the week table opens that person's day in it, from `labor.ledger`: each
      session, each entry with its time, who recorded it and its flags (a `location` flag
      reads "No location" or "Off-site" by whether a stamp was recorded), and a correction
      beside the entry it replaced, both values shown.
  - The action is named Correct, never Edit. It opens the repair editor inside the panel
    (`hours/repair-set.ts` stays as it is), and the hours the change would give are shown
    as the times are typed. Add missing hours and Void live in the same panel.
  - The separate entries section under the table (`hours/entries-screen.tsx`) goes, and
    its anchor link with it.

  Done when a flagged entry is reached in two actions from opening Hours, a test shows a
  corrected entry's original event unchanged, and the panel has been worked by keyboard
  alone.

- [x] 17. **Schedule: the week beside the form, and moving someone.** The week grid moves
      onto the shell's tokens and badges and keeps its own layout.
  - The shift drawer shows that person's week beside the form, so an overlap is seen before
    saving (`schedule/shift-dialog.tsx` already computes it).
  - Today's column carries an Add button per person: one click to a shift for today, with
    the job to choose.
  - A started shift is no longer read-only: End early and Move to another job (item 6),
    each saying what it will do before it does it.

  Done when a week for the demo crew has been entered without typing a job's name, and a
  started shift has been ended early and a simulator has offered the worker the second job
  after its next pull.

- [x] 18. **D Sierra's homepage and Get the app.**
  - Addresses. `TRADER_HOME_HOST` names the host whose `/` is the homepage
    (`dsierrapainting.jpteq.app` in production) and replaces `TRADER_OFFICE_HOST`. On that
    host everything else answers as it does anywhere: sign-in, the office, the public pages,
    the API. On any other host `/` goes to the office. Where the variable is blank, as on
    staging and a development machine, `/` stays the homepage. Where
    `CLERK_AUTHORIZED_PARTIES` is set, a page asked for on a host that is not one of its
    origins is sent to the same path on the first of them, so the office is never drawn
    under an address a session cannot belong to. Tests cover the home host, the neutral
    host, an unlisted host, and no variable at all.
  - The homepage is D Sierra Painting's, one page in English and Spanish: their logo, what
    they do and where, Call and Email as plain links, their photos, then Team sign-in and
    Get the app, both on the same host. Its words and pictures are one content file, and a
    part with no content draws nothing. Nothing on it is invented: no review, no claim, no
    license number, no photo D Sierra did not supply. It shares its address with the
    office, so it loads nothing from another host, ever. OWNER first, from D Sierra: gate 6
    above. Without it, build the page from what the repository already holds, the name and
    the logo, with the two buttons.
  - `/get` is where the invitation message points. In the phone's language: one button for
    this phone (the TestFlight link on an iPhone, the Play testing link on Android, both on
    a desktop), read from two public variables added to `.env.example`. With a variable
    unset it says to ask the office. Android's note says the office must have listed the
    person's Google account first.

  Done when both pages have been seen at 390 and 1280 in both languages on staging and
  load nothing from another host, and the address tests are green.

- [x] 19. **People, and the invitation message.** People on `DataTable`. A row opens the
      person in the side panel: role (making an admin asks first), location (as the company,
      on, or off: `roster.setLocation`), their numbers as links that dial, a link to their
      week in Hours, and Deactivate last. After an invitation, and again from the panel
      while the person has not signed in, Send the invitation opens a ready text message to
      their number on the admin's own phone, in English and Spanish, with the link to
      `/get`. On a desktop the same text is offered to copy. Done when a fixture person is
      invited on staging and the message opens on a phone.
- [x] 20. **Settings.** `/settings`, behind the person's name; `/profile` redirects to it.
      Three parts. Company: name, address, phone, email, how to pay (a few lines that print
      on every invoice), payment terms in days, and the timezone, shown and not edited. Time
      clock: schedule enforcement and location stamps, each a switch that says in one
      sentence what it changes and asks before it changes it. Me: name, contact phone,
      language. `README.md`'s onboarding step that turns enforcement on by SQL becomes a
      line about this switch. Done when each switch has been seen saved on staging, and
      flipped locally and seen to take effect on a simulator at its next pull.
- [ ] 21. **Privacy policy and terms.** Drafted by Claude, approved by the OWNER, public at
      `/privacy` and `/terms` in English and Spanish. The policy says what the product does
      and no more: a location stamp at each clock tap unless switched off, error reports to
      Sentry from the office and the phone, sign-in by Clerk, invoice email by Resend,
      reminders that never leave the phone, and no analytics. Done when the owner has
      approved the text and both pages are live on staging.
- [ ] 21a. **The office's sign-in page.** By the owner's word of 2026-11-23, the homepage's
      next page. At laptop width a navy panel (the mark, the painter spraying a ceiling
      from `assets/pics/`, the homepage's headline) beside the form on white; at phone
      width the form under a navy header. The form is the office's own, on Clerk's hooks as
      the phone's is: Clerk's prebuilt one cannot take an email and a number in one field,
      and his word the same day put that field ahead of "never rebuilt". One field for a
      mobile number or an email, read by one function the phone shares; "Send me a code";
      the code, Resend after 30 seconds, and a sentence in both languages for a wrong code,
      an expired one, too many tries and an address no roster holds. "Team sign-in" in
      Bodoni Moda, its one main button in their red. The way back to the homepage, the
      other language and Trouble signing in? are on every step. A signed-out link from the
      office keeps where the person was, and a signed-in visitor is sent on by the server.
      Still no sign-up, and `/sign-in` is still a 404 under the development identity. Done
      when each step has been seen on staging, signed out, at 390 and 1440 in both
      languages, nothing scrolls sideways, and the smoke test is green.
- [ ] 21b. **Passkeys in the office.** OWNER first: gate 7's passkey switch. An admin who
      signed in by code is offered a passkey once, in a band on Today; "Not now" is
      remembered in that browser. Settings, Me lists a person's passkeys with Add and
      Remove. The sign-in form then offers Use a passkey, and its field the browser's
      saved one; a lost one falls back to a code. The privacy draft gains its sentence on
      the key Clerk holds, and `README.md` the switch for production. Done when
      `scripts/staging.sh passkey` has added a passkey, signed in with it and removed it on
      staging, and the band and the section have been seen at 390 and 1280 in both
      languages.
- [ ] 21c. **Phone: sign-in on the brand, with Face ID or fingerprint, Google and Apple.**
      OWNER first: gate 7's biometric switch, Apple connection and redirect.
      `src/ui/phone-sign-in.tsx`: a navy band with the mark, the heading in Bodoni Moda,
      one red button. One field for a mobile number or an email, as the office's; Resend
      after 30 seconds, a wrong code and an expired one told apart, and Trouble signing in?
      on every step. Google by the phone's own browser sheet (Clerk's `useSSO`), and on an
      iPhone Apple's own sheet (`useSignInWithApple`), which Apple's rule 4.8 asks of an
      app that offers Google; an account no roster holds is told to ask the office, and
      the app never asks Clerk for a sign-up. A person invited by email alone can use the
      app. After the first code sign-in on a phone that can, one screen offers
      Face ID or fingerprint sign-in through Clerk's biometric sign-in
      (`@clerk/expo-biometrics`), with the phone's passcode standing in; "Not now" is
      remembered. Me has its on and off, and Sign out keeps it. A second person signing in
      by code replaces the first, the Demo door is never offered it, and a person the
      office deactivated is refused by the API and their key revoked. A stand-in that
      exists only under the development identity lets the simulators and Maestro walk those
      screens. Look up what the package adds to each platform's build before installing
      it, as item 10 did. Done when every state has been seen on the iPhone simulator and
      the Android emulator in both languages, a build pointed at staging signs in by code
      and by the Demo door, and the Maestro suite is green on both.
- [x] 21d. **Sign in with Google, in the office.** OWNER first: gate 7's Google connection.
      By the owner's word of 2026-11-23, in place of "no social login". A Google button
      above the field, in Google's own style, its mark drawn by the page and nothing of
      Google's loaded. It signs in a person whose invitation carries that Google address,
      which is how Clerk ties the two; anyone else is told to ask the office, and the page
      never asks Clerk for a sign-up. The privacy draft gains its sentence, and `README.md`
      the Google Cloud client that production needs. Done when the owner has signed in to
      staging with Google as himself, and with an account on no roster has been refused
      with Clerk holding no more logins than before.
- [ ] 21e. **People: the office's hold on sign-in addresses, and where an invitation
      stands.** By the owner's word of 2026-11-23: "admin has all controls".
  - An invitation takes a mobile number, an email, or both: one of the two, no longer the
    number. OWNER first, for the email alone: gate 7's Clerk setting.
  - Send the invitation by email (Resend, the words of the text message, in both
    languages), each send recorded with its outcome; by text as now, from the admin's own
    phone, recorded when the admin taps Send. `invitation_sends`, append-only.
  - A status per person, worked out and never stored: Not sent, Sent · not verified,
    Verified (the person has signed in). A column in the table; the sends in the panel.
  - A worker's panel changes their email and their sign-in number, for someone invited or
    already signed in (`roster.setEmail`, `roster.setSignInPhone`). An admin's addresses
    are read-only in the office: they are the owner's to change (his word, the same day).
    Read against the code before it was built, the first design let one company's admin
    rewrite another company's login, so it is held to these:
    - A login is tagged at Clerk with its roster row when it is made, and a change touches
      only the login found by that tag or by the row's own bound id, never one found by an
      address.
    - A change ends with the login's addresses exactly the roster's, and saving the same
      value again repairs one that stopped half-way. One address always remains. An
      address another login holds is refused in one sentence that does not say why.
    - It asks first, naming the person: whoever controls the new address will be able to
      sign in as them.
    - A person who had signed in is signed out everywhere, and their passkeys, Face ID or
      fingerprint keys and Google or Apple links are removed: they sign in once more with
      the new address. Their hours and history are untouched.
    - Each change is kept on record, who, when and which address, and shown in the
      person's history: `address_changes`, append-only.
    - It locks the admin's row and the person's and no other, so nobody's clock waits on
      it. The Demo company changes nobody's in production.
  - Tests for what can go wrong: the provider down or answering late, a change that
    stopped half-way and is saved again, an address taken in the company, an address
    another login holds, another company's person on the old address, the last address
    removed, two admins at once, a clock tap sent during a change; and that a sign-in
    identity still cannot write an address.

  Two landings: the invitation's sends, status and email, and the invitation by email
  alone; then the address changes. Done when, on staging, a fixture person has been
  invited by email alone, emailed an invitation at an allow-listed inbox and shown each of
  the three statuses; a fixture worker has had their email changed and a number given,
  been signed out by it, and the two changes are in their history; and `README.md`'s "a
  worker's number changed" is one line about People.

- [ ] 22. **Physical phones.** OWNER, with one iPhone and one Android phone: sign in by
      texted code, turn on Face ID or fingerprint, sign out and back in by it, fail it once
      and get in by code; sign in with Google, and on the iPhone with Apple; see the week,
      clock in, switch job and clock out across an airplane-mode gap; a schedule changed
      while the phone was offline shows as stale; a reminder arrives at a shift's start
      with the app closed; an admin moves the worker mid-day from the Crew tab and the
      worker's phone offers the second job; Call dials. Done when the office shows those
      hours once, per job, with their flags.
- [ ] 23. **Production exists.** OWNER, by `README.md`, "Make production exist", which now
      carries D Sierra's address: the DNS record, the Vercel domain, Clerk's allowed
      subdomains, both origins in `CLERK_AUTHORIZED_PARTIES`, and `TRADER_HOME_HOST`. Then,
      in Settings as D Sierra's admin: the company's details, how to pay, the terms and the
      two switches. And the two links for Get the app in the production project's variables.
- [ ] 24. **The release job builds the phone app.** On a push to `production`: build with
      the production profile and send it to TestFlight and to Play's internal track, with
      the Expo token and the store credentials read from the `production` environment
      only. The `production` environment holds `EXPO_TOKEN`, `ASC_API_KEY_ID`,
      `ASC_API_KEY_ISSUER_ID`, `ASC_API_KEY_P8` and `GOOGLE_SERVICE_ACCOUNT_KEY`. No store
      credential is kept at Expo, so no token of staging's can submit. Done when the
      workflow is on `main`, to be read in the release's pull request.
- [ ] 25. **The release.** OWNER merges `main` into `production`. D Sierra and Demo are
      onboarded, the invitations go out from People, Play's tester list holds each Android
      user's Google account, and week one's schedule is entered before the crew starts.

### Built before the release

- [x] 26. **Today.** `/today`, where the office opens. Three bands in a fixed order, rows
      and counts, no charts. It reads `overview.today` and the status function of item 11.
  - Needs attention: sessions left open from an earlier day (Fix opens that day's panel in
    Hours) and people late for a shift (Call). Ten rows at most, then a link to the rest.
    Only a thing with an action is admitted here. Nothing to show is a good state, and says
    so in one line.
  - On the clock now: who, where, since when. Then who is expected, and who is done.
  - Money: what customers owe, how many drafts wait, how many complete jobs have no
    invoice. `overview.today` gains those figures. Each links to its list.

  Done when each kind of row has been seen on staging with its link landing on the matching
  list, and a clear day shows its one line.

- [x] 27. **Jobs and Customers.** Both on `DataTable`, as two tabs of one place.
  - Jobs: status badges; Open, Complete and Archived as presets in the address; hours this
    week and to date beside each job, which `job.list` answers from the one labor
    derivation.
  - The create form picks a customer or adds one in place.
  - A job's notes are one field, labelled as what the crew sees on their phones.
  - A job's location is one field that takes a pasted pair of coordinates, or a maps
    address that carries them, with the radius beside it (200 m unless changed). A short
    link that hides the coordinates is refused with a sentence on how to copy them. A line
    says an admin can also set it from the Crew tab at the jobsite. The three separate
    fields go.

  Done when a job has been created with a new customer in one form on staging, and a test
  reads a pasted pair and a maps address into the same location.

- [x] 28. **The job page.** `/jobs/[id]`, one page that says where a job stands. `job.read`,
      admin only, answers it in one call.
  - A row of four steps, each derived and never stored: Scheduled (a shift today or later),
    Hours recorded, Invoiced (an issued invoice that is not void), Paid (nothing owed on
    them). The first step missing carries the page's one main action: Schedule, or Create
    invoice.
  - People: who is scheduled this week and who is on it now, each with their hours on this
    job, a link that dials, and a link to their week in Hours.
  - Hours to date by person. This job's invoices with their status. Then the details:
    customer, address, notes, location, status.
  - A job's name anywhere in the office links here.

  Done when each of the four steps has been seen reached and not reached on staging.

- [x] 29. **Invoices: due date, status and payments.**
  - A migration adds `invoices.due_on`. A draft may name it; issuing fills it from the
    company's terms when the draft did not, and it is frozen with the rest of the invoice.
  - One function names an invoice's status for the list, the page, the PDF and the email:
    Draft, Issued, Partly paid, Paid, Overdue, Void. Draft, issued and void are read from
    the invoice's own stamps, as today; the rest are worked out from the payments and from
    the due date against the company's today. None is stored.
  - The list on `DataTable`: number, customer, job, issued, due, balance, status badge.
    Drafts, Outstanding, Overdue and Paid are presets in the address. Above it, one line of
    three figures: outstanding, overdue, paid this month.
  - The invoice: Record payment is a dialog (date, amount, method, note); a part payment
    leaves the rest owed. Every send stays listed with its outcome. Download PDF sits
    beside Send.
  - Today's money band gains Overdue.

  Done when tests walk one invoice through issue, a part payment and the final payment,
  and a second one past its due date to Overdue with no manual step.

- [x] 30. **The customer-ready invoice.** The only thing a customer of D Sierra sees.
  - At issue the invoice takes a copy of what prints: the company's name, address, phone
    and email, and how to pay. An issued invoice's page never changes when Settings do
    (invariant 6). Today the PDF reads the company's name live; this ends that.
  - The PDF (`invoices/pdf.ts`) opens with the amount due, the due date and the invoice's
    number. Then the company's block, the customer, the job, the lines, payments received
    and the balance. Then How to pay. PAID across the head when nothing is owed; VOID as
    now.
  - The email (`invoices/send.ts`) says the same three things in its first lines, then how
    to pay and the number to call. Plain text, as now.

  OWNER: confirm one invoice sent from staging arrived in an allow-listed inbox with its
  PDF. Done when a test finds the amount, the due date and the instructions in the PDF's
  text and in the email, an invoice issued before a change to Settings prints as it did,
  and the owner has seen the email arrive.

- [x] 31. **Undo on schedule edits.** Moving, changing or removing a shift nobody has
      clocked in on shows at once and offers Undo in a toast for a few seconds. The server
      still decides: a refusal puts the grid back as it was and says why, from the answer's
      own code. A started shift, Copy last week (which has its own undo) and everything
      outside Schedule keep waiting for the server. Nothing append-only is ever shown before
      it is written. Done when a test for each change (move, edit, remove) shows the cache
      restored after a refused answer, and Undo and a rollback have each been seen on
      staging.
- [x] 32. **Keyboard row movement.** In every `DataTable` and in the schedule's grid: the
      arrow keys, or J and K, move a visible focus through the rows, and through the cells
      of the two grids; Enter or Space opens the row's panel or page; Escape closes it and
      returns the focus. A key never acts while a field has the focus. `?` lists the keys.
      Every action stays reachable by pointer and by Tab. Done when Hours has been worked by
      keyboard alone on staging, from opening the screen to downloading the CSV.
- [x] 33. **The command menu.** Ctrl or Cmd + K, and a button in the header. Type to jump
      to a person, a job, a customer or an invoice, from the lists the office already holds
      (no new search on the server), or to run New shift, New invoice, Invite a person or
      Export hours. A `combobox` over a `listbox`, in both languages, closed by Escape. Look
      up whether a small library earns its place against a native `<dialog>` before adding
      one. Done when each jump and each action has been reached by keyboard on staging and
      the menu has been seen at 390.
- [ ] 34. **The first fix release.** OWNER merges `main` into `production` when the pay
      period has turned up something to fix. A fix to the phone app reaches the crew as a new
      build.
- [ ] 35. **The finish line.** One full pay period on real phones, payroll hours exported
      from TRADER, one real invoice issued and emailed.

### Found along the way

- [ ] OWNER: `STAGING_MIGRATOR_URL` in `.env.staging` ends in a cut-off query parameter
      (`&ch`); the value in GitHub's `staging` environment is whole. Fix the file's copy.
- [ ] OWNER: the `staging` environment variable `E2E_COMPANY_ID` is no longer read; delete it.
- [x] Clerk's fixed test code (424242) is refused on staging's sign-in form, so a person
      cannot sign in to staging's office by hand with a fixture number; the smoke test uses
      single-use tickets. OWNER: turn the development instance's test mode on, or accept
      tickets as the only way in. Decided 2026-11-20: test mode stays off; the owner signs
      in to staging as himself by texted code, and the machine by ticket.
- [x] The phone has still never signed in to staging. A development build pointed at
      staging reaches Clerk and gets to the code step for a fixture number, and the fixed
      test code is refused there too, so the phone was seen against the local server only.
      Blocked on the Clerk item above, then items 2 and 3.
- [x] OWNER: `pnpm --filter @trader/db onboard` and `pnpm db:migrate` fall back to the local
      database when `DATABASE_URL` is given empty, as an unset `$OWNER_URL` makes it. Decide
      whether `run-onboard.ts` should refuse a blank `DATABASE_URL`. Decided 2026-11-20: it
      stays as it is, since `.env` relies on blank meaning local; the runbook's commands
      refuse an empty `$OWNER_URL` themselves.
- [x] Item 2's fix is on staging and the office signs in there (the smoke test, by
      ticket). Its box waits on the other half of its "Done when": a phone build signing in
      to staging, which item 3's Demo sign-in now makes possible without Clerk's test mode,
      once the owner sets its two variables (next entry).
- [x] OWNER, item 3: the owner chose the way on 2026-11-19, a Demo code answered with a
      single-use sign-in ticket, and it is built: `demo.signIn`, and "I have a demo code" on
      the phone's sign-in. It admits only the people of the one company the deployment
      names. Staging has no door until the staging Vercel project is given
      `DEMO_SIGN_IN_CODE` (16 characters or more, no space) and `DEMO_COMPANY_ID` (the
      fixture company's id), which the session cannot set, and is redeployed. Then: a phone
      build signs in to staging with a fixture number and no code sent, and items 2 and 3
      are ticked. What was read first: Apple asks for a demo account that never expires;
      Clerk's test numbers work in production only with Test mode on, which Clerk calls
      "highly discouraged"; a Clerk sign-in token is single use.
- [x] Seen on 2026-11-19: a development build pointed at staging signed in through the
      Demo door as the fixture worker, with no code sent, and opened on staging's own job.
      The first tries were refused by Clerk as "already signed in": a session from an
      earlier try was still in the simulator's keychain, which outlives a cleared app. The
      sign-in screen now signs a stale session out before a new sign-in, by either way in.
- [x] `labor.repair`'s answer still calls an entry's flags `reasons`
      (`packages/api/src/labor/repair.ts`); item 4 named the push acknowledgement and the
      phone's outbox only. Rename it with item 16, which rebuilds its one screen.
- [x] Item 7 on staging by eye, 2026-11-19: every office screen at 390, 768 and 1280, in a
      session made by a single-use ticket and signed out after. Nothing scrolls sideways,
      the console is clean, the company's name and the account menu are in the header. One
      flaw found, older than the shell and unseen locally because the demo has no invoice:
      on Invoices the row's hairline broke under the number, because the link's style sat
      on the cell. Fixed.
- [ ] OWNER, with production: `TRADER_HOME_HOST=dsierrapainting.jpteq.app` and
      `CLERK_AUTHORIZED_PARTIES=https://app.jpteq.app,https://dsierrapainting.jpteq.app` in
      the production project's variables (`README.md` lists them, from item 18 on).
- [ ] Item 8 added two native packages to the phone, `expo-haptics` and
      `@expo/vector-icons`, at the versions `expo install` names for SDK 58: a development
      build made before 2026-11-19 has no haptics module and must be rebuilt. Neither adds
      a permission or an entitlement.
- [ ] The Android emulator on this Mac builds with Android Studio's own Java
      (`JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`); there is
      no other JDK. A freshly installed Android development build opens Expo's developer
      menu over the app on its first relaunch; `offline-capture.yaml` puts it away.
- [ ] Item 9's screens were seen on the iPhone simulator and the Android emulator in both
      languages, the texted-code sign-in in a build pointed at staging, with one gap: the
      Android capture of Week in Spanish fired before the tab had changed. Week in Spanish
      was seen on the iPhone, and Week in English on Android.
- [ ] The Maestro suite's sign-in failed once in three runs on a fresh iPhone 17 simulator:
      the tap on Sign in never reached the API, and the same flow passed on the next two
      runs unchanged. If it recurs, wait for the keyboard before the tap
      (`apps/mobile/.maestro/parts/sign-in.yaml`).

- [ ] Item 10, for the signing in item 13: `expo-notifications`' config plugin adds the push
      entitlement (`aps-environment`) to the iOS build by default. It is switched off in
      `apps/mobile/app.json` (`enableRemoteNotifications: false`), and the generated
      entitlements file carries no such line: the reminders never leave the phone, so the
      App ID needs no Push Notifications capability. On Android the build declares
      `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED` (reminders survive a restart) and no
      exact-alarm permission.
- [ ] Item 10, seen on the emulator: without an exact alarm Android delivered a reminder
      one to two minutes late; the iPhone was on time. A pull in that gap used to cancel
      the reminder as past, so none arrived at all; one whose time has come is now left
      pending for fifteen minutes and never set twice
      (`apps/mobile/src/sync/reminders.ts`). The sentence states the shift's own time, so
      a late one still reads true.
- [ ] Item 10, not seen: a tap on a reminder opening Today on the iPhone. It was seen on
      Android. On the simulator the tap was driven through Maestro, whose driver crashed
      the app (`XCTAutomationSupport`, not the app's own code); try it by hand on the first
      TestFlight build.
- [ ] The Android emulator's keyboard opens a "Try out your stylus" tutorial over a text
      field and fails the Me flow. Once per emulator:
      `adb shell settings put secure stylus_handwriting_enabled 0`.

- [ ] Item 11, seen and not seen. Seen on the iPhone simulator in English and Spanish and
      on the Android emulator in English: the tab by person and by jobsite, a person's
      sheet, Add a shift. Seen on the iPhone only: Move, Set the jobsite's location, and
      the tab with no connection. Not seen anywhere: Call dialing, since a simulator has
      no phone.
- [ ] Item 11: Set the jobsite's location sends the job's other facts back as it read them
      a moment before, because `job.update` replaces the whole record. An office edit in
      that same second would be overwritten; a procedure that writes the location alone
      would close it.
- [ ] Item 11: the demo's second admin (Marcus Bell) has no shift, so the app opens on
      Crew for him; the stamps-off flow goes to Today by its tab.

- [ ] OWNER, item 14: read the office's Spanish once on staging (gate 5). It is in
      `apps/web/src/app/i18n/es.ts`; the language is behind your name in the header.
- [ ] Item 14: on Clerk's development instance the sign-in form shows Clerk's own
      "Secured by" and "Development mode" marks in English beside its Spanish. They are
      Clerk's, not the office's, and a production instance does not draw the second.
- [ ] Item 14: `@clerk/localizations` is pinned at 4.24.6, the release built on the
      `@clerk/shared` that `@clerk/nextjs` 7.9.25 uses. Move the two together.
- [ ] Item 14, at 390 wide in Spanish: the Schedule's seven day buttons take two rows and
      "Esta semana" two lines, where English takes one. Nothing is cut. Item 17 rebuilds
      that screen.

- [ ] Item 15: the demo company has no entry flagged `unscheduled` and no session left
      open, so for the look at the six badges and the strip one of each was written into
      the local demo database by hand, and the demo reset after. A demo that holds both
      would let `ui-check` see them without that.
- [ ] Item 15: between 720 and about 1100 px of content the week table is wider than its
      column, more so in Spanish, and scrolls inside its own box; the page does not scroll
      sideways. Under 720 a row stacks, one line per day.
- [ ] Item 15: with Flagged only on, the strip of open sessions lists only those whose
      cell is flagged, since the strip reads the same answer as the table.

- [ ] Item 16, seen and not seen. Worked by keyboard alone, in English at 1280 and Spanish
      at 390 on the demo: Tab to a cell, Enter, the panel, Correct, a time typed with the
      preview following it, Save, Escape, and focus back on the cell. Add missing hours and
      Void are the editors the entries section had, now inside the panel; they were not
      exercised again in this pass.
- [ ] Item 16: the hours shown as times are typed are a preview worked out in the browser
      (`hours/repair-set.ts`, previewOf). They are whole minutes of worked time, not the
      rounded hundredths the server answers once the correction is saved.
- [ ] Item 16: a `location` flag reads "No location" or "Off-site" in the day panel, where
      each entry says whether a stamp was recorded. In the week table a day's badge still
      reads "location": a day's flags are a sum over entries and `labor.hours` does not
      say which kind.

- [ ] Item 17, how it was seen: on the local demo with the schedule enforced, a week for
      six people entered through the form with every person and jobsite chosen from a list;
      a shift added from today's column; the worker clocked in on the iPhone simulator; the
      office moved them, the simulator offered the second jobsite after its next pull and
      they switched; then that started shift was ended early. The Android emulator was not
      part of this one.
- [ ] Item 17: a shift's hours in a sentence are the schedule's 24-hour times ("ends at
      03:00"), while the browser's own time field beside it reads in the browser's
      style ("03:00 AM").
- [ ] Item 17: a form's field that should take the focus when a side panel opens is marked
      `data-autofocus`; React's `autoFocus` loses to the dialog's own first-control focus.

- [x] OWNER, item 18 (gate 6): the homepage holds D Sierra's name, their logo and the two
      buttons, and nothing else, until their words, numbers and photos arrive. They go in
      one file, `apps/web/src/app/(public)/home-content.ts`; a part left empty draws nothing.
- [ ] OWNER, item 18: `/get` says "ask your office" for both phones on staging, because
      `NEXT_PUBLIC_GET_IOS_URL` and `NEXT_PUBLIC_GET_ANDROID_URL` are unset there. Set them
      in the staging project once a TestFlight link and a Play testing link exist, and in
      production with it (`README.md`).
- [ ] Item 18: the unlisted-host rule holds only where Clerk is the identity. Staging's
      deploy passed its smoke test under it, so staging's own address is one of the origins
      its `CLERK_AUTHORIZED_PARTIES` lists. A Vercel deployment's own `*.vercel.app` address
      now sends a page to the first listed origin; its `/api` still answers there.

- [ ] Item 19, how it was seen: on staging, signed in by ticket in a browser that says it
      is an iPhone, "Fixture Invitee" was invited on one of Clerk's fictional numbers
      (+1 401 555 0150) and the page offered Send the invitation; that link, opened on the
      iPhone simulator, is a new message with both languages written. A real phone was not
      part of it, and an Android phone's messages were not opened. The fixture person
      stays on staging's roster, invited.
- [ ] Item 19: a person's week in Hours is `/hours?person=<id>`: Hours narrowed to one
      person, with the way back to everyone.

- [ ] OWNER, item 21 (gate 7): the privacy policy and the terms are drafted and public on
      staging at `/privacy` and `/terms`, in English and Spanish, each saying at its top
      that it is a draft. Their words are one file,
      `apps/web/src/app/(public)/legal-content.ts`. Three things in it are yours and were
      not invented: the legal name of whoever operates TRADER (`OPERATOR`), an address for
      privacy questions (`PRIVACY_CONTACT`), and any clause a lawyer wants, such as
      liability or governing law, of which the draft has none. Approving is setting
      `APPROVED` to true with the first two filled in; the box is yours to tick.
- [ ] Item 21: the policy says error reports go to Sentry from the office and the phone.
      The office's do today. The phone's begin with item 12, which waits on gate 3; the
      policy should not be approved as it reads before that item lands, or the phone's
      half of that sentence comes out until it does.

- [ ] Item 26, how it was seen. On staging, with rows made through the office itself for
      fictional people: an open session from two days before with Fix landing on that day's
      panel in Hours, a late person with Call, one person on the clock, one expected, one
      done, what is owed, a draft, and the line for complete jobs, each link landing on its
      list; in English at 1280 and Spanish at 390. A clear day's one line was seen on the
      local demo, not on staging, whose fixture shift keeps one person late for the day.
      The two sessions left open for the check were closed by a correcting clock-out, so
      staging's fixture people can clock in again. Three fixture people were added to
      staging's roster for it: Fixture Invitee, Fixture Expected, Fixture Done.
- [ ] Items 12, 13 and 22 to 25 wait on the owner (gates 3, 4, 8, 9 and 10) and were passed
      over in order. Item 24, the release job, needs item 13's `eas.json`, which waits on
      the Expo token and the signing credentials; it was not built ahead of them.
- [ ] Item 27 will find this: the Jobs editor's Save details sends no `notes`, and
      `job.update` replaces the whole record, so saving a job's details in the office
      clears the notes the crew sees. Fixed with item 27's notes field.

- [ ] Item 27 turned `main` red for one commit (`90a403e`): the deploy's smoke test on
      staging edits the fixture customer, and it still pressed the row's Edit button,
      which the side panel replaced. `check` cannot see this: the smoke test runs only
      after a deploy. A change to what Customers, People or the sign-out menu draw is run
      against staging first, with tickets, as `pnpm --filter @trader/web e2e:staging`.
- [ ] Item 27, how it was seen: on staging a job was created with a new customer in one
      form, its location pasted as a maps address and read back as the pair with a 200 m
      radius, the customer then on the Customers tab; Jobs in Spanish at 390. Staging keeps
      that job and customer ("Item 27 fence", "Item 27 Customer", with the time in their
      names).
- [ ] Item 27: every reader of `job.list` now gets each job's hours, which folds the whole
      ledger: the Schedule, Invoices and Hours screens ask for it only for the names. Fine
      for a crew of ten; a `job.names` read would spare it if the ledger grows.

- [ ] Item 28, how it was seen on staging: "Item 27 fence" with none of the four steps
      reached and Schedule as its action; "Item 11 porch repaint" scheduled, with hours and
      invoiced but not paid; then, once the $352.50 owed on its invoice was noted as paid
      from the invoice's page, all four reached; that page in Spanish at 390. Create
      invoice as the action was seen on the local demo. Staging's invoice 1 is now paid.
- [ ] Item 28: a job's name links to its page from the Jobs table, the Invoices list, an
      invoice's page and the Hours list. In sentences (Today's rows, the Schedule's cards,
      which are buttons of their own) it is still plain text.

- [ ] Item 29, how it was seen on staging: invoice 2 drafted, issued, part paid ($250 of
      $650, the dialog closing and $400 left owed) and paid; invoice 3 drafted with a due
      date already past and Overdue the moment it was issued; the five presets in the
      address and kept through a reload; the three figures; Today's Overdue row and its
      link to the preset; the list in Spanish at 390. Invoice 1, issued before the
      migration, was backfilled with its day of issue as its due date (staging's terms are
      0 days). Staging now holds invoice 3 overdue for $400 and two drafts.
- [ ] Item 29: migration 0003 fills the due date of invoices already issued, with the
      invoice's trigger disabled for that one statement. It rewrote staging and development
      rows only. The same statement run once production holds issued invoices would be a
      rewrite of frozen rows and the owner's to approve.
- [ ] Item 29: Paid this month counts payments by the day the office typed as paid, in the
      company's calendar month, not by the day they were recorded.

- [x] Item 30 is built, deployed and seen on staging; its box waits on the OWNER alone:
      send one invoice from staging to an allow-listed inbox (invoice 4 is ready: open it,
      Send) and confirm it arrived with its PDF. Seen on staging: Settings filled with
      fictional words and terms of 15 days, invoice 4 issued after and printing the
      company's block, How to pay and who to ask, due 15 days on; invoice 3, issued before,
      downloaded again and still the page it was; invoice 2 with PAID across its head and
      its two payments listed.
- [ ] Item 30: migration 0004 gave invoices already issued the company's words as they
      stood at the migration, since until then the page read them live. Like 0003's
      backfill it rewrote staging and development rows only.
- [x] Item 30: the customer's name and address on the page are still read live from the
      customer, and the job's name from the job. The item names only the company's block
      and how to pay as the copy taken at issue. OWNER: say whether the customer's block
      should be copied at issue too. Decided 2026-11-20: the copy takes everything that
      prints, the customer's name and address and the job's name with it.
- [ ] The status line on the PDF ("Status: Overdue") is as of the moment the file is made,
      like the amount due and the payments; the same invoice downloaded on a later day can
      say something else. The copy taken at issue never changes.

- [ ] Item 31, how it was seen on staging, with every answer held back a second and a half
      so the grid could be read before the server spoke: a shift moved to another day and
      undone; a shift's end changed and its toast gone by itself; a shift removed and
      brought back by Undo; and a rollback, where a second page moved one shift onto a day
      and the first page, not having heard, moved another onto the same hours: drawn at
      once, then put back, with "This shift and Item 11 porch repaint 08:00–12:00 overlap
      during 08:00–12:00" above the grid. The toast in Spanish at 390. The shifts planned
      for the walk (the week of Dec 28) were removed after.
- [ ] Item 31: Undo is the opposite change sent to the server, not a write held back, so
      a tab closed while the toast shows loses nothing. A removed shift comes back under
      its own id; if someone planned an overlapping shift in those seconds, Undo is refused
      and says so.
- [x] Item 31: removing a shift still asks once before it is done (the two-step control
      the office uses everywhere), and then also offers Undo. OWNER: say if the question
      should go now that Undo exists. Decided 2026-11-20: the question goes; one press
      removes the shift and Undo is the way back.

- [ ] Item 32, how it was seen on staging, with no pointer after sign-in: Tab to the
      menu's Hours and Enter; J into the week's table, down, K, Enter opening a person's
      day, Escape closing it with the focus back on the same cell; `?` listing the keys;
      J and K typed into a field doing nothing; Tab to Export for payroll, Enter, Tab to
      Download CSV, Enter, and the file `payroll-hours-2026-11-16-to-2026-11-22.csv` saved.
      Then the schedule's grid by J, right and down, and Jobs by J, right, Space opening a
      panel and Escape returning the focus.
- [ ] Item 32: J and K enter a screen's table from anywhere; the arrow keys act only once
      the focus is in a table, because elsewhere they scroll the page. In Hours a day with
      no entries opens nothing, so the keys pass over it.
- [ ] Item 32: the list of keys is also in the account menu (Keyboard shortcuts), for
      someone who does not know to press `?`.

- [ ] Item 33, how it was seen on staging, by keyboard: Ctrl+K, typed, Enter, for a person
      (their panel on People), a job (its page), a customer (their panel) and invoice 3
      (its page); then New shift (the Add shift panel on Schedule), New invoice (the Start
      draft form), Invite a person (the Add to roster form) and Export hours (the export
      dialog, chosen with the arrows and nothing typed). Escape closing it, the header's
      button opening it by pointer, and the menu in Spanish at 390 with nothing scrolling
      sideways.
- [ ] Item 33: no library was added. cmdk 1.1.1, looked up 2026-11-20, brings four Radix
      packages for what a native `<dialog>` and one component do here.
- [ ] Item 33: an action is an address (`/schedule?do=shift`, `/invoices?do=invoice`,
      `/people?do=invite`, `/hours?do=export`), so it can be linked to. The menu holds at
      most the 500 newest invoices, which is all `invoice.list` answers.
- [ ] Item 33: the header's button reads "Ctrl K" on every machine; on a Mac Cmd+K works
      too and is not named.

- [ ] Items 12, 13 and 24, built on 2026-11-20 as far as they go without a key.
      `apps/mobile/eas.json`: development, preview and production profiles, the build number
      EAS's own (the remote version source, `autoIncrement`), read back in the app through
      `expo-application`. Sentry in the phone app (`apps/mobile/src/report.ts`): silent with
      no DSN, errors only, every event rebuilt from an allow-list, a failed sync call
      reported once. "Preview builds" and "Release the phone app" as two workflows. None
      has run against Expo. Item 12 waits on a preview build to throw its error in; item
      13 on the owner's first preview builds by hand; item 24 on the app's Apple ID (next
      entry) and on being read in the release's pull request.
- [ ] OWNER, item 24: `eas.json` has no `submit.production.ios.ascAppId`, and the release
      workflow stops before Expo without it: EAS refuses a submission run by a machine
      unless it is told the app's Apple ID, the number App Store Connect shows once the app
      record exists (`README.md`, "Make production exist", step 6). It is public: give it
      and it goes into `eas.json`.
- [ ] OWNER, item 24: what signs a build is kept at Expo, as the preview's is: the iOS
      distribution certificate with its App Store profile and the Android upload keystore.
      A build run by a machine cannot make them, so the first build of the production
      profile for each platform is run by hand, once, as the preview's is. The session is
      blocked from running it.
- [ ] Item 24, read in EAS CLI 27.10.0's own code (`build/submit`): a key named by a file in
      `eas.json` is read on the runner and handed to EAS Submit with that one submission; it
      is not saved among the account's credentials. Expo's machines do the upload, so they
      hold it for as long as the submission runs.
- [x] OWNER, item 13: EAS's `preview` environment still needs its three plain-text
      variables, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and
      `EXPO_PUBLIC_SENTRY_DSN`. The session was blocked from creating them and from reading
      `.env.staging` for the first two. `eas env:create` is deprecated in the CLI installed
      here (27.10.0) in favour of `eas env:set`, which takes the same flags.
- [ ] Item 12: `@sentry/react-native` 8.28 and `expo-application` are native packages, so a
      development build made before 2026-11-20 must be rebuilt. `@sentry/cli`'s install
      script is allowed in `pnpm-workspace.yaml`. A crash in native code is reported by the
      platform's own SDK and does not pass the JavaScript allow-list; it carries the
      device's model and system version, and nothing the app holds.
- [ ] Item 13, on the owner's word: `ios.config.usesNonExemptEncryption` is `false`. Apple's
      page (Complying with Encryption Export Regulations, read 2026-11-20) says to set NO
      where an app "only uses forms of encryption that are exempt", and names HTTPS through
      the system as typically exempt. That fits: the app's only encryption is the system's
      HTTPS and keychain; SQLite is not encrypted and nothing brings an algorithm of its
      own. The same page notes that an app using exempt encryption may still owe the U.S.
      government a year-end self-classification report: the owner's to check.
- [ ] `expo-doctor` reports two things older than this work: `@expo/vector-icons` wants
      `expo-font` installed beside it, and TypeScript is 5.9 where SDK 58 names 6.0. The
      icons have drawn on both simulators without it.

- [ ] The amendment of 2026-11-20 on staging, seen and not seen. Seen: the deploy of
      `015950f` green with its smoke test, migration 0005 applied (six in staging's journal),
      and all four of staging's issued invoices holding the customer's and the job's name
      (Neon's read-only connector). Not seen by eye: the invoice's page after a rename, and a
      shift removed with one press and brought back by Undo. This session could not use
      `.env.staging` in any form, so it had no address for staging and no sign-in ticket;
      the tests hold both, and the next session with staging's keys looks.
- [ ] OWNER, the amendment's F, not done for the same reason. The owner's own login on
      staging: not invited (it needs a signed-in admin's session on staging). Clerk's lock
      on the development instance: not proved from a user's side (it needs a fixture
      person's signed-in session). `STAGING_MIGRATOR_URL` in `.env.staging` and the staging
      variable `E2E_COMPANY_ID`: neither checked; the two entries at the top of this list
      stay open.

- [x] The workstation, and CI's check before the push. By the owner's word of 2026-11-22;
      workflow, not product, and nothing of the MVP changed. `pnpm check:ci` is CI's
      `check` step for step (`scripts/check-ci.sh`); the pre-push hook lets a tree onto
      `main` only when that was green on it, or when it differs from such a tree in Markdown
      alone, and refuses a push to `production`, a push while a release is open and a push
      that holds a secret. Three Claude Code hooks: a guard that reads the whole command, a
      formatter for the file just written, a session's first lines. The `verify` skill makes
      the green. On the workstation the checks and the Android flows run as an account with
      neither sudo nor Docker. Seen: the check green there in 47 s and here in 74 s; red at
      typecheck and at lint, nothing recorded; all nine sections of the phone flows green on
      the Android emulator there and on the iPhone simulator here.
- [x] OWNER, to arm the above: the hooks block into `.claude/settings.json` (his file), and
      `git config core.hooksPath .githooks` in his clone. Until both, the hooks are files
      and stop nothing.
- [ ] The release kit: a `/release` skill, a `release-auditor` agent that reads
      `production...main` in a context that did not write it, and `scripts/release-facts.sh`.
- [ ] `scripts/staging.sh`: staging's address, its readiness, the smoke test and screenshots
      of the office as the suite's admin, for a session that may use `.env.staging` and may
      not read it. It closes the entry above that begins "The amendment of 2026-11-20".
- [ ] After MVP item 20's browser suite on the demo data, by the owner's word: built as a
      job on the workstation first. Into `check` once it has stayed green for two weeks,
      which is the owner's to say. Built 2026-11-22 as `pnpm e2e:local`: three tests, green
      on the workstation and here, red on a screen broken on purpose.
- [ ] A nightly run of `main` from a clean clone on the workstation: the check, the browser
      suite and the Android flows with nothing warm. Set aside by the owner on 2026-11-22:
      not built, and not before the first release.
- [ ] At item 23, with the owner: Claude's vendor connectors scoped so that none reaches
      production (Neon pinned to staging and read-only, Sentry to its inspect tools, the
      Vercel plugin off), and the `production` environment limited to its branch.
- [ ] The entry above that begins "The Android emulator on this Mac" is history: Android
      builds, the emulator and the phone flows run on the workstation alone (2026-11-22).
- [ ] For the scoping at item 23: the Expo CLI also reaches the whole account, and the entry
      above does not name it. Clerk's write tools are denied in `.claude/settings.json`
      once the owner applies the patch of 2026-11-22.
- [x] By the owner's word of 2026-11-22: `trader-ws` moves into the repository as
      `scripts/trader-ws`. The host comes from a file in the owner's home through a shim;
      the script names no alias, user or address. It, its audit and its ledger helpers are
      guard files: `guard.mjs` covers their paths and `release-auditor` flags a change to
      them. Workflow, not product.

- [x] Gate 6 arrived on 2026-11-22: D Sierra's paragraph, two contacts, their address,
      their capability statement, and their word that the photos may come from their
      socials. On the homepage, each by the owner's word of that day: the name as they
      write it, D'Sierra Painting; their paragraph as sent, and a Spanish translation of
      it; "Central Falls, RI", as their capability statement prints it, and not the street
      address; (401) 286-9997 and dsierrapainting@gmail.com. The second contact they sent
      is not public. Six photos from their Instagram, chosen with the owner, in
      `assets/pics/`, resized and stripped of all metadata; none shows a face. Seen on
      staging at 390 and 1280 in both languages: nothing scrolls sideways, every photo
      loads, and the page asks only its own host.
- [ ] By the owner's word of 2026-11-22, a photo of work under way is never shown alone on
      the homepage. On the sign-in page it is, by his word of 2026-11-23: that door is the
      team's. The one on the homepage, a painter spraying a ceiling, carries the same ceiling
      finished, from D Sierra's post six days later, on a strip that a swipe moves along;
      its line is a link, for a mouse. CSS alone, no script. A photo's `finished` in
      `home-content.ts` is how the next one is paired.
- [ ] The school hallway was one of the six at first. It shows masking paper still up
      around its lockers, and the owner had the classroom of the same school put in its
      place.
- [ ] OWNER, before production: D Sierra's OK on the photos themselves. They said the
      photos may come from their socials; they have not seen which. On
      `instagram.com/dsierrapainting`, the first photo of each post: `/p/B_YDyNOAgkC/`
      (the Newport house), `/p/CgDG5nBuGy4/` (the home with the porch), `/p/DNgd-lxBmm9/`
      (the classroom), `/p/CRUqA4PhPV0/` (the apartment), `/p/CqJdVo_uLoa/` (the shopping
      center), `/p/B4DswuynL42/` (the painter spraying the ceiling) and, shown as that
      ceiling finished, `/p/B4SlajLHXFz/`.
- [ ] `assets/pics/home-exterior.jpg` shows a house number, 65, beside its door, and no
      street. The owner saw it and kept the photo.
- [ ] OWNER, item 21 (gate 7): the legal pages now name JPTEQ LLC as the operator and
      `privacy@jpteq.app` as where to write, which the owner routed to his inbox. They
      stay drafts: `APPROVED` is set on his "approved", after item 12 has been seen.
- [x] Item 30, read from staging's own tables on 2026-11-22: invoice 4 has never been
      sent. The one send that went out on staging is invoice 1's, on 2026-11-19, the day
      before item 30 was built. The box was ticked that day on the owner's answer to a
      question, with nothing looked at, and unticked the same day. It waits on invoice 4
      sent from staging and seen to arrive with its PDF.
- [x] Item 30, ticked later on 2026-11-22, on two things. Read from staging's tables:
      invoice 4 has one send, at 02:19 UTC on 2026-11-23, with the outcome "sent". And the
      owner's word that the email arrived with its PDF; he did not name the inbox.
- [ ] Item 12: the app had no way to throw an error on purpose. In a staging build alone,
      a long press on the build's number in Me sends one report through `report.ts` and
      the screen says so. Seeing it waits on the owner's two preview builds by hand.
- [ ] The gates on 2026-11-22. Checked: the Sentry project for the phone exists; EAS's
      `preview` environment holds its four variables; `.env.staging` holds both suite
      numbers, so `scripts/staging.sh look` signs in. On the owner's word: `EXPO_TOKEN` is
      in GitHub's `staging` environment, one iPhone is registered, the Apple and Play
      developer accounts exist, and the rate-limit rule on `/api` is published on the
      staging project (first seen with the action Log, which holds nothing back). EAS
      has no build of any profile yet.
- [x] OWNER: the owner's own login on staging. `scripts/staging.sh invite`, given a
      number and a name, invites one person as an admin through `roster.invite`, signed in
      by the suite's ticket (`apps/web/e2e/invite.run.ts`). Run against staging with a fixture
      number already on the roster: it answered "rejected (phone_taken)", and the users
      table was as before. "invited" has not been seen there. A test person was not made:
      a users row is never deleted and nothing takes a login back out of Clerk, so one
      would have stayed on staging as an admin. The owner runs it with his own number.
- [x] The owner ran it on 2026-11-22: "roster.invite: HTTP 200, invited", and he signed
      in to staging by texted code (his word). Read from staging's tables after: six
      people, two of them admins, the new one on a number outside the fixture range and
      bound to a login. Gate 1 holds.
- [x] The deploy job failed three runs in a row on 2026-11-22 with staging about to serve
      the commit. Vercel's deploy hook gave no answer within the job's thirty seconds; the
      deployment it had started appeared fifty seconds after the call. Re-running the
      failed job once staging served the commit passed each time, smoke test included. The
      one call now waits two minutes (`.github/workflows/ci.yml`), on the owner's word.
- [ ] A second Vercel project, `trader`, is connected to the repository beside
      `trader-staging`: each push to `main` starts a deployment there that
      `apps/web/vercel.json` cancels.
- [ ] The two hand builds of items 12 and 13 ran on 2026-11-22, both of the preview
      profile at commit `694325e`. Read that evening: EAS lists an iOS build (number 1) and
      an Android build (version code 2), both finished; each build's log shows its source
      maps uploaded to Sentry's `trader-phone`, and the iOS log its debug files too; the
      build's DSN names that same project. Staging's tables hold two clock-ins and two
      clock-outs between 02:49 and 02:55 UTC on 2026-11-23 by the owner's own admin, each
      with a location stamp and none captured offline, which is the iOS build signed in to
      staging. Not yet: Sentry holds no event of any kind, so the report made on purpose
      (a long press on the build's number in Me) has not been read back and item 12 stays
      open; the Android build has not signed in, so item 13 stays open. On the Mac's
      emulator the Android build was refused (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) because
      a development build signed with another key is installed there; uninstalling that
      one first clears it.
- [x] Item 13, ticked on 2026-11-22 on what was read that evening. Both builds are of
      commit `694325e` (EAS's list). The iOS build: the clock rows above. The Android
      build: Clerk's log of the development instance shows a native Android client
      (`okhttp`) asking for a texted code, verifying it and getting a session at 04:06 UTC
      on 2026-11-23, for the login that staging's users table binds to the owner's own
      admin; the owner says he was then signed in on the Android device. Nothing read shows
      that phone's first call to staging itself. The "Preview builds" workflow has still
      never run: it is proven the next time a build is wanted.
- [ ] Item 12, as it stood that evening: no report from either of the owner's phones had
      reached Sentry. The path itself works. The development build on the iPhone simulator,
      told the phone project's DSN and `staging`, sent the report made on purpose twice
      (a long press on the build's number in Me; "Test report sent." showed), and both
      were read back as `TRADER-PHONE-1` with the screen, the build's number, no message,
      no user and no address. That is not item 12's "Done when": it was not a staging
      build, and its frames were readable only because a development bundle is not
      minified. The box waits on one long press in a preview build, read back with its
      frames resolved by the uploaded source maps.
- [x] OWNER: a phone report reaches Sentry with a city on it. Sentry looks up the
      connection's address as the report arrives and keeps the country, region and city
      (`user.geo`), though it stores no address and the app sends none. The privacy page
      says a report "is built to carry no name, phone number, location or entry". To
      settle before the legal pages are approved: have Sentry remove it, send reports by
      way of TRADER's own service, or say it in the policy.
      The owner chose the policy, 2026-11-22: its sentence on Sentry now says that Sentry
      sees the address a phone's report arrives from and keeps the city, not the address.
      It is the owner's to read with the rest before he says "approved".
- [ ] A report from a development build carries this machine's file paths in its frames,
      the account's name among them (`report-event.ts` passes any path with no white
      space). A store or preview build's frames name the bundle only. To weigh: keep a
      frame's file name only where it begins `app://`.
- [x] The homepage redesigned, by the owner's word of 2026-11-22: it is the first thing a
      customer of D'Sierra's sees, and it read as an unstyled document. Still one page,
      and Call and Email are still all a customer can do on it. A navy header that stays,
      with the language and Team sign-in in it; a photo, the headline and where they
      work; four facts as paint chips; three jobs before and after; a gallery of twelve
      that opens each photo larger; what they do as two lists; Call and Email; a footer
      with Get the app, the policy, the terms and their Facebook and Instagram as plain
      links. On a phone Call is pinned to the bottom of the screen. This builds the
      services list and the gallery of "After MVP" 18 now; its estimate request stays out.
      Their navy and red get a scale of their own (`[data-brand]`, `theme.css`), the
      headings are Bodoni Moda 5.3.0 from `@fontsource-variable/bodoni-moda` (OFL 1.1),
      served by the app, and red is Call and nothing else: on the navy it is 2.63:1, so it
      never sits there. Done when seen on staging at 390 and 1440 in both languages,
      loading nothing from another host.
      Seen on staging at `cdd8dea` on 2026-11-23, signed out, at 390 and 1440 in English
      and in Spanish: nothing scrolls sideways, all twenty photos load, as AVIF, with
      their blurred stand-ins, and a browser with no session asked only staging's own
      host, with a clean console. By keyboard at 1440: every control in order, a white
      ring on the navy and a red one elsewhere; the viewer steps by arrow key, closes on
      Escape and gives the focus back to its photo. Under reduced motion nothing moves.
      `/get`, the policy and the terms measure as they did at 390 and 1280. Lighthouse
      13.6.0 there: mobile 96 to 99 over five runs, the largest paint (simulated, slow 4G)
      2.1 to 2.7 s with 2.4 the median; desktop 100 three times; accessibility, best
      practices and SEO 100 on both, and no layout shift.
- [ ] Its words. D'Sierra's paragraph is said in parts, adding nothing, with three
      things that are the owner's and not theirs: "Serving Rhode Island and upper New
      England" (2026-11-22; they have sent no service area), "In business" under "Since
      2017" (2026-11-23), and the line that names each job. OWNER, before production:
      D'Sierra's OK on the area line.
- [ ] Its photos, by the owner's word of 2026-11-22 that D'Sierra allows it: eleven more,
      from their Facebook page (`facebook.com/profile.php?id=100063510039251`), each saved
      by the page's own Download at the size Facebook serves: 2048 px at most, and three
      posts of 2018 to 2021 exist there only at 720 by 960. Facebook's tracking tag and
      every other metadata segment are cut out without re-encoding. Each was looked at:
      no face, no plate, no house number. `photo.php?fbid=` 944847877642205 and
      944852370975089 (the colonial house, finished and peeling), 951344443659215,
      951344653659194 and 951344436992549 (the dining room, finished, yellow, and from
      the mantel), 523506946442969 and 523507029776294 (the office), 1130741604394019
      (the house with red trim), 318203645647823 (the warehouse), 318205188981002 (the
      dark commercial building), 979968426138005 (the bridge railing). They join the
      list above that waits on D'Sierra's OK before production.
- [ ] The rule on a photo of work under way changes, by the owner's word of 2026-11-22:
      the crew at work may be shown, never a face. The colonial house's "before" shows a
      painter from behind; the ceiling's, a painter under a spray hood.
- [x] A public page's policy now admits a `style` attribute and nothing else inline
      (`style-src-attr 'unsafe-inline'`): next/image draws a photo's blurred
      stand-in as one. The owner's choice of 2026-11-22, over leaving the policy whole
      and holding a photo's place with a tint. Photos are served as AVIF, then WebP
      (`next.config.ts`), by his word of 2026-11-23: Vercel bills image optimization by
      use on this plan ($0.05 per 1,000 transformations, `vercel pricing`), and each size
      is now made twice. Read from staging's response at `cdd8dea`: `style-src 'self'`
      and `style-src-attr 'unsafe-inline'`, and the photos arrive as `image/avif`.
- [ ] To weigh: camera originals in place of the Facebook copies, most of all the three
      at 720 by 960; and a version of the mark with no white behind it, for the header.
- [x] Fonts, found while measuring the homepage. The office's Inter is 352 KB, every
      script the typeface draws, and the root layout preloaded it on every page: on the
      homepage it was most of what stood before the first photo on a slow connection
      (mobile Lighthouse 86, and 98 with that one request blocked). By the owner's choice
      of 2026-11-23, the narrowest of three: no page preloads it, the office fetches it
      when its stylesheet asks, and the homepage reads Inter's Latin cut, 48 KB. This
      build's font manifest lists every preloadable font under every page, so a
      next/font preload is on every route or on none: the homepage's two fonts are files
      in `apps/web/public/fonts` instead, and the page writes the one preload itself.
      Read from staging at `cdd8dea`: only `/` preloads a font; `/get`, `/privacy` and
      `/today` fetch the office's Inter and draw in it.
- [ ] To weigh: `/favicon.ico` answers with the 2048 px logo, 234 KB, to every first
      visit of any page (seen among the homepage's requests in Lighthouse).
- [ ] To weigh, on the homepage: at 768 px and wider the three before-and-after strips
      are still keyboard stops though nothing scrolls there; and in English at 390, if
      the headline's font is late, the headline draws in four lines and then three.

- [ ] Item 21a, seen and not seen. On staging at `158a700`, signed out, on 2026-11-23: the
      one field at 390 and 1440 in both languages, with nothing scrolling sideways and
      nothing moving as Clerk loads; a field that is neither a number nor an email told so
      with no request made; an email and a number no login holds, each given the roster's
      one sentence; a fixture number taken to the code step, and a wrong code told so with
      the field cleared and focused, in English at 1440 and in Spanish at 390; Use a
      different number or email; Trouble signing in?; a signed-in visitor sent on by the
      server to the address the link carried, to Today without one, and to Today for an
      address that is not the office's. Not seen, so the box is not ticked: a right code
      making a session and landing in the office (OWNER: one sign-in to staging by texted
      code, as gate 1 has it), an expired code, too many tries, a locked sign-in, and an
      emailed code, since no fixture person has an email yet (item 21e gives one).
- [ ] Item 21a: two things shipped to staging and corrected the same hour, both seen there
      and neither by a test. Clerk's prebuilt form, opened on its number field by giving
      it "+1" to start from, could not be switched to email; and with Clerk's own
      stand-in while it loaded, the field arrived unfocused. Both went with that form.
- [ ] Item 21a: the office has no error reporting in the browser (Sentry is the server's
      and the phone's). A sign-in that Clerk leaves at a step the form has none for says
      so to the person and is otherwise only in their console.
- [ ] Item 21a: while Clerk's form was being tried against staging, one fixture number's
      code requests ran into Clerk's limit ("Too many verification code requests") for
      under an hour. The form now has that sentence in both languages.
- [ ] On 2026-11-23 the Mac's `node_modules` was found without its native binaries
      (esbuild's, Next's compiler, sharp's library), removed between 12:42 and 12:55 by
      nothing this session ran, so no test or dev server would start. Put back from the
      lockfile by `pnpm install --frozen-lockfile --offline --force` with
      `--config.optimistic-repeat-install=false`, without which pnpm answers "Already up
      to date" and puts nothing back. The cause is not known.
- [ ] A dev server leaves `apps/web/.next/dev/types`, which `tsc` reads: after a route is
      removed, `pnpm typecheck` fails on the stale file until that folder is deleted, on
      the Mac and, after `trader-ws e2e`, on the workstation. CI has no such folder.
- [ ] Item 21e, first landing (the invitation: by email alone, sent by email, and where it
      stands), seen and not seen. On staging at `f18e691`, on 2026-11-23, at 1440: a
      person invited by email alone and one by number and email, each with a login at
      Clerk tagged with its roster row, the first with no number; Not sent in the table
      for both; Copy the message turning one to Sent · not verified, with the send, who
      made it and when in the panel; Send by email refused for both by staging's own
      allow-list, said under the button and kept in the panel as not sent, the status
      unmoved; the email-only person taken through the office's sign-in to the code step
      ("We emailed it to ..."), which is also item 21a's emailed code; Verified on the
      three people who had signed in. Locally on the demo data at 390, 768 and 1280, in
      both languages: the same, the invite form refusing no address at all, a verified
      person's panel, nothing scrolling sideways, 48 px targets on the phone. Not seen: an
      invitation email arriving (OWNER: on staging, give a person an inbox staging may
      mail and press Send by email), a first sign-in turning a person to Verified, the
      text link on a real phone, the daily limit, and the Demo company's refusal, which
      have tests only. The two people stay on staging's roster: Fixture Email Only and
      Fixture Both.
- [ ] Clerk's test code is not taken on the development instance: `424242` for a
      `+clerk_test` address was answered as a wrong code on staging, once, on 2026-11-23.
      Its Test mode setting was not read. Until it is on, no sign-in by code can be
      finished without a real phone or inbox, which is why a right code is still the
      owner's to see (item 21a).
- [ ] Item 21a: an address put in the field before the page's script arrived (typed
      early, pasted, or filled in by the browser) was erased as React took the page over,
      and Send then answered that nothing was typed. Found on staging by filling the field
      at once. The first correction (`4fde560`, reading the field at submit) was wrong
      about the cause and changed nothing, which a second look on staging showed; the
      field's value is now the browser's own.
- [ ] The deploy job's smoke test on staging failed once, on `4fde560`: after the reload
      of an open customer panel, no panel within 20 seconds. The same test passed from
      the Mac against the same commit and on a re-run of the job. Not reproduced, cause
      not known.
- [ ] Item 21e, second landing: a Face ID or fingerprint key from the phone app is not
      removed when a person's address changes. `@clerk/backend` 3.27.0 has no call for
      one. Their sessions are revoked and their passkeys and Google or Apple links are
      removed. To settle when item 21c builds biometric sign-in: whether a key outlives a
      revoked session, and how one is removed from the server.
- [ ] Item 21e, second landing: a person invited before 2026-11-23 who has never signed in
      has a login at Clerk with no tag, so their address cannot be changed from People
      until they sign in once ("made before addresses could be changed here"). On staging
      that is the three fixture people of the smoke test; production has nobody yet.
- [ ] Item 21e, second landing (a worker's addresses), seen and not seen. On staging at
      `8abc4ac`, on 2026-11-23, at 1440: Fixture Both's email changed and Fixture Email
      Only given a number, each asked about first with the person and the address named,
      each answered Changed and listed in the panel with who and when; read back at
      Clerk, the two logins hold exactly the roster's addresses, the old email gone, the
      new address primary, the tags kept; Fixture Invitee, whose login has no tag, refused
      in its sentence with nothing changed. Locally on the demo data at 390 and 1280, in
      both languages: the same, an email someone on the roster has, what is not an
      address, an address taken away, the last one kept, an admin's panel with nothing to
      change. Not seen, so the box is not ticked: a person who was signed in being signed
      out by a change, and signing in again with the new address (OWNER, with gate 1's
      texted code: nobody on staging can be signed in as from here); a passkey or a Google
      link coming off; an address another login holds, refused. Those have tests against
      a stand-in Clerk only.

- [ ] Items 21d and 21b, seen and not seen. On staging at `ce078f3`, on 2026-11-23,
      signed out at 1440 and 390: Continue with Google above the field, as tall and
      wide as Send me a code, Google's mark and Google Sans loaded from staging itself,
      no console error; the callback page, reached with no Google sign-in behind it,
      sending the browser back to the form with "That Google account is not on a
      roster"; Use a passkey, and the field marked for the browser's saved passkey.
      Signed in as the suite's admin: Settings' Passkeys section with none and Add; no
      band on Today for a session older than ten minutes, as meant. Not seen, so
      neither box is ticked: a sign-in with Google (OWNER: as himself, after People
      gives his row his Gmail, and with an account on no roster, Clerk's logins counted
      before and after), and a passkey added, used and removed (OWNER, in a browser
      with a device lock; the band shows within ten minutes of a sign-in by code).
      Corrected the same push: the Google button sat flush under the heading.
- [x] `scripts/staging.sh passkey` (item 21b's flow by hand, with Playwright's virtual
      authenticator) is not written yet. Written with the Clerk suite; green on staging
      at `d2fb40c`, 2026-11-23.
- [ ] The office's sign-in against real Clerk on the Mac, 2026-11-23, by
      `scripts/staging.sh local`: the development instance's keys on localhost and the demo
      database `trader_demo_clerk`, six tests in `apps/web/e2e/clerk.local.ts`, green. Seen there and
      until now only on staging or not at all: Continue with Google leaving for Google; an
      address filled before the script arrives kept and answered (item 21a); an unknown
      email and a Google account nobody holds each told to ask the office; the form in
      Spanish at 390; Today's passkey band after a fresh sign-in, a passkey added from it,
      listed in Settings, used by Use a passkey after signing out, and removed (item 21b);
      a signed-in worker given an email by the office left with no session at Clerk and
      refused by the next request once their token ran out, within the 90 s the test
      allows (item 21e's "signed out by a change"). Still not seen: a right code, signing in
      again with the new address, and anything on staging since `55c1922`.
- [ ] Item 21d: the dead Continue with Google, read on staging at `55c1922`, was not seen
      again. A fresh browser clicked through to Google on staging and locally, with and
      without the field's passkey offer running, and the owner's own click on staging went
      to Google and came back "not on a roster", making no login at Clerk (counted). So
      `55c1922` (a reset before Google) is not shown to be the fix: the dead click was most
      likely a browser holding an earlier sign-in of Clerk's. Test 1 of the suite guards it.
- [ ] Item 21b: a browser driven by Playwright says so (`navigator.webdriver`), and Clerk
      then offers it no passkey at all (@clerk/shared 4.45.1, isValidBrowser): adding one
      fails as "not supported" and the field's own offer never starts. Every test of a
      sign-in in a driven browser saw a form no person sees. The Clerk suite and the
      passkey run on staging launch Chromium with that flag off.
- [ ] Item 21b: in a browser with no passkey to offer, the field's own unseen request
      failed as the page loaded, and the form said "That passkey did not work" to someone
      who had asked for nothing, over the answer to the code they then asked for. Found
      by the Clerk suite, fixed: the field's offer speaks only of a passkey the person
      picked (`passkey-rules.ts`, fieldOfferSays).
- [ ] The demo binds every person it builds to the development identity, and a binding is
      never undone (the users guard, the owner included), so no Clerk login can become a
      demo person. The Clerk suite inserts its own admin, unbound, for the staging suite's
      admin number; its worker is invited by the test itself.
- [ ] Items 21b and 21d on staging at `d2fb40c`, 2026-11-23, after the deploy's smoke
      test passed: `scripts/staging.sh passkey` green (Today's band after a fresh sign-in,
      a passkey added from it, listed in Settings, Use a passkey after signing out, then
      removed); Continue with Google reaching Google with the field's passkey offer
      running; the band at 390 and the Settings section at 1280, in English. Not seen, so
      21b is not ticked: both in Spanish (`staging.sh look` draws English only). 21d waits
      on the owner's two Google sign-ins.
- [ ] Items 21d and 21b, the owner's own, on staging at `d2fb40c`, 2026-11-23, read back
      at Clerk the same evening: his Gmail, before his login held it, was refused ("not
      on a roster") and Clerk made no login; with it added, Google signed him in to his own
      login, now linked to that Google account, still one login. Item 21d ticked on that.
      Then a passkey added in his Chrome on the Mac and used to sign in, saved to Google
      Password Manager, after Chrome first offered only a phone's QR code. Item 21b waits
      on its band and section in Spanish.

## After MVP

In the order it would come back. The owner reorders at will.

1. Change a worker's sign-in number from the office. In the MVP since 2026-11-23, as part
   of item 21e.
2. Pay periods: close, lock, late adjustments.
3. Materials and receipt photos.
4. Day closeout.
5. Pay rates and job cost.
6. QuickBooks exports, once the partner's edition is known.
7. Approval queue, only if the flags prove too weak.
8. Credit memos.
9. For D Sierra's customers: a Send reminder button on an overdue invoice; a page per
   invoice, with no login, that shows when it was opened; a receipt when an invoice is
   paid, with the company's review link.
10. Public App Store and Play listings, with the account-deletion flow the stores require.
11. A nightly database backup outside Neon, with a restore check.
12. Push notifications.
13. Smart Clock-In, an arrival prompt by geofence, and biometric confirmation.
14. Audit log, a sync diagnostics screen, a job's timeline.
15. Product analytics, once there is more than one crew to learn from.
16. A second contractor: self-serve onboarding, a brand of TRADER's own, each company's logo
    on its invoices and its homepage on its own domain.
17. Payments and a customer portal.
18. D Sierra's fuller site: services, a gallery, an estimate request.
19. Smaller switches: the early clock-in minutes, an Idle preset for jobs, invoices to
    customers in Spanish.
20. For the workflow: scheduled Claude Code runs; a separate GitHub identity or a scoped
    token for a hard production lock; vendor sign-ins for Claude that cannot reach
    production; a browser suite on the demo data in `check`; a Claude Code session of its
    own on the workstation, with the rule for two sessions on one list.

**Still to decide:** what triggers the first bill to D Sierra, now that "V1 complete" no
longer means the old feature list.
