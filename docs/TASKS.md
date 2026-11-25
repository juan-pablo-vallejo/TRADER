# TRADER: tasks

The MVP, the open work that reaches it in order, and what comes after.

## The MVP

**One sentence.** A painter sees their week and clocks in and out on their phone, with or
without signal; the office schedules the crew, exports payroll hours and invoices the customer
from the same record.

**Twenty screens.** Four public, five on the phone, eleven in the office.

**Public**

- Home, at `dsierrapainting.jpteq.app`: D'Sierra Painting's homepage. One page: their logo,
  what they do and where, call, WhatsApp and email, their own photos, Team sign-in, Get the
  app.
- Get the app: where the invitation message points.
- Privacy. Terms.

**Addresses.** Everything of D'Sierra's is at `dsierrapainting.jpteq.app`: the homepage at
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
- Me: language, reminders, Face ID or fingerprint sign-in, my name and phone, the build's
  number, sign out.
- Crew, admins only and online only: today's crew by person or by job, WhatsApp, add a shift
  for today, move someone to another job, set a jobsite's location. An admin with no shift
  today opens the app here.

**Office, in English and Spanish.** Its screens are for admins; a worker who signs in there
sees only Me.

- Sign in: one field for a mobile number or an email, and a texted or emailed code; or
  Google; then by passkey on a device where the admin added one.
- Today: who is on the clock, who is expected and late, sessions left open, money owed.
- Schedule: weekly; one person, one job, one day, start to end; one shift on several days at
  once; Copy last week. An admin can end a started shift early to move someone. Removing a
  shift asks nothing: Undo brings it back.
- Hours: a week of people by days. Every entry counts. Flags are badges. A day opens in a
  side panel, where a mistake is fixed with a correcting entry. Payroll hours export as CSV
  for any date range.
- Jobs, and a page per job: its people, hours, invoices, notes and location. Customers
  beside Jobs.
- Invoices, and one invoice: draft → issued → void, numbered in D'Sierra's series, with a
  due date and how to pay, PDF, emailed to the customer, payments recorded.
- People: invite by mobile number, by email or both; send the invitation by WhatsApp or by
  email and see where it stands (not sent, sent, verified); change a worker's email and
  sign-in number, which signs them out and is kept on record; make admin, deactivate,
  reactivate, location on or off per person.
- Settings: the company's details as they print on an invoice, schedule enforcement,
  location, Me, language and passkeys.

**Across the office.** One table, one set of status badges, a side panel for a row's detail,
filters kept in the address, Undo on schedule edits, keyboard row movement, a command menu.
Compact on a laptop, large targets on a phone.

**The look.** D'Sierra's brand. Their roller and brush is the icon, and their indigo is the
color of every action inside the office and the app. Their red belongs to the mark, the
homepage and the two sign-in screens, which take the homepage's navy, its red for their one
main button and Bodoni Moda for their heading. Red never sits on navy.

**Finish line.** D'Sierra's whole crew runs one full pay period on it: every hour clocked on
a phone, payroll hours exported from TRADER, one real invoice issued and emailed.

**One release.** Everything on the list goes out together. What ships after it is a release
of its own, when there is something to ship. The phone app changes only with a new build; the
office changes the moment a release merges.

**How it reaches phones** (Apple's and Google's pages, read 2026-11-18)

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
3. No shift, no clock-in, while the company keeps that switch on: the worker messages the
   office on WhatsApp, and an admin adds a shift or moves them from the Crew tab. An offline
   clock-in the schedule no longer allows is kept, flagged, and counts unless the office
   corrects it.
4. A started shift can be ended early by an admin. Nothing else about it changes, and no
   entry is touched.
5. The dashboard is TRADER's own data. Sentry reports errors from the office, the API and
   the phone; nothing measures usage.
6. The product wears D'Sierra's brand, and everything of theirs is at
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

Claude's items first, in the order they are built; then what waits on the owner, on D'Sierra
and on vendors, in the order it blocks. "Both languages, reviewed" means the
`interface-change` skill: the screens seen at 390, 768 and 1280 in English and Spanish, then
reviewed. "backend-change" means that skill. "Both suites whole" means the Maestro suite on
the iPhone simulator and `trader-ws android`.

### Claude's

**One home for dates, times and limits** (backend-change)

- Numbers and pure rules both apps need live in the contract package, so the phone runs the
  server's own clock rule. Each helper is held by property tests before its copies become
  imports; no import cycle is left. `wire.json` and the recorded build do not change.
- One formatter each, both apps: a time of day reads 12-hour ("2:30 PM", "2:30 p. m."); time
  worked reads "7 h 30 min" on a clock and "7.50 h" where it is paid from; a day reads "Mon,
  Nov 16" when worked or paid, "Nov 16, 2026" when due, issued or a range, "Mon 16" in a
  grid's column. Names sort with accents beside their letter, in every list and in SQL. Tests
  import a product number or state a relation; the palette's values stay in the theme test.
- Done when: a test that failed first refuses a pause on a pause on the phone; a structure
  test finds no cycle.
- See it working: staging, simulator, emulator, both languages, reviewed on Fable; both
  suites whole.

**Guard sitting 2**

