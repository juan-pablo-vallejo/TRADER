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

- Sign in by texted code.
- Today: the shift's job on a card and one Clock in button. On the clock: a running timer,
  break, switch job, and clock out, which asks once. Works offline, sends later; a chip
  always says where the entries stand. The job opens to its address in the phone's maps and
  the office's notes. A reminder from the phone itself at a shift's start and at its end.
  Location is stamped at each tap, unless the company's switch or the person's turns it off.
- Week: my shifts and my hours.
- Me: language, reminders, my name and phone, sign out.
- Crew, admins only and online only: today's crew by person or by job, call, add a shift for
  today, move someone to another job, set a jobsite's location.

**Office, admin only, in English and Spanish**

- Sign in.
- Today: who is on the clock, who is expected and late, sessions left open, money owed.
- Schedule: weekly; one person, one job, one day, start to end. An admin can end a started
  shift early to move someone.
- Hours: a week of people by days. Every entry counts. Flags are badges. A day opens in a
  side panel, where a mistake is fixed with a correcting entry. Payroll hours export as CSV
  for any date range.
- Jobs, and a page per job: its people, hours, invoices, notes and location. Customers
  beside Jobs.
- Invoices, and one invoice: draft → issued → void, numbered in D Sierra's series, with a
  due date and how to pay, PDF, emailed to the customer, payments recorded.
- People: invite with a ready message, make admin, deactivate, location on or off per person.
- Settings: the company's details as they print on an invoice, schedule enforcement,
  location, my profile and language.

**Across the office.** One table, one set of status badges, a side panel for a row's detail,
filters kept in the address, Undo on schedule edits, keyboard row movement, a command menu.
Compact on a laptop, large targets on a phone.

**The look.** D Sierra's brand. Their roller and brush is the icon, their indigo is the color
of every action, and their red belongs to the mark and the homepage only.

**Out until after MVP:** approval queue, pay periods, pay rates and job cost, day closeout,
materials, photos, credit memos, QuickBooks exports, Smart Clock-In by geofence, biometrics,
product analytics, developer console, crews and foremen, public store listings, online
payment, a customer's invoice page, payment reminders and receipts, an estimate request form.

**Finish line.** D Sierra's whole crew runs one full pay period on it: every hour clocked on
a phone, payroll hours exported from TRADER, one real invoice issued and emailed.

**Two releases.** Release 1 is the crew's first day: everything in the phone build, and the
office's sign-in, Schedule, Hours, People, Settings and the public pages. Release 2 lands
during the pay period: Today, Jobs and the job page, invoices, and the three accelerators.
The phone app changes only with a new build; the office changes the moment a release merges.

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
   changes. An invoice to a customer is in English.
8. An entry the office writes is flagged `corrected` and never `location`.
9. An address never decides whose data is shown: the signed-in person's company does. The
   phone app and the release checks use `app.jpteq.app`, so no customer's name is built into
   the phone app.
10. In production the Demo company reaches nobody outside: its invoices are emailed only to
    the deployment's allow-list, blank meaning nobody, and it can invite nobody. Its code is
    shared by design, so whoever holds it must be harmless.

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

1. Clerk's development instance: turn test mode on, or accept sign-in tickets as the only
   way in to staging by hand ("Found along the way"). It blocks every phone check on staging.
2. Item 3: choose how the Demo company signs in without an SMS.
3. Item 12: a Sentry project for the phone app, its DSN, and an upload token in EAS.
4. Item 13: the Expo token in GitHub's `staging` environment, the iOS ad hoc credentials
   with the test iPhone registered, the Android keystore and its fingerprint at Clerk.
5. Items 8 to 11 and 14: read the new Spanish once, on a simulator and on staging.
6. Item 18, from D Sierra: two sentences on what they do and where, in each language; the
   phone number and email their customers should use; three to six photos of their work that
   they own; their OK to publish them. The repository is public.
7. Item 21: approve the privacy policy and the terms.
8. Item 22: one iPhone and one Android phone.
9. Item 23: production, by `README.md`, which now carries D Sierra's address: its DNS
   record in Cloudflare, its domain on the Vercel project, and its name in Clerk's allowed
   subdomains. Then D Sierra's details in Settings, and the TestFlight and Play links for
   Get the app.
10. Items 25 and 34: the two releases.
11. Item 30: confirm the invoice email arrived.

Any time: one rate-limit rule on `/api` in Vercel's firewall (the staging project now,
production when it exists); the roster's phone numbers, and a Google account email for each
Android user.

### Release 1: the crew's first day

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
- [ ] 13. **Preview builds.** `eas.json` with development, preview and production
      profiles; the build number from EAS; a workflow that builds a preview for a commit,
      told staging's API, Clerk's publishable key and the Sentry DSN. OWNER first: the Expo
      token in GitHub's `staging` environment, the iOS ad hoc credentials with the test
      iPhone registered, the Android keystore and its fingerprint at Clerk. Done when one
      commit has an Android build and an iOS build that sign in to staging.
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

- [ ] 16. **Hours: the day panel and corrections.** `SidePanel`: the schedule's drawer
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

- [ ] 17. **Schedule: the week beside the form, and moving someone.** The week grid moves
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

- [ ] 18. **D Sierra's homepage and Get the app.**
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