- `guard.mjs`: the root `package.json` matched whatever its path's capitals; `pnpm pkg set`
  and `npm pkg set` refused; a relative path read from after a `cd`; each package's `test`
  and `typecheck` scripts, `.gitleaksignore` and `.prettierignore` guarded; `tsc -p` and
  `vitest run --config` ask nothing.
- `scripts/trader-ws.d/audit` leaves itself out of its own scan, and stops naming
  `DATABASE_DRIVER` (lines 4 and 31): the variable is gone from the code.
- `scripts/staging.sh reset` empties staging with its own keys, migrates it, onboards its
  company with `--demo` and the suite's two people, and prints the company's id.
- The new names of the variables in the workflows and `scripts/staging.sh`; the new paths in
  the simplifier's and the reviewer's prompts; the comment rule in hooks, scripts and
  workflows.
- The two items below are built in the working tree first, so the prompts' new paths exist
  when they are approved.
- Done when: the owner has approved each diff; the guard's tests pass.
- See it working: the diffs at one sitting; a test per gap that failed first.

**Names: shift, people, correct** (backend-change)

- `assignment` becomes `shift`; `roster` becomes `people`; `labor.repair` becomes
  `labor.correct` and `repair_stale` `correction_stale`; `invoice.save` becomes
  `invoice.update`; `roster.setLocation` becomes `people.setLocationStamps`;
  `worker_inactive` becomes `user_inactive`; the code `authorization` becomes `started`, and
  the phone's sentence keys take the server's own codes; an address change's `repaired`
  becomes `matched`. Six files take the name of what they hold, the phone's Me tab among
  them (`me`).
- `wire.json`, the diff shown to the owner: those names and no other. `PHONE_PROCEDURES`:
  `shift.create`, `shift.moveToday`, `people.list`. Budgets re-keyed, not loosened.
- Done when: no old name outside the mapping table in `docs/ARCHITECTURE.md`.
- See it working: staging's smoke test; both suites whole.

**Variables say what they are** (backend-change)

- `TRADER_GET_IOS_URL`, `TRADER_GET_ANDROID_URL`, `MAIL_ALLOWLIST`; in each GitHub
  environment `MIGRATOR_URL`, `DEPLOY_HOOK`, `APP_URL`; `CLERK_SECRET_KEY` everywhere,
  `.env.staging` too. The deploy job no longer branches on its target. `.env.example` lists
  every stored name, grouped by where it is set, the mail sender's shape among them. The
  document test gains: every name read is listed, every listed name is read.
- Done when: that check failed first; no old name remains.
- See it working: staging's deploy and smoke test green; then the owner deletes the old
  names.

**One baseline** (backend-change)

- The nine migrations become one, no backfill, each function written once, with the tables
  `shifts` and `entries` and the invitation's channel `whatsapp`. Every database that holds
  rows is emptied and rebuilt: a developer's, CI's, the workstation's, staging's by
  `scripts/staging.sh reset`.
- `wire.json`: the channel's value; the diff shown to the owner.
- Done when: the schema dump after equals the dump before, but for the two table names and
  the channel's check.
- See it working: staging reads 1 applied of 1; deploy and smoke test green; the owner back
  on staging.

**One vocabulary on screen**

- About 200 strings follow the approved words: shift, entry, People and Personal, job and
  jobsite, owed, Outstanding and Balance, "Iniciar sesión", "Trabajando", "recordatorio" on
  the phone, "Activado / Desactivado", "Yo", no noun for a work session in the office, the
  badge "corrected", tú everywhere, full forms and "That did not go through." followed by
  what to do.
- Done when: a catalog test fails on a retired word.
- See it working: staging, simulator, emulator, both languages, reviewed; both suites whole.

**Phone: hours that count the running clock** (backend-change)

- "Worked today" and Week add closed intervals only, so they read about 0 h beside a running
  timer. Both compute from the marks the timer uses; the server's hours are already right.
  The two file headers that say the phone never recomputes hours change with it.
- Done when: failing-first tests: an open session after a pull; an offline start, break and
  end.
- See it working: simulator, emulator, both languages, reviewed on Fable; both suites whole.

**Phone: Me, selected states, headings, announcements**

- Me opened once with no signal never loads the contact phone: fetch again on focus and on
  return to the app, say why, offer Try again.
- The language, reminders and Face ID pairs carry a selected state, as Crew's view switch
  does.
- The seven tab titles and headings carry the header role.
- One announce helper, called wherever a verdict is set (a wrong code, a failed save, the
  chip turning to Needs attention), on both platforms; the live regions stay.
- Grouped rows and the five icon buttons have spoken names; the timer is spoken as hours and
  minutes.
- Done when: tests show Me fetching again on focus, a selected state per pair and one
  announce helper.
- See it working: simulator, emulator, both languages, reviewed; both suites whole; heard on
  the walk.

**Phone: the sync chip, refusals felt and heard** (backend-change)

- One refused entry keeps the chip on Needs attention for good. It clears once a correcting
  entry for the same day is accepted; the refusal stays listed in the sheet.
- When the refused count rises: an error haptic and an announcement.
- A tap whose write to the phone's store throws says "Not saved. Try again.", with an error
  haptic, and is reported.
- Done when: a failure test first for each.
- See it working: simulator, emulator, both languages, reviewed; both suites whole.