- [ ] 19. **People, and the invitation message.** People on `DataTable`. A row opens the
      person in the side panel: role (making an admin asks first), location (as the company,
      on, or off: `roster.setLocation`), their numbers as links that dial, a link to their
      week in Hours, and Deactivate last. After an invitation, and again from the panel
      while the person has not signed in, Send the invitation opens a ready text message to
      their number on the admin's own phone, in English and Spanish, with the link to
      `/get`. On a desktop the same text is offered to copy. Done when a fixture person is
      invited on staging and the message opens on a phone.
- [ ] 20. **Settings.** `/settings`, behind the person's name; `/profile` redirects to it.
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
- [ ] 22. **Physical phones.** OWNER, with one iPhone and one Android phone: sign in by
      texted code, see the week, clock in, switch job and clock out across an airplane-mode
      gap; a schedule changed while the phone was offline shows as stale; a reminder arrives
      at a shift's start with the app closed; an admin moves the worker mid-day from the
      Crew tab and the worker's phone offers the second job; Call dials. Done when the
      office shows those hours once, per job, with their flags.
- [ ] 23. **Production exists.** OWNER, by `README.md`, "Make production exist", which now
      carries D Sierra's address: the DNS record, the Vercel domain, Clerk's allowed
      subdomains, both origins in `CLERK_AUTHORIZED_PARTIES`, and `TRADER_HOME_HOST`. Then,
      in Settings as D Sierra's admin: the company's details, how to pay, the terms and the
      two switches. And the two links for Get the app in the production project's variables.
- [ ] 24. **The release job builds the phone app.** On a push to `production`: build with
      the production profile and send it to TestFlight and to Play's internal track, with
      the Expo token and the store credentials read from the `production` environment
      only. Done when the workflow is on `main`, to be read in the first release's pull
      request.
- [ ] 25. **Release 1.** OWNER merges `main` into `production`. D Sierra and Demo are
      onboarded, the invitations go out from People, Play's tester list holds each Android
      user's Google account, and week one's schedule is entered before the crew starts.

### Release 2: during the pay period

- [ ] 26. **Today.** `/today`, where the office opens. Three bands in a fixed order, rows
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

- [ ] 27. **Jobs and Customers.** Both on `DataTable`, as two tabs of one place.
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

- [ ] 28. **The job page.** `/jobs/[id]`, one page that says where a job stands. `job.read`,
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

- [ ] 29. **Invoices: due date, status and payments.**
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

- [ ] 30. **The customer-ready invoice.** The only thing a customer of D Sierra sees.
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

- [ ] 31. **Undo on schedule edits.** Moving, changing or removing a shift nobody has
      clocked in on shows at once and offers Undo in a toast for a few seconds. The server
      still decides: a refusal puts the grid back as it was and says why, from the answer's
      own code. A started shift, Copy last week (which has its own undo) and everything
      outside Schedule keep waiting for the server. Nothing append-only is ever shown before
      it is written. Done when a test for each change (move, edit, remove) shows the cache
      restored after a refused answer, and Undo and a rollback have each been seen on
      staging.
- [ ] 32. **Keyboard row movement.** In every `DataTable` and in the schedule's grid: the
      arrow keys, or J and K, move a visible focus through the rows, and through the cells
      of the two grids; Enter or Space opens the row's panel or page; Escape closes it and
      returns the focus. A key never acts while a field has the focus. `?` lists the keys.
      Every action stays reachable by pointer and by Tab. Done when Hours has been worked by
      keyboard alone on staging, from opening the screen to downloading the CSV.
- [ ] 33. **The command menu.** Ctrl or Cmd + K, and a button in the header. Type to jump
      to a person, a job, a customer or an invoice, from the lists the office already holds
      (no new search on the server), or to run New shift, New invoice, Invite a person or
      Export hours. A `combobox` over a `listbox`, in both languages, closed by Escape. Look
      up whether a small library earns its place against a native `<dialog>` before adding
      one. Done when each jump and each action has been reached by keyboard on staging and
      the menu has been seen at 390.
- [ ] 34. **Release 2.** OWNER merges `main` into `production`.
- [ ] 35. **The finish line.** One full pay period on real phones, payroll hours exported
      from TRADER, one real invoice issued and emailed.

### Found along the way

- [ ] OWNER: `STAGING_MIGRATOR_URL` in `.env.staging` ends in a cut-off query parameter
      (`&ch`); the value in GitHub's `staging` environment is whole. Fix the file's copy.
- [ ] OWNER: the `staging` environment variable `E2E_COMPANY_ID` is no longer read; delete it.
- [ ] Clerk's fixed test code (424242) is refused on staging's sign-in form, so a person
      cannot sign in to staging's office by hand with a fixture number; the smoke test uses
      single-use tickets. OWNER: turn the development instance's test mode on, or accept
      tickets as the only way in.
- [x] The phone has still never signed in to staging. A development build pointed at
      staging reaches Clerk and gets to the code step for a fixture number, and the fixed
      test code is refused there too, so the phone was seen against the local server only.
      Blocked on the Clerk item above, then items 2 and 3.
- [ ] OWNER: `pnpm --filter @trader/db onboard` and `pnpm db:migrate` fall back to the local
      database when `DATABASE_URL` is given empty, as an unset `$OWNER_URL` makes it. Decide
      whether `run-onboard.ts` should refuse a blank `DATABASE_URL`.
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
- [ ] `labor.repair`'s answer still calls an entry's flags `reasons`
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

## After MVP

In the order it would come back. The owner reorders at will.

1. Change a worker's sign-in number from the office.
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
    production; a browser suite on the demo data in `check`.

**Still to decide:** what triggers the first bill to D Sierra, now that "V1 complete" no
longer means the old feature list.