**Phone: Crew keeps its ids and shows the chip** (backend-change)

- Add and move mint the id when the sheet opens and keep it with the time, so trying again
  after a lost answer reads as done.
- Crew draws the sync chip, as every other tab does. A stepped shift time is spoken.
- Done when: a test that failed first reads a retry after a lost answer as done.
- See it working: simulator, emulator, both languages, reviewed; both suites whole.

**Phone: large text, the Spanish voice, the real reason on Today**

- If the rendered audit saw it: the timer's scale capped at the largest text.
- The location prompt has its Spanish purpose string, worded as the English one.
- With Spanish chosen, the accessibility language is Spanish.
- Today with nothing loaded says the real reason (an update needed, the company paused, the
  session refused) and draws the chip; "connect and try again" only when the server was not
  reached.
- A wrong code keeps the keyboard. Google's mark on its button only if Google's rule for a
  native app requires it; the rule's source and day are recorded.
- Done when: tests for the reason shown and the language set.
- See it working: simulator, emulator at the largest text, both languages, reviewed; both
  suites whole.

**Phone: borders in navy, labels at 15 pt**

- A field's border takes the brand navy (#140064) in `theme.css` and `theme.ts` together; the
  colour comment allows navy on a field's edge; the contrast test gains the pair.
- `type.label` and the tab labels are 15 pt.
- Done when: the contrast test fails on the old pair.
- See it working: staging, simulator, emulator at the largest text, both languages,
  reviewed; both suites whole.

**WhatsApp in place of Call** (backend-change)

- The five Call buttons (the phone's office button, Crew's person sheet, the office's late
  rows on Today, People, a job's page) become a "WhatsApp" button that opens
  `https://wa.me/<digits>`. "Send by text" becomes "Send by WhatsApp" with the same ready
  message. The office's number is the company's phone in Settings, whose caption says the
  crew messages it on WhatsApp and asks for the country code. The homepage's link waits on
  D'Sierra's number.
- A number is sent in full international form: one typed with no country code is read as a
  United States number.
- Done when: `git grep -nE 'tel:|sms:' -- apps` shows the homepage alone; a test turns each
  stored form into its address.
- See it working: staging, simulator, emulator, both languages, reviewed; both suites whole.

**Face ID stops after an address change** (backend-change)

- After an admin changes a worker's sign-in address, the server answers that worker's next
  sign-in by a Face ID or fingerprint key as it answers a deactivated person's, and the phone
  drops the key as it does then.
- The phone says how it signed in, since Clerk's token does not. If the server cannot be
  told that honestly, the choice goes back to the owner before anything is built. Any
  `wire.json` name that changes is shown to him.
- Done when: failure tests first, server and phone.
- See it working: a Maestro flow on simulator and emulator; both suites whole; a real key on
  the walk.

**The phone's store and identifiers start clean** (backend-change)

- The stored snapshot restarts at shape 1 with no upgrade step; a snapshot with no shape is
  thrown away and pulled again; the outbox's column rename on open goes. The URL scheme is
  `app.jpteq.trader`; the version 1.0.0.
- Done when: a test throws a shapeless snapshot away and pulls again.
- See it working: both suites whole; Google's sheet on the walk, once the owner has added the
  redirect.

**The invoice reads like the screen** (backend-change)

- The PDF and the email read "$1,250.50" and "Nov 16, 2026"; the payroll CSV keeps
  year-month-day and plain decimals.
- Done when: its tests are recorded again.
- See it working: one sample PDF shown to the owner before it lands.

**Comments say what is**

- About 200 comment lines say what is, in the present tense: no id, no credit, no day but a
  vendor fact's, each read against its code. "D'Sierra" in prose; test fixtures take an
  invented contractor's name.
- One comment-only batch per area. The document test gains its date and id checks.
- Done when: the proving searches show only what they allow.
- See it working: each comment-only commit carries the proof that no code token changed.

**The generated reference**

- `pnpm --filter @trader/api reference` writes a page per router from `wire.json` to
  `~/Library/Caches/TRADER/reference`, the phone's procedures marked.
- Done when: a test proves it generates; nothing is committed.
- See it working: the pages opened once.

**The recorded build, recorded again**

- After the last change to what the phone sends: one new folder, the old one deleted.
- Done when: one folder; the replay has no `BAD_REQUEST`, 500 or `invalid_record`.
- See it working: the difference shown to the owner; both suites whole.

**Ready for the walk**

- The proving searches show only what they allow; every pointer in the documents resolves.
- An agent given only the repository reads it cold; each finding is fixed or listed.
- `scripts/trader-ws check`, the browser suite, both phone suites and staging's smoke test
  green on one commit.
- No statement budget grown; every `wire.json` difference since `archive/pre-consolidation`
  named and shown; the recorded build replays clean.
- `scripts/staging.sh sample` taken again and set beside the earlier one.
- Final captures of every screen in both languages, for the owner's reading of the Spanish.
- Claude then tells the owner the commit, the `wire.json` differences, the two samples,
  where the captures are, and his next steps.
- Done when: every line holds on one commit.
- See it working: the results in the finishing commit's message.

**Phone: the Face ID offer at the largest text**

- On an iPhone at the largest text size the Face ID offer after a first sign-in by code does
  not scroll, so neither "Turn on Face ID" nor "Not now" can be reached and the person cannot
  get into the app. The offer scrolls, as every tab does.
- At that size the sign-in heading breaks word by word ("Team / sign- / in") and pushes the
  field down: it wraps by words.
- Done when: a Maestro flow at the largest text reaches "Not now" on the iPhone simulator.
- See it working: simulator and emulator at the largest text, both languages, reviewed; both
  suites whole.

**Invitations: copied or opened is not sent** (backend-change)

- Copy the message, and Send by WhatsApp once it replaces texting, record "Copied" or
  "Opened in WhatsApp" with who and when; the invitation stays Not sent until the admin
  presses "I sent it". Email keeps its provider's answer.
- Done when: a test that failed first leaves a copied invitation Not sent.
- See it working: staging, both languages, reviewed.

**Office: what the rendered audit added**

- A required field left empty is refused by the browser's own bubble, in the browser's
  language ("Please fill out this field." under a Spanish office): the office's own sentence
  under the field, in the chosen language, on every form.
- Focus is lost to the page after closing a panel opened by its address (a job's edit
  panel reached from its page): it returns to the record's own row.
- At phone width Correct in a day's panel opens its form below the screen: the form comes
  into view with focus on its first field.
- Settings' Me section jumps more than a screen when Company and Time clock arrive above
  it: placeholder rows that hold the room.
- In Jobs, Edit is named with words it does not show; on a job's page the phone number
  reads as People writes it. The Search button's name begins with its visible word.
- Stacked rows at phone width: a name's target spans its line, not only its words; a row's
  Edit is 48 px tall on a line of its own; a middle dot stays with the cell it introduces;
  People and Customers set their names as Jobs does.
- At 390 the header keeps at least the person's first name beside the company's.
- A draft with no lines says at its foot why it cannot be issued yet, not "from below".
- In Spanish at 768 a draft line's "Precio por unidad" sits level with the fields beside
  it.
- Spanish says "a la 1:45", not "a las", for one o'clock.
- Hours' day lines are 32 px at 768 too: `--target` there as well.
- A date typed into Hours' range before the page has loaded is put back to the range shown
  when the page takes over: the fields keep what was typed, as sign-in's field does.
- Deleting a draft invoice reads the deleted invoice once more and logs a 403: its reads stop
  once the deletion is sent.
- The schedule offers "Add a shift" for a deactivated person, whom the form then leaves
  out.
- Done when: a test for each.
- See it working: staging, both languages, reviewed.

**Phone: the Android suite's wrong-code step**

- On the workstation's emulator, `sign-in-codes` types 111111 and the field is then empty
  with no refusal shown, three runs in a row; the step runs on the phone alone (the
  development stand-in compares the code) and passes on the iPhone simulator. Find whether
  the keyboard, the emulator or the screen drops the sentence, and fix that.
- To tell the app from the workstation's emulator, run the suite on this Mac's emulator
  (`apps/mobile/.maestro/suite.sh android emulator-5554`), after all other work: its
  development build is older than the app's native modules (it stops at launch on
  `ExpoWebBrowser`), so `pnpm android` builds and installs a current one first.
- Done when: `trader-ws android` is whole and green.

### The owner's

`<angle brackets>` mark a value only the owner holds.

**Staging, vendor and repository leftovers**

- When: any time. Part a before guard sitting 2; the rest before the walk.

| Part                                     | Done already when                                                                                                                                                | If not                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| a. The migrator string in `.env.staging` | The check below prints `0`                                                                                                                                       | The repair below, then the check again                                                   |
| b. `E2E_COMPANY_ID`                      | `gh variable list --env staging` does not list it                                                                                                                | `gh variable delete E2E_COMPANY_ID --env staging`                                        |
| c. Clerk's delete switch                 | Clerk, Trader, Development, Configure, User & authentication, User model, User permissions: "Allow users to delete their account" is off and offers nothing more | Press "Apply to existing users" on that row. It removes nobody                           |
| d. The Vercel project `trader`           | Vercel lists `trader-staging` alone                                                                                                                              | Project `trader` (every deployment reads Canceled): Settings, General, Delete Project    |
| e. Two stale variables at Vercel         | `trader-staging`, Settings, Environment Variables: one row `CLERK_AUTHORIZED_PARTIES`                                                                            | Remove the two rows scoped to Preview, branches `release-0.1` and `staging-preview`      |
| f. Two stray Neon branches               | Neon, `Trader-staging`, Branches: `staging` alone                                                                                                                | Delete `restore-drill-20261114` and `release-0.1-migration-rehearsal`                    |
| g. Old git branches                      | `git branch -a` lists `main`, the two unmerged branches and `origin/main`                                                                                        | The commands below                                                                       |
| h. Optional, blocks nothing              |                                                                                                                                                                  | GitHub, Settings, Code security: push protection, CodeQL, Dependabot alerts, as you wish |

Part a. The check prints `1` while the string is cut off:

```sh
cd ~/Documents/TRADER && grep -cE '^STAGING_MIGRATOR_URL=.*&ch.?$' .env.staging
```

The repair: copy staging's direct connection string in Neon (`Trader-staging`, the owner's
role, pooling off), run the first line, paste at the silent prompt, press Return, run the
rest:

```sh
read -rs URL
URL="$URL" perl -i -pe 's/^STAGING_MIGRATOR_URL=.*/STAGING_MIGRATOR_URL=\x27$ENV{URL}\x27/' .env.staging
unset URL; pbcopy </dev/null
```

Part g. The two unmerged branches stay, and so do the archive tags:

```sh
cd ~/Documents/TRADER && git fetch --prune origin
git log --oneline main..o9-step-red
git log --oneline main..stage-3-material-corrections
git branch --merged main | grep -v '^\*' | wc -l
git branch --merged main | grep -v '^\*' | xargs git branch -d
git push origin --delete release-0.1
git branch -a
```

- See: one commit, then five; `46`; 46 lines "Deleted branch"; `[deleted] release-0.1`.
- Tell Claude: "The leftovers are done."

**One sentence in LICENSE**

- When: any time before production.
- Tell Claude: "LICENSE: add this sentence exactly as I wrote it: `<your sentence: third-party
material (the fonts under their own licences, Google's mark, D'Sierra's photos and marks)
belongs to its owners>`."
- See: Claude's commit changes `LICENSE` alone.

**The message to D'Sierra**

- When: any time. Their OK blocks production; the files and the number block nothing.
- Do: `open ~/Documents/TRADER/assets/pics`, attach the 18 photos and a screenshot of the
  homepage on staging, and send, in your own words or these:

> Hi `<name>`. Your page on TRADER is ready. I need three things from you.
>
> 1. Your OK. The 18 photos attached come from your Instagram and Facebook pages. Tell me if
>    any should not be used. One shows a house number, 65, beside the door, with no street:
>    may it stay? The page says "Serving Rhode Island and upper New England": is that right?
> 2. Better files, when you can: the camera originals of these photos, and your logo with no
>    white background.
> 3. The WhatsApp number your customers should write to. It goes beside Call and Email on
>    your page.

- Tell Claude: "D'Sierra answered. Photos: `<OK, or which to remove>`. House number 65:
  `<stays or goes>`. Area line: `<OK, or their words>`. WhatsApp number: `<number>`. New
  files: `<folder>`."

**Guard sitting 2, with staging's variables**

- When: once, when Claude asks, before "Names: shift, people, correct". Three moments.
- A, at the sitting. Claude shows each diff; answer each prompt yes where it equals the diff
  shown. Then add the new names beside the old:

| Place                                           | Old name                   | New name           | At A                                                                                                                        |
| ----------------------------------------------- | -------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Vercel, `trader-staging`, Environment Variables | `INVOICE_EMAIL_ALLOWLIST`  | `MAIL_ALLOWLIST`   | Add it with the same value and environments                                                                                 |
| GitHub, environment `staging`                   | `STAGING_MIGRATOR_URL`     | `MIGRATOR_URL`     | `gh secret set MIGRATOR_URL --env staging`, paste Neon's direct string                                                      |
| GitHub, environment `staging`                   | `STAGING_DEPLOY_HOOK`      | `DEPLOY_HOOK`      | `gh secret set DEPLOY_HOOK --env staging`, paste the hook's address (Vercel, `trader-staging`, Settings, Git, Deploy Hooks) |
| GitHub, environment `staging`                   | `STAGING_URL`              | `APP_URL`          | `gh secret set APP_URL --env staging --body "$(scripts/staging.sh url)"`                                                    |
| GitHub, environment `staging`                   | `CLERK_STAGING_SECRET_KEY` | `CLERK_SECRET_KEY` | `gh secret set CLERK_SECRET_KEY --env staging`, paste the development instance's secret key                                 |

- B, when Claude says `scripts/staging.sh` reads the new names:

```sh
cd ~/Documents/TRADER && perl -i -pe 's/^STAGING_MIGRATOR_URL=/MIGRATOR_URL=/; s/^STAGING_URL=/APP_URL=/; s/^CLERK_STAGING_SECRET_KEY=/CLERK_SECRET_KEY=/' .env.staging
scripts/staging.sh names
```

- C, when Claude says staging serves the batch and the smoke test is green: remove
  `INVOICE_EMAIL_ALLOWLIST` at Vercel, then:

```sh
for n in STAGING_MIGRATOR_URL STAGING_DEPLOY_HOOK STAGING_URL CLERK_STAGING_SECRET_KEY; do gh secret delete "$n" --env staging; done
gh secret list --env staging
```

- See: at A, `git status --short` lists only the files Claude showed. At B every line ends
  `: set`. At C the list holds the four new names and `EXPO_TOKEN`, and no old name.
- Tell Claude: "A is done." Then "B is done." Then "C is done."

**After staging's reset**

- When: when Claude says "One baseline" has reset staging and names the new company's id.
- Do: put yourself back on staging, then point the Demo sign-in at the new company:

```sh
cd ~/Documents/TRADER && scripts/staging.sh invite <your mobile number, +1XXXXXXXXXX> '<your name>'
```

Vercel, `trader-staging`, Environment Variables: set `DEMO_COMPANY_ID` to that id.
Deployments, the latest, Redeploy.

- See: the first command answers "invited". `scripts/staging.sh ready` answers
  `"demo":true`.
- Tell Claude: "I am on staging again and DEMO_COMPANY_ID is set."

**Clerk's development redirect**

- When: any time before the builds. The walk's Google and Apple sign-ins wait on it.
- Do: Clerk, Trader, Development, Configure, Native applications, the allowlist of mobile SSO
  redirects: add `app.jpteq.trader://sso-callback`. Then developer.apple.com, Certificates,
  Identifiers & Profiles, Identifiers, `app.jpteq.trader`: Sign In with Apple is ticked; if
  not, tick it and Save.
- See: the list holds the new entry. After the walk passes, remove `trader://sso-callback`:
  nothing uses it then.
- Tell Claude: "Clerk's development redirects hold app.jpteq.trader://sso-callback. Sign in
  with Apple is on for the App ID."

**Reading the Spanish in the final captures**

- When: when "Ready for the walk" is finished and Claude names the folder of captures. The
  builds wait on it.
- Do: read every Spanish capture once, office and phone. Expect tú everywhere, "Iniciar
  sesión", "Trabajando", "recordatorio" on the phone and "avisos" in the office, "Activado /
  Desactivado" and "Activa / Desactivada", "Yo", "2:30 p. m.", "corregido".
- Tell Claude: "Spanish read. Nothing to fix." Or: "Spanish read. Fix these: `<capture, the
words, the words wanted>`." Claude lands the fixes, runs the check and both phone suites
  again on that tree, then asks for the builds.

**The preview builds and the walk**

- When: when Claude asks for the builds. Production waits on it.
- Builds: delete TRADER from both phones first, then:

```sh
cd ~/Documents/TRADER && gh workflow run "Preview builds" --ref main
```

- See: expo.dev, account `jpteq`, project `trader`, Builds: two builds of `main`'s commit,
  version 1.0.0. iPhone: open the iOS build's page on the phone, Install (if it will not
  open: Settings, Privacy & Security, Developer Mode). Android: open the Android build's
  page, download, allow the install.
- The walk. A is the iPhone, B the Android phone, L the laptop on staging's office
  (`scripts/staging.sh url` prints the address). You are an admin on your own number. Quoted
  words are the catalog's; Claude's request for the builds lists any a later change reworded.

| #   | Do                                                                                                                                                                                                        | Expect                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | L: sign in with your number and the texted code                                                                                                                                                           | Today opens                                                                                                                                                                                                                                                                   |
| 2   | L, within ten minutes: Today's band offers a passkey. Add one with the Mac's Touch ID. Sign out, sign in with the passkey. Settings, Passkeys: remove it                                                  | Added. In with no code. Removed                                                                                                                                                                                                                                               |
| 3   | L, Settings: schedule enforcement on, the company's phone set to A's number. Jobs: two, the second with no location                                                                                       | Saved                                                                                                                                                                                                                                                                         |
| 4   | L, People: invite "Walk Worker" with `<an inbox of yours on staging's MAIL_ALLOWLIST>`, no number. Send by email                                                                                          | "Not sent", then "Sent · not verified". The invitation arrives                                                                                                                                                                                                                |
| 5   | L, Schedule: you on job 1 from ten minutes from now; Walk Worker on job 1 all day                                                                                                                         | Both show                                                                                                                                                                                                                                                                     |
| 6   | A: allow notifications, sign in by texted code, turn on Face ID when offered, close the app                                                                                                               | Week shows your shift, in 12-hour time                                                                                                                                                                                                                                        |
| 7   | A: at the shift's start, tap the reminder                                                                                                                                                                 | It arrives with the app closed. Today opens                                                                                                                                                                                                                                   |
| 8   | A: sign out, sign in by Face ID. Sign out, cancel Face ID once                                                                                                                                            | In by Face ID. After the cancel, the code signs in                                                                                                                                                                                                                            |
| 9   | A: clock in, airplane mode on, clock out, airplane mode off                                                                                                                                               | "Worked today" counts the running clock. The chip reads "Saved on phone", then "Sent"                                                                                                                                                                                         |
| 10  | A: airplane mode on. L: move your shift's end. A: open Week, then airplane mode off                                                                                                                       | "This may be out of date. Connect to check it." Online, the new time                                                                                                                                                                                                          |
| 11  | B: sign in with Walk Worker's address and the emailed code, turn on fingerprint. L, a private window: the same sign-in                                                                                    | People reads Verified. The office shows Walk Worker only Me                                                                                                                                                                                                                   |
| 12  | B: clock in on job 1. A, Crew: move Walk Worker to job 2. B: Switch job                                                                                                                                   | "Moved." B offers job 2                                                                                                                                                                                                                                                       |
| 13  | A, Crew, job 2: "Set the jobsite's location here"                                                                                                                                                         | "Location set."                                                                                                                                                                                                                                                               |
| 14  | L, Hours, Walk Worker, today: void the open time                                                                                                                                                          | Today reads them off the clock. Their shift can be edited again. B's clock ends with no "Needs attention"                                                                                                                                                                     |
| 15  | L, People, Walk Worker: change the email to `<a Google account of yours on MAIL_ALLOWLIST>` and add B's number                                                                                            | It asks first, naming them. B is signed out. The panel lists both changes                                                                                                                                                                                                     |
| 16  | B: sign in by fingerprint                                                                                                                                                                                 | Refused: the code screen shows, and Me reads fingerprint off. The new address's code signs in                                                                                                                                                                                 |
| 17  | B: sign out. Sign in as yourself by texted code and turn on fingerprint. Sign out, sign in by fingerprint. Then sign out, sign in as Walk Worker by code and turn fingerprint on                          | You are signed in, not Walk Worker: the second key replaced the first. If it refuses instead, tell Claude                                                                                                                                                                     |
| 18  | A, the office in Safari: People, Walk Worker, Send by WhatsApp                                                                                                                                            | WhatsApp opens B's chat with the invitation ready                                                                                                                                                                                                                             |
| 19  | A, Crew, Walk Worker's sheet: WhatsApp. L: remove Walk Worker's shifts. B, Today: the office's WhatsApp button                                                                                            | Each opens that number's chat. Nothing dials                                                                                                                                                                                                                                  |
| 20  | B, then A: sign out, Continue with Google with step 15's account. A also: Continue with Apple                                                                                                             | The sheet returns to the app. Signed in where the email is a person's; otherwise "No company has added this sign-in"                                                                                                                                                          |
| 21  | A, VoiceOver on: a. a wrong code at sign-in; b. rotor on Headings, each tab; c. Me's three pairs; d. Today with the clock running; e. Crew, Add a shift today, "Starts: 15 minutes later"; f. Me, Español | a. "That code did not work. Check it, or ask for a new one." unasked; b. "Today, heading", and so for Week, "Your hours", Crew, Me; c. "selected" on the chosen one; d. the job row with no symbol named, the timer as hours and minutes; e. the new time; f. a Spanish voice |
| 22  | VoiceOver still on. L: give yourself a shift on job 2 from now. A: open Week, airplane mode on, clock in on job 2. L: remove that shift. A: airplane mode off                                             | "Needs attention" is spoken, with an error vibration. The sheet lists the refusal                                                                                                                                                                                             |
| 23  | B, TalkBack on: 21a and 21c                                                                                                                                                                               | The same words                                                                                                                                                                                                                                                                |
| 24  | The Mac, VoiceOver on (Cmd+F5), L: save a change in Settings, move a shift in Schedule                                                                                                                    | "Saved." and "Undo" are spoken. Cmd+Z undoes the move                                                                                                                                                                                                                         |
| 25  | L, People: deactivate Walk Worker. B: open the app, sign in by fingerprint                                                                                                                                | B is signed out. Fingerprint is refused and the key is gone                                                                                                                                                                                                                   |
| 26  | A, Me: press and hold the build's number. Send Claude the first sentence below                                                                                                                            | "Test report sent." Claude reads Sentry and Clerk back and names the report in `trader-phone`                                                                                                                                                                                 |
| 27  | L: read `/privacy` and `/terms` in both languages. Send the second sentence                                                                                                                               | Claude deletes the draft band. No build                                                                                                                                                                                                                                       |

- Not walked: an expired code, too many tries and a locked sign-in rest on their tests; the
  phone's 25 s wait for the server rests on its tests.
- Done when Hours on L shows the walk's time once, per job, with its flags.
- Tell Claude: "The walk is done on iOS build `<n>` and Android build `<n>`. Every step
  passed." Or: "Failed: step `<n>` on `<phone>`: `<what you saw>`." Then: "I saw the report
  arrive. I approve the privacy policy and the terms."

**Production, one gate**

- When: after the walk passes, the draft band is gone from `main` and green, and D'Sierra's
  OK is in. In one go, by `README.md`, "Make production exist"; nothing of it earlier.
- Money that starts: Clerk's paid plan and each texted code; Neon's second project; Vercel's
  second project and its firewall rule. Each vendor shows its price at the step.
- Apple's export question: the app declares exempt encryption only. Check on Apple's page
  (Complying with Encryption Export Regulations) whether the year-end self-classification
  report applies to you.
- Waits: Clerk's DNS check. Vercel and GitHub go on meanwhile; the sign-ins wait.
- See: `https://app.jpteq.app/api/ready` answers `"ready":true` with production's commit, and
  `"demo":true` once the Demo pair is set. `https://dsierrapainting.jpteq.app` is D'Sierra's
  homepage.
- Tell Claude: "Production exists. The Apple app's id is `<the number App Store Connect
shows>`." Claude puts it in `apps/mobile/eas.json` as `submit.production.ios.ascAppId` and
  pushes it to `main` before the release's pull request.

**The release**

- When: after "Production, one gate", with the app's id on `main`, green and served by
  staging. By `README.md`, "Release to production".
- See: `https://app.jpteq.app/api/ready` names the merged commit.
  `https://dsierrapainting.jpteq.app/get` hands each phone its link.
- Tell Claude: "The release is live. iOS build `<n>`, Android build `<n>`. Both minimums and
  both links are set."

**The finish line and the first bill**

- When: after the release.
- Do: the crew runs one full pay period on real phones. Hours, that period, Export. Issue and
  email one real invoice. A fault goes to Claude and ships by README's release procedure, run
  again; a phone fix is a new build. Then send D'Sierra the first bill.
- Tell Claude: "The finish line is met: the pay period `<dates>` ran on the phones, payroll
  was exported, invoice `<number>` was emailed."

### D'Sierra's

- Their OK on the 18 photos, the area line and the house number 65 in
  `assets/pics/home-exterior.jpg`: blocks production.
- Camera originals and a mark with no white background: block nothing. Claude swaps the files
  in before or after the release.
- The WhatsApp number for their homepage: blocks only the homepage's WhatsApp link.

### Vendors'

- Clerk's DNS check: blocks production's sign-ins. Vercel and GitHub go on meanwhile.
- Apple's review of the first external build: blocks the TestFlight public link, so Get the
  app's iPhone link and the iPhone crew's invitations.
- Play's link: a first release's link can take some hours. Blocks Get the app's Android link
  and the Android crew's invitations.

## After MVP

In the order it would come back. The owner reorders at will.

- Pay periods: close, lock, late adjustments.
- Materials and receipt photos.
- Day closeout.
- Pay rates and job cost.
- QuickBooks exports, once the partner's edition is known.
- Approval queue, only if the flags prove too weak.
- Credit memos.
- For D'Sierra's customers: a Send reminder button on an overdue invoice; a page per
  invoice, with no login, that shows when it was opened; a receipt when an invoice is paid,
  with the company's review link.
- Public App Store and Play listings, with the account-deletion flow the stores require.
- A nightly database backup outside Neon, with a restore check.
- Push notifications.
- Smart Clock-In, an arrival prompt by geofence, and biometric confirmation.
- Audit log, a sync diagnostics screen, a job's timeline.
- Product analytics, once there is more than one crew to learn from.
- A second contractor: self-serve onboarding, a brand of TRADER's own, each company's logo
  on its invoices and its homepage on its own domain.
- Payments and a customer portal.
- An estimate request form.
- Smaller switches: the early clock-in minutes, an Idle preset for jobs, invoices to
  customers in Spanish.
- For the workflow: scheduled Claude Code runs, the nightly run of the checks and the
  Android flows among them; a separate GitHub identity or a scoped token for a hard
  production lock; vendor sign-ins for Claude that cannot reach production; the browser
  suite on the demo data inside `check`; a Claude Code session of its own on the
  workstation, with the rule for two sessions on one list.
- The load baseline: load tools on the workstation, data in four sizes, the scenarios,
  latency budgets written from the first run.
- Read scaling: a job list of names only, Today's read by column, office lists that say when
  they are cut short, one settings statement where there are three, an index only where a
  measured plan needs one.
- Simplification, the rest: the test harness (one clock, one id maker); one Clerk client and
  one error-report allow-list.
- One money rule: an invoice's balance worked out once in the database, the void rule in the
  trigger, the invoice list's presets in SQL.
- Identity before a second contractor: an invitation bound by its tag, addresses across
  companies. The owner first sets a session claim on both Clerk instances.
- Deep load testing: load, stress, spike and soak; races on a payment, a void, a send, a
  move against a clock-in, and a job's two writers.
- The gates: lint for unused code and needless conditions, a parity test for the local
  check, job timeouts, a workflow linter, the phone's store under test, the phone flows in
  CI.
- Operator signals: the request id reaches the person; a mail provider's failure is noticed;
  no lock is held across a call to a vendor.
- Passkeys in the phone app.
- A developer console.
- Crews and foremen.
- Undo checks the shift before it writes the opposite change.
- A mail the provider accepted is not recorded "failed" when the call times out.
- The homepage's before-and-after strips are not keyboard stops when nothing scrolls.
- A development build's error report carries no file path.
- TypeScript 6.
- Sign-in codes over WhatsApp, if Clerk offers it for sign-in.
- Messages TRADER itself sends over WhatsApp's Business Platform.
- Office: the rest of the repeated interface code onto shared pieces.
- Phone: the rest of the repeated interface code onto shared pieces.
- The demo data holds an entry outside the schedule and a session left open.
- One field-error pattern: a refused field is marked and its reason read with it (every
  office form).
- Phone, pressed and disabled: every control shows a press; a disabled secondary button looks
  disabled (Sign in, Today, Crew, Me).
- One main button a screen: Settings, an issued invoice, Me, the sync sheet when only a
  refusal is listed.
- Office layout: less above the table (Hours, Schedule); a full-screen panel keeps Close in
  view; a long company or person's name in the header at 390; Passkeys in a card (Settings);
  the switches that are not destructive drawn apart from Void and Deactivate.
- Office steps: a forgotten clock-out closed in one action (Hours); New invoice's job list
  marks archived jobs and tells like names apart.
- Office tables and panels: an issued invoice's lines named on a phone; the email shown once
  in a person's panel (People).
- Sign in, both apps: say that a new code went out; the refusal sits beside the code field.
- Phone polish: Saved and Sent look different (Today); choices are spoken as choices (Me,
  Today); a time range never breaks mid-line (Crew); On the clock has its icon (Week); sheets
  hold still under Reduce Motion.
- Public pages and speed: reading sizes on Privacy and Terms; the small font on Get the app,
  Privacy and Terms; Schedule's first paint on two reads; the theme test compares sizes as
  well as colours; the homepage's headline holds its box while its font arrives; Get the
  app's "Back to the homepage" at the target height it has on Privacy and Terms.
