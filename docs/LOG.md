# TRADER — Log

What happened and what was decided when: every session's entry, every decision as it was
made, every task as it was ticked. [RULES.md](RULES.md), Authority, says what this file is
for. A fact in force is read in its home, not here.

- Nothing here is edited or removed. `check` fails when a line of `main`'s log is missing,
  changed or out of order, or a day's heading repeats.
- One `## YYYY-MM-DD` heading per day, newest last: the local date of the machine the session
  runs on (`date +%F`). If that day's heading is already there, what is added goes under it.
- Under a day, a decision is one bullet: `- **date** — the decision — Supersedes: what it
  replaces`, the last part left out when it replaces nothing. A session is
  `### YYYY-MM-DD — one-line summary`, then three bullets — **Did**, **Decided** (or
  "nothing"), **Next** (a task in TASKS.md) — and after them the lines of each task it ticked,
  as TASKS.md stated them.
- Until 2026-11-17 the decisions were a table in ARCHITECTURE.md, the sessions were MEMORY.md's
  Log and a ticked task stayed in TASKS.md. What was written before then says "ARCHITECTURE"
  for a decision's row and "MEMORY" for a session's entry: both are read here. A cite of
  ARCHITECTURE by a date and a subject, wherever it still stands, names a bullet under that
  day.

## 2026-11-08

### 2026-10-09 → 2026-11-08 — rolled up

- 10-09 → 10-29: `archive/pre-rebuild` tagged, orphan `rebuild`, public repo, no trailers; six
  documents; D Sierra Painting mark, accent `#2808AC`; Compose Postgres 18 as `trader-local`,
  `.env.example`, Node 24: Stages 0–1 closed; Stage 2 lines 1–4: Drizzle, `pg` seam, core
  tables, `uuidv7()` office ids, `0002` guard, pay, approvals, voids, corrections; 53 tests.
- 11-03: Stage 2 lines 5–8: billing tables; `audit_log` (API-written, empty in V1); `trader_app`,
  grants, FORCE RLS on 17 tables, startup guard; owner-only seed; Stage 2 closed at 136 tests.
- 11-04: Smart Clock-In scoped in PRD (post-pilot), Stage 9; `rv.sh` retired. Stage 3 lines 1a–6:
  `0015` identity binding; tRPC, adapters, `me.get`; role gates; fold, `validateEvent`; `0016`–`0018`
  closeout, seal, freeze, field-write lock; fingerprint `v1.`; `0019`/`0020` corrections; 432 tests.
- 11-05: Stage 3 lines 7–10: `0021`–`0026` approval facts, `sync.push`/`sync.pull` (`3c97d4f` on a
  red run, flake fixed in `a807875`), approval queue and accounting, `labor.repair`; `report.ts`
  (minimized `ErrorReport`, `logReporter`, `reportingOnError`, reporter required in the context);
  `status.get` public, four states from `TRADER_SYNC_MODE` and minimum builds; 669 tests.
- 11-06: repair/push race pinned by queue order (670 tests). Pilot-scope documents: five decision
  rows, Stage 3 ticked, `row N` pinned to `779894f`, Stages 7 and 8 swapped; open: worker sign-in
  without email, credit ceiling and void, archived-job closeout, admin's own entries, assignment
  rules. Stage 4 line 1: `apps/web` host, route handler, cookie dev sign-in, shell; 683 tests.
- 11-07: Stage 4 line 2: `roster.*`, `me.update`, last-admin guard under one locking statement,
  race-tested; web tRPC client, `/roster`, `/profile`; 712 tests; `6c1a9fc` on a red run. Line 3:
  `customer.*`, `crew.*`, `job.*` under the crew and job row locks, the membership race proven
  against a real push; `sync.pull` led crews by role; `/customers`, `/jobs`, `/crews`; 754 tests;
  `2cb77de` on a red run. Owner: B7.1–B7.17 as recommended; open: office receipt entry.
- 11-08: Stage 4 line 4: `pnpm demo` writes a synthetic company into `trader_demo` through the
  real procedures; 770 tests. Owner: Figma is the exploration surface; UX review before line 5.

## 2026-11-09

### 2026-11-09 — UX review, office shell, office list pattern

- **Did:** the review, measured in the browser on `trader_demo` at 390, 768 and 1280; DESIGN
  amended with its decision row; Figma file _TRADER — Office_ (tokens, screens as built). Shell:
  56 pt header, grouped navigation, `/` to Jobs, rows by a 720 px container query. List pattern:
  `page-header`, `field`, `note`, `row-editor`; roster at 390 from 3,547 px to 1,183; 770 tests.
- **Decided:** by the owner on 2026-11-09: plan K-1 to K-6, K-8, K-9 as recommended; K-7 not taken.
- **Next:** owner merges `ux-review`, `office-shell`, `office-list-pattern` in order; then TASKS.

## 2026-11-11

### 2026-11-11 — Audit, then the V1 readiness pass

- **Did:** a read-only audit at `fbf2e5d` (eight specialist reviews, browser pass, catalog
  queries): no P0, six P1s. Then, on the owner's instruction, branch `v1-readiness`: API
  plumbing under `core/`, tests mirroring `src/`; one home each for the caller lock, server
  clock and closed-day query; pool bounds and error listener; default timeouts on protected
  calls; batch cap; bounded instants; tests and seed refuse `DATABASE_URL`; gate inventory
  test; typed lint; `0027`; office result notes, confirmed destructive actions, load retry,
  pinned edited row, error and not-found screens, baseline headers on built apps, online-only
  requests;
  caps removed; PRD, ARCHITECTURE, DESIGN, RULES revised; TASKS rewritten to a deployed V1.
  784 tests.
- **Decided:** by the owner on 2026-11-11, the rows of that date in ARCHITECTURE: event-time
  plausibility, `captured_offline`, rejected-record trace, pull extension, pay-period
  membership, hours rounding, credit memos, audit rows in V1, no document caps. Not done, and
  now TASKS lines: the client-safe contract export, the screen scaffold extraction,
  `status.get` without the adapter, the wider startup guard, the comment citations.
- **Next:** owner reviews and merges `v1-readiness`; then Stage 4's first open line,
  event-time plausibility in `sync.push` (plan first: sync).

### 2026-11-11 — V1 owner decisions D01–D21 written into the documents

- **Did:** branch `docs-v1-final-alignment` from `076fcd6`, documents only: PRD, ARCHITECTURE
  (sections Operational sync states, Office authority, Accounting and exports; one decision
  row per `V1-Dnn`), DESIGN (ten component rows), TASKS (Stages 4–8 open lines rewritten with
  their tests; every `**decide**` but the Neon owner role resolved). No code, no migration.
- **Decided:** by the owner on 2026-11-11, V1-D01 to V1-D21 (ARCHITECTURE, Decisions), and in
  the session an amendment to V1-D10: an admin's own labor never needs approval. Superseded
  rows of the same date: event-time ordering by `server_timestamp`, the two-minute
  `captured_offline` definition, the every-record trace, advisory-only sync states. Left to
  each task's plan: diagnostics retention, the reachability staleness bound, the restricted
  answer's wire shape, the adjustment basis stored at close.
- **Next:** independent review of the branch's diff, then the owner merges; then Stage 4's
  first open line, event time kept and judged (plan first: sync, fold, fingerprint version).

### 2026-11-11 — Event time kept and judged (V1-D01)

- **Did:** branch `event-time-kept-and-judged` from `d06c4f7`, five commits. The fold and the
  closeout day query read `client_timestamp` alone; fingerprint `v2.`. `judgeEventTime`
  (`sync/reasons.ts`) in `pushLaborEvent`: `clock_skewed` from the receipt comparison,
  `time_in_future`. Demo history as an offline backlog the admin approves, one claimed-online
  day. Citations by date and subject in `fold.ts`, `day.ts`, `sync/labor.ts`. No migration, no protocol
  change. Each guard watched red: the old ternary, the old day query, version 1, the future
  guard, the flag merge. 800 tests.
- **Decided:** by the owner on 2026-11-11 ("execute", the plan's recommendations): receipts
  are not compared; the demo treatment; the citation cleanup. Rows of that date in
  ARCHITECTURE: fingerprint `v2.`, closeouts sealed under the old fold, the receipt
  comparison as built, the demo fixture. Consequences of V1-D01 worth knowing: a phone more
  than five minutes fast has every fresh event refused until the office repairs it; a
  truthful online capture delivered more than five minutes late is flagged.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, rejected-record
  diagnostics (V1-D04; plan first: the store and the retention period).

### 2026-11-11 — Rejected-record diagnostics (V1-D04)

- **Did:** branch `rejected-record-diagnostics` from `2e8b12d`, six commits. A request id per
  HTTP request in the context and the error report. `sync_diagnostics` (`0028`, `0029`):
  tenant policy, SELECT, INSERT, DELETE. The push loop notes refusals, the record it stopped on
  and the identifiable records behind it; the sync procedure writes them after the call
  settles, guarded, with a bounded delete of expired lines and a per-caller cap.
  `diagnostic.list` and its gate line; `/refusals`, checked in the browser on `trader_demo` at
  390 and 1280. Watched red: the client-supplied id, the bind, the prune, the cap, the write's
  guard, the rest-of-batch note, the read's retention and zone filters. 832 tests.
- **Decided:** by the owner on 2026-11-11 ("execute", the plan's recommendations), the five
  rows of that date in ARCHITECTURE: the table as the store, 30 days, the receipt time in a
  line, the request id in `ErrorReport`, DELETE on this one table, `/refusals`. Found while
  building and not in the plan: the non-binding resolve (its own row). Not done: the daily
  cross-tenant delete, now a Stage 6 line; no request id is returned to the client.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, audit rows
  (V1-D20).

## 2026-11-12

### 2026-11-12 — Audit rows (V1-D20)

- **Did:** branch `audit-rows` from `3781aea`, seven commits. `recordAudit`
  (`core/audit.ts`) on the mutating branch of `roster.invite`, `setRole`, `deactivate`,
  `reactivate`, `setPayRate`, `labor.repair` and `approval.decide`, in each one's own
  transaction; no migration, no procedure, no screen. The three roster suites and the web
  roster test moved to disposable databases first. Inventory test (static) and the demo's
  per-action counts (dynamic); `pnpm demo --reset` checked by query: 8 invitations, 5 rates,
  1 repair, 249 decisions, 1 deactivation, 1 demotion, one actor. Watched red: a dropped
  call, a row written on a duplicate, an email in a row, a swallowed insert failure, an
  unlisted writer. 847 tests.
- **Decided:** by the owner on 2026-11-12 ("execute", the plan's recommendations), the four
  rows of that date in ARCHITECTURE: row contents, one row per repair call, the stamp from
  the clock, no read path. Not changed and worth knowing: `roster.invite` and
  `roster.setPayRate` take no lock on the caller, so an admin demoted mid-call still
  completes and is audited as the actor.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, dated
  worker-job assignments (V1-D07; plan first: schema).

### 2026-11-12 — Dated worker-job assignments (V1-D07)

- **Did:** branch `dated-assignments` from `2a5a054`, ten commits. `job_assignments`
  (`0030`, `0031`); `mayStartOn` exported from `sync/scope.ts` unchanged; `assignment.create`,
  `update`, `remove`, `list`, `mine` with their gate lines; a planned week in the demo (20
  rows); `/assignments` under Work, checked in the browser on `trader_demo` at 390, 768 and
  1280 — a week planned in one action, a day moved out of the week with its row kept, a
  removal confirmed, no sideways scroll, no control under 48 pt narrow. Watched red: the
  CHECK, the tenant policy, the admin gate, the conflict target, the two refusals, the
  own-rows filter in `mine`, the flag and `mayStartOn` itself, the caller re-read in
  `update` and `remove`. One independent review of the branch: nothing critical; its input,
  ordering, test and screen findings fixed in two further commits. 897 tests.
- **Decided:** by the owner on 2026-11-12 ("execute", the plan's eight recommendations), the
  row of that date in ARCHITECTURE and the DESIGN amendments (Assignments in the Work group;
  the Assignment row's words for an archived job and a deactivated person). Not done: no
  pull field (Stage 5), no audit row, no browser test, no Spanish office strings. Worth
  knowing: the native time control shows the browser's 12- or 24-hour form while the table
  shows `HH:MM` as written; the week bar starts at the browser's day, not the company's;
  `assignment.list` stops at 2,000 rows without saying so (the screen reads seven days).
  For the owner: PRD still says "any of the company's jobs" where the decision row now says
  not archived — the PRD sentence is the owner's to amend.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, admin
  closeout (V1-D08; plan first: closeout locks).

### 2026-11-12 — Admin closeout (V1-D08)

- **Did:** branch `admin-closeout` from `837c3f7`, four commits. `lockCloseoutScope` beside the
  foreman's scope; `closeout.review` gated to foreman and admin, `closeout.submit` admitting
  both in the procedure; no migration, no new procedure. `/closeout` under Work: job and
  date, the review, then one submit, checked in the browser on `trader_demo` at 390, 768 and
  1280 — a worked day submitted by keyboard, an archived crew-less job closed with its
  status kept, an open session blocking with its reason, a closed day shown locked, no
  sideways scroll, no control under 48 pt. Watched red: the review gate, the admin's
  self re-read, the missing-job refusal, the job lock (review and, through the real-commit
  push tests, submit), the role check in submit, a crew-less refusal, the id's version.
  918 tests.
- **Decided:** by the owner on 2026-11-12 ("execute", the plan's seven recommendations), the
  row of that date in ARCHITECTURE and the DESIGN amendment (Closeout in the Work group): a
  deactivated crew's job is in an admin's scope; no audit row; no read of a closeout as
  submitted; flags only from the review's own fields; no demo change. Changed from the plan:
  the push-first test answers `sessions_open`, as the foreman's does, not `review_stale`.
  Not done: no browser test, no Spanish office strings, no approval state in the review.
  Worth knowing: the role check in `submit.ts` is one of three that refuse a worker (the
  scope and `lockActiveSelf` are the others), so removing it alone turns no test red. For
  the owner: DESIGN's Closeout row reads as saying the status will not change for a job with
  no crew too, while ARCHITECTURE writes it for any job not archived; the screen says "will
  not change" only for an archived job. The DESIGN sentence is the owner's to amend. A
  `closeout.get` read of the day as submitted would need its own TASKS line.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, the worker
  ledger read.

### 2026-11-12 — Worker ledger read

- **Did:** branch `worker-ledger-read` from `7fd3107`, four commits. `labor.ledger`
  (`labor/ledger.ts`), admin-gated, with its gate line; the demo's corrected day read
  through it; `/ledger` under People, checked in the browser on `trader_demo` at 390, 768
  and 1280 — the corrected clock-out beside its replaced original, a deactivated person, an
  empty range, a range past 31 days refused under its field, no sideways scroll, no control
  under 48 pt. Watched red: the gate, the person lookup, the range filter and its bound, the
  zone of the work date, the receipt and id ordering keys, the decisions, the effect, the
  open-session pointer, the closeout match, `corrected`. No migration. 932 tests.
- **Decided:** by the owner on 2026-11-12 ("execute", the plan's seven recommendations), the
  row of that date in ARCHITECTURE and the DESIGN amendments (Labor ledger in the People
  group; Worker ledger): the screen in this line, the open-session pointer, 31 days with no
  pagination, no job or approval filter, `hasLocation` and no coordinates. Changed from the
  plan: `Still open` is a pill, as on the closeout screen; an entry entered by someone else
  says "Entered by" in its cell. Not done: no browser test, no Spanish office strings, no
  link to a queue or a repair (neither screen exists). Not seen in the browser, covered by
  the API tests only: the open-session line, a rejected session, a void.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, the approval
  queue screen and labor repair from the ledger screen.

### 2026-11-12 — Approval queue screen and labor repair from the ledger

- **Did:** branch `approval-queue-and-repair` from `e7e81f1`, seven commits. `approval.queue`
  answers `timezone` and a receipt's `receivedAt`. `zoned.ts` (wall time in a zone, both
  ways) and `ledger/repair-set.ts` (a draft to `labor.repair` operations, ids, the minter).
  `/approvals` under Work; the repair editors, Void session and "Add missing hours" on
  `/ledger`. Checked in the browser on `trader_demo` at 390, 768, 1024 and 1280 — both
  times on Luis's clock-skew day, approve by keyboard, reject in two presses, a corrected
  clock-out, a break added as a pair and refused alone, a void, missing hours, a skipped and
  a future time refused, the repairs then approved from the queue; no sideways scroll, no
  control under 44 pt wide or 48 pt narrow. Watched red: the zone and the receipt time, the
  earlier instant and the skipped hour, a correction's root, the kept ids and their order,
  the job of a corrected entry and of an added one. No migration, no new procedure.
  957 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its recommendations
  1 to 8), the row of that date in ARCHITECTURE and the DESIGN amendments (Approvals in the
  Work group; Approval row; Worker ledger, no longer read-only). Changed from the plan: the
  queue is read fresh on every visit instead of being invalidated by a repair; an
  `id_conflict` takes new ids; editor fields sit two to a row from 1024, not 768; `stamp`
  and `duration` moved to `format.ts`. Not done: no component or browser test, no Spanish
  office strings, no link from a queue row to the ledger. Not seen in the browser, covered
  by tests only: "Show more", an own entry, `already_decided`, a skewed receipt,
  `repair_stale`, the repeated hour. Open for the owner: the plan's question 9 — the
  request asked to keep independent approval of an admin's own labor, which is the code
  today and the rule the next line retires; confirm that line still stands.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, an admin's
  own labor needs no approval (V1-D10 as amended; plan first: schema, sync).

### 2026-11-12 — An admin's own labor needs no approval (V1-D10 as amended)

- **Did:** branch `admin-own-labor` from `2f4be42`, five commits. `0032`: one SQL rule,
  `labor_event_needs_no_approval`, and the deferred checks of 0022 and 0026 standing down
  for it. `sync.push` writes no approval for a worker who is an admin, the role read from
  the rows its scope locks; `labor.repair` writes none for the caller's own ledger. The
  ledger screen's saved note follows the answer. Checked in the browser on `trader_demo` at
  1280 and 390 — the demo admin's own missing hours `Counts` with "Approved by default" and
  nothing new on `/approvals`; the same for another person waits. Watched red: the rule
  never true, the rule without its initiator clause, the unconditional insert in push, the
  caller's resolved role in place of the locked worker's, a repair never own, the worker's
  role in place of the caller's own ledger, and the exemption broken at a true commit.
  973 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its three
  readings of the V1-D10 row), the row of that date in ARCHITECTURE: a foreman's push for
  an admin writes no approval; one admin's repair of another's is pending; rows already
  stored are left as they are. Changed from the plan: the saved note reads "These are your
  own hours, so they count without approval"; a closeout test that used an admin's push to
  carry a reason now gives the crew the job and pushes as a worker. Not done: the ledger
  screen's explanatory sentences (a Note), no `after_closeout` case for an admin's push,
  no browser test, no Spanish office strings, no check at 768 or 1024. Not seen in the
  browser, covered by tests only: an admin's own correction and void, a foreman's push for
  an admin, the promoted worker's `own_entry`.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, material
  cost entry by the office.

### 2026-11-12 — Material cost entry by the office

- **Did:** branch `material-cost-entry` from `f081ea6`, five commits. `material.list` and
  `material.setCost`, admin-gated, with their gate lines; three receipts priced in the demo;
  `/materials` under Work, checked in the browser on `trader_demo` at 390, 768, 1024 and
  1280 — an unpriced receipt priced by keyboard, the same cost sent again, a correction, a
  clear in two presses, a malformed amount refused under its field, a sealed receipt and the
  after-closeout one priced, the job filter, both empty states, no sideways scroll, no
  control under 48 pt narrow or 44 pt wide. Watched red: a second column in the update (on
  an open receipt and on a frozen one), the `unchanged` answer, the caller re-read, the
  field-write lock, the row lock, the unpriced filter, the cursor's read-back, the job
  refusal, both gate lines. No migration. 999 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its seven
  recommendations), the row of that date in ARCHITECTURE and the DESIGN amendments
  (Materials in the Work group; Material cost): the screen's home, currency required with
  no default, the field-write lock taken, clearing allowed, any standing priced, the demo's
  three costs, no column-level grant. Changed from the plan: the real-commit test stops the
  closeout at its `FOR SHARE` of the day's receipts, where it truly waits; no Note about
  hand-made costs, which bite nothing. Not done: no browser test in CI, no Spanish office
  strings. Not seen in the browser, covered by tests only: "Show more", the `Rejected` and
  `Voided` pills, a refusal from the server. Worth knowing: who priced a receipt is not
  recorded (V1-D20); the corrections-with-decisions query now has three copies (`queue.ts`,
  `pull.ts`, `list.ts`); if `job.list` fails the job filter offers only "All jobs".
- **Next:** owner reviews and merges the branch; then Stage 4's next open line,
  office-created material entries (V1-D09; plan first: schema).

### 2026-11-12 — Maestro chosen for native UI flows; documents only

- **Did:** branch `maestro-e2e-decision` from `499ac50`, documents only. A read-only
  evaluation: no mobile app and no Playwright exist yet, so nothing can be driven today; on
  the Mac, Xcode 26.6 with iOS 26.2 and 26.5 simulators, Android Studio with one API 36.1
  emulator and its bundled JDK 21, no Maestro, no system JDK. Three Stage 5 lines in TASKS
  (the CLI and MCP, the development sign-in with its smoke flow, the flow suite), the
  emulator line moved to the Mac, one decision row, the `testID` rule in RULES. No code, no
  dependency, no CI change. 999 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its six
  recommendations), the row of that date in ARCHITECTURE. Not done: Maestro is not
  installed and its MCP server is not registered — the session's permission classifier
  refused the Homebrew tap and the `~/.zshenv` edit, so both are the owner's to run and the
  new CLI line stays open. Not yet proven, and that line's to prove: that Maestro 2.12
  drives iOS 26.x simulators and an API 36.1 emulator (its docs list older ones), that it
  runs on Android Studio's runtime as `JAVA_HOME`, and whether a flow can answer a biometric
  prompt. Read on Maestro's pages that day: physical iPhones are not supported, and
  `setAirplaneMode` works on Android only.
- **Next:** owner installs Maestro and registers its MCP server, then reviews and merges the
  branch; then Stage 4's next open line, office-created material entries (V1-D09; plan
  first: schema).

### 2026-11-12 — Maestro's MCP proven on the iOS 26.2 simulator and the API 36.1 emulator

- **Did:** on `maestro-e2e-decision`, no code. Maestro 2.12.1 (installed by the owner) on
  Android Studio's JDK 21, driven through `maestro mcp` over stdio. On iPhone 17 Pro, iOS
  26.2, and on `Medium_Phone_API_36.1` (Android 16, arm64): `list_devices`,
  `take_screenshot`, `inspect_screen`, a flow that opens Settings, taps a row and asserts
  the next screen, and the same flow red on a wrong assertion. `setAirplaneMode` on and off
  on the emulator, read back with `adb`. Both devices shut down after; the emulator ran
  with `-no-snapshot-save`. The CLI line in TASKS ticked. 999 tests.
- **Decided:** nothing. Not done: the tools were not called through Claude Code's own
  binding — `claude mcp list` shows the server connected, but it was registered after the
  session began (Notes); iOS 26.5 was not booted; no flow is committed. Not provable until
  `apps/mobile` exists: a `testID` reaching Maestro's `id`, the New Architecture, and a
  biometric prompt answered end to end — the host channels exist on both platforms (Notes),
  and the emulator has no PIN or enrolled finger, left so on purpose.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line,
  office-created material entries (V1-D09; plan first: schema).

### 2026-11-12 — Office-created material entries (V1-D09)

- **Did:** branch `office-material-entries` from `e3f653c`, seven commits. `0033`:
  `materials.entered_by_office` and its CHECK, back-filled `false`. `material.list`,
  `approval.queue` and `closeout.review` answer the provenance. `material.create`, admin-gated,
  with its gate line; one office receipt in the demo; the form on `/materials` and "Entered
  by the office" on `/materials`, `/approvals` and `/closeout`, checked in the browser on
  `trader_demo` at 390, 768, 1024 and 1280 — an open-day entry by keyboard, a closed-day
  one with its approval sentence and its row in the queue as the admin's own, an archived
  job, an empty form, a zero quantity, a malformed amount and a future date refused under
  their fields, no sideways scroll, no control under 48 pt narrow or 44 pt wide. Watched
  red: the CHECK, the dropped default, push's provenance clause and its literal, the three
  read fields, the gate, the caller re-read, the job lookup, the future refusal, the
  field-write lock, the approval insert, create's provenance clause and literal, noon, the
  raced answer. No dependency. 1,028 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its seven
  recommendations), the row of that date in ARCHITECTURE and the DESIGN amendment (Material
  entry): archived jobs admitted; noon of the named day in the company's zone; a future day
  refused, no lower bound; an open-day entry counts without approval; the back-fill; the
  demo's entry; no audit row. Changed from the plan: no second read of the id after the
  field-write lock — the insert's conflict answers it, and a test of the same entry sent
  twice at once pins that; a closeout and an entry on one job meet on the job's row, before
  the field-write lock; a correction's queue item also carries its receipt's logger. One
  extra commit fixed a test of mine that compared two receipts by position. Not done: no
  browser test in CI (its own TASKS line), no Spanish office strings, no pull change.
  Not seen in the browser, covered by tests only: `id_conflict`, a `duplicate` resend, a
  correction of an office receipt in the queue, a second admin deciding an entry. Worth
  knowing: the office row's `logged_at` is a convention, so nothing should sort or judge
  office receipts by time of day; a company with one admin can never decide its own
  closed-day entry.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, hours and
  cost aggregation (V1-D13).

### 2026-11-12 — Hours and cost aggregation (V1-D13)

- **Did:** branch `hours-cost-aggregation` from `cd28d90`, seven commits. `labor/hours.ts`
  (the one rounding, cells per worker, job and work date), `roster/rate-on.ts`, the money
  arithmetic in `jobs/cost.ts`, `materials/standing.ts` (the receipt read `material.list`
  had inline), `readDayHours`; `labor.hours` and `job.cost`, admin-gated, with their gate
  lines; the demo's last step and `run.test.ts` hold both jobs to figures worked out by
  hand, and `pnpm demo --reset` was checked by query. No migration, no screen, no
  dependency. Watched red: the half-up hour, rounding per session, an open session
  counted, a voided one kept, the zone, both gates, the person and job lookups, both range
  ends, both edges of the worker window, the decisions, the job filter, the 31-day bound,
  the half-up cent, a total across currencies, the rate of the day, unrated as zero,
  pending labor and pending, rejected and voided receipts folded in, another job's cells
  and receipts, a free receipt read as unpriced. 1,063 tests.
- **Decided:** by the owner on 2026-11-12, in the plan's two questions and its approval:
  a cost line is rounded half-up to the cent and totals are sums of lines; a session that
  counts but is still open adds nothing until it ends. The row of that date in
  ARCHITECTURE. Changed from the plan: `rateOn` is a file of its own and the rates query is
  in `jobs/cost.ts`, not `pay-rates.ts` (Notes, the import cycle); the money helper is
  `byCurrency`; pending labor also reports its unrated hours. Not done: no screen and no
  browser check (the next line's); `queue.ts` and `pull.ts` keep their own copies of the
  receipt read. Worth knowing: both reads fold the whole ledger of every worker involved,
  with no limit; a pending session whose void waits shows zero pending hours, as the queue
  does; who has no rate is unrated, never free. Open for the owner: `TASKS.md` line 14,
  "Resync every other clone", is still unticked in Stage 0 — a human action, to tick or
  strike.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, the
  reconciliation view and job cost on the job screen.

### 2026-11-12 — Job cost on the job page, and the reconciliation view

- **Did:** branch `reconciliation-and-job-cost` from `a7cd4e0`, four commits. `labor.hours`
  also answers `workers` and `totals`, sums of its rounded cells. `/jobs/<id>`, linked from
  the job's name on the jobs list: job cost to date from `job.cost`, what is in no total
  listed apart, labor by day. `/reconciliation` under People: approved hours per person by
  day and job for up to 31 work dates, and the days with something waiting, rejected or
  open apart. Pure view modules (`cost-view.ts`, `reconcile-view.ts`) and `format.hours`.
  Checked in the browser on `trader_demo` at 390, 768, 1024 and 1280 — the first job against
  `EXPECTED_COST` to the cent, a job with nothing recorded, an unknown id, a non-id address,
  the demo's two weeks with Priya's 6.50 h day and Elena's 8.50 h waiting, an empty range,
  a backward and a 32-day range refused under the field with no request made, the job link
  and the form by keyboard; no sideways scroll, no control under 48 pt narrow or 44 wide.
  Watched red: a sum that skips a cell, a total rounded again from milliseconds, the worker
  order, a dropped line beside the total, pending labor judged by hours, the line order,
  hours through a float, approved cells unfiltered, a person's total recomputed in the
  browser, rejected left out of unresolved. No migration, no new procedure. 1,079 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its four
  recommendations), the row of that date in ARCHITECTURE and the DESIGN amendments
  (Reconciliation in the People group; Job cost; Reconciliation): the view reads a range of
  work dates now, and its period picker and carried adjustments moved to the pay-period
  line in TASKS; totals come from the server. Changed from the plan: the two links under
  "Not in these hours" are lines of their own, not words in the sentence; an id the server
  will not parse reads "There is no job at this address". Not done: no browser test in CI,
  no Spanish office strings, no receipt list on the job page, no link that opens the ledger
  or the queue on the entry, Figma's screens as built. Not seen in the browser, covered by
  tests only or not at all: two currencies, the open-session and rejected- or
  voided-receipt lines, "No hours are approved on these days yet", the load-failure banner,
  a worker's or foreman's refusal. For the owner: `TASKS.md` line 14, "Resync every other
  clone", is still unticked; and the last `pnpm check` of this branch was red once on a
  race in `material.create` from the previous line (Notes), green on the rerun — a fix
  needs its own TASKS line.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, pay periods
  (V1-D03; plan first: schema, money).

### 2026-11-12 — Pay periods (V1-D03)

- **Did:** branch `pay-periods` from `fe0fea8`, ten commits. `0034`–`0036`:
  `pay_period_lines`, the close's unresolved counts, the pay-period lock, a period inserted
  open and never earlier than a closed one, lines sealed at the close. `pay-periods/lines.ts`
  (pure: the close's subtraction), `payPeriod.list`, `open`, `update`, `read`, `close` with
  their gate lines; two periods in the demo, week one closed with an entry waiting.
  `/pay-periods` under People and the period picker with adjustments on `/reconciliation`,
  checked in the browser on `trader_demo` at 390, 768, 1024 and 1280 — week one at 272.00 h,
  week two at 200.00 h carrying +6.50 h, the close by keyboard with the box ticked, a stale
  count refused with the new one, a close already made elsewhere, the next period opened,
  its dates moved, a 32-day period refused under its field; no sideways scroll, no control
  under 48 pt narrow or 44 wide. Watched red: every 0035 and 0036 guard, the lock, the
  caller re-read, each refusal, the acknowledgment's two comparisons, the stored counts,
  `exported` left out, the earlier-period filter, a closed period derived again, the
  preview's carrier, the view rules. 1,156 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its nine
  recommendations), the row of that date in ARCHITECTURE and the DESIGN amendments (Pay
  periods in the People group; Reconciliation; Pay-period close). Changed from the plan:
  three migrations, not two — access (`0035`) apart from guards (`0036`), as 0030 and 0031;
  no `overlaps` answer, since contiguity already refuses it as `not_contiguous`; ten
  commits, not nine, one of them a fix found in the browser (the toggle read "Close" beside a period;
  closing dropped focus to the page). Not done: the payroll CSV (next line), no browser
  test in CI, no Spanish office strings, no audit row, no field-write lock. Not seen in the
  browser, covered by tests only: `earlier_open`, an open session in the acknowledgment, a
  negative adjustment, an open period that is not the next to close, the load-failure
  banner, a worker's refusal. Worth knowing: a close folds every worker's whole ledger in
  one statement, with no limit; a session moved by correction onto a date in no period
  leaves a negative adjustment and no positive one; the second of two closers waits up to
  5 s; the first `pnpm check` of the screen commit ran before its one added format test.
  For the owner: `TASKS.md` line 14, "Resync every other clone", is still unticked; the
  Stage 6 Neon line says "29-file journal" and the journal now has 37.
- **Next:** owner reviews and merges the branch; then Stage 4's next open line, the
  payroll-hours CSV (V1-D18; columns decided in its plan).

### 2026-11-12 — Release 0.1 fast-track planned; its decisions written into the documents

- **Did:** a read-only readiness assessment at `6a2da5e` (code, documents, tooling,
  accounts, the stores' and vendors' pages), then branch `release-0.1-track`, documents
  only: six decision rows, ARCHITECTURE's stack, identity, accounting and domain sections,
  PRD Access, Invoicing and the release definitions, the Release 0.1 track at the head of
  TASKS with the stage lines it changes. No code, no migration, no dependency. Found: no
  `apps/mobile`, no Clerk, no deploy configuration, invoices as schema only; the API is a
  route handler whose every call is one transaction, so it runs on Vercel with no second
  host; `eas whoami` not signed in; `jpteq.app` delegated to Cloudflare with no record
  resolving; no Sentry configuration anywhere to reuse.
- **Decided:** by the owner on 2026-11-12 (the fast-track brief, the publisher-identity
  note, and the plan approved with its recommendations), the Release 0.1 rows of that date
  in ARCHITECTURE: SMS-code sign-in for the crew and email code for the office, passkeys
  not built; both stores from the individual accounts; recorded payments and invoice email;
  one deployment on `app.jpteq.app` and the apex, no `api.` host; Neon point-in-time restore
  for the release; the outbox, the location stamp and Spanish kept in the first field
  build. Not done: nothing is installed or created — the accounts and the Claude Code
  connectors are the owner's two lines in the track; MEMORY's log was not rolled up. Not
  verified, each named on its line: the Play account's creation date, whether store or Expo
  records exist, Neon's restore window, how a store reviewer passes an SMS code on a
  production Clerk instance. For the owner: `TASKS.md`, "Resync every other clone", is
  still unticked.
- **Next:** owner reviews and merges the branch and works the two owner lines; then track
  line R1, phone identity (plan first: schema, auth).

### 2026-11-12 — Phone identity (Release 0.1, R1)

- **Did:** branch `phone-identity` from `7ba46db`, seven commits. `0037`:
  `users.sign_in_phone`, E.164 `+1` by CHECK, unique per company. `0038`:
  `app_identity_phone()`, two more identity policies, the guard counting the phone setting.
  `0039`: `email` nullable, one sign-in address required. The adapter carries a verified
  email, a verified number or both; a third development header; `resolveUser` binds on
  either, exactly one row or nobody; `roster.invite` takes a number, an email or both and
  answers `phone_taken`; `me.get` and `roster.list` answer `signInPhone`. `/roster` and
  `/profile`, checked in the browser on `trader_demo` at 390, 768 and 1280 — an invitation
  by number by keyboard, by both, by neither, a foreign number, `phone_taken`,
  `email_taken`, the Sign-in column, the profile's read-only number, no sideways scroll, no
  control under 48 pt; a phone-only caller bound with `curl`, a second login with its
  number 401. Watched red: both column constraints, the presence check, both policies, the
  guard's phone rule, the setting set and cleared, the exactly-one rule, the adapter's
  refinements, the development header, each invite refusal, the normalisation, the stored
  number, the cookie bridge. No dependency. 1,189 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its seven
  recommendations), the three rows of that date in ARCHITECTURE and the DESIGN amendments
  (Profile form; Roster): a column of its own; no path to add or change a sign-in address
  after the invitation; per-company uniqueness, ambiguity fails closed; no role rule on the
  address; the browser's development sign-in stays email-only; the Sign-in column; `+1`
  only. Changed from the plan: the invite form also refuses a malformed number before any
  request; the demo and seed are untouched, so no demo person has a number. Not done: no
  browser test in CI, no Spanish office strings, no check at 1024. Not seen in the browser,
  covered by tests only: a person with a number and no email on `/profile`, the load
  failure. Not verified, R2's to read on Clerk's pages: that Clerk reports numbers in
  E.164, and how a session shows a verified number and email to the adapter. Worth knowing:
  a two-address cell makes a wide roster row two tight lines in 49 pt; a row bound in a
  local or demo database by a `dev:` subject can never be rebound to a provider's. For the
  owner: `TASKS.md`, "Resync every other clone", is still unticked; the Stage 6 Neon line
  says "29-file journal" and the journal now has 40.
- **Next:** owner reviews and merges the branch; then track line R2, Clerk behind the
  identity seam (plan first: auth; needs the owner's Clerk application).

### 2026-11-12 — Clerk behind the identity seam (Release 0.1, R2): built, not yet signed in to

- **Did:** the owner created the Clerk application (development instance, Hobby): invite-only,
  email and SMS codes, a number required, passwords, passkeys, usernames and SSO off, no
  self-service address change or deletion, 7-day sessions. Branch `clerk-identity-seam` from
  `f8e0243`, six commits. `IdentityDirectory` in every context and `roster.invite` admitting
  through it, a number now required; `@clerk/nextjs` 7.9.25 in `apps/web`; the claims adapter,
  the identity mode, `proxy.ts`, Clerk's provider, `/sign-in`, sign-out and the
  not-on-a-roster state; the Clerk directory over `POST /v1/users`; `.env.example`, three
  decision rows, DESIGN, TASKS. No migration, no new procedure. Seen: a build with no Clerk
  key passes; in the browser at 1280 and 390, `/sign-in` drawing Clerk's form with no
  sign-up; by `curl` on `next dev`, each mode's sign-in route 404 under the other, `me.get`
  401 with and without the development headers, `status.get` 200. Watched red: the invite's
  admission, its order and the required number; the flag rule, the mode rule and the
  adapter's catch; the sign-in 404; four rules of the directory. 1,213 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its seven
  recommendations, and "phone required" set by hand in Clerk), the three rows of that date in
  ARCHITECTURE. Changed from the plan: the directory creates the user by number alone when
  only the email is already held at Clerk, which the plan had counted as admitted; the
  proxy passes no key option (Notes); `apps/web` validates without `zod` (Notes); the
  sign-in page's other two states are not unit-tested (Notes). Not done: **R2 is not
  ticked** — nobody has signed in through Clerk. The four session claims are not on the
  instance yet (a probe token carried none), so every Clerk session is 401 until the owner
  pastes them (`.env.example`); after that, unseen and still owed: a sign-in end to end, the
  bind to Clerk's user id, an invitation creating a user from the screen, sign-out, the
  not-on-a-roster state, how the four claims render, a tab asleep past 60 s, the built
  app's 404 and 401 by `curl`. Not done at all: Spanish office strings, a browser test in
  CI, a session from the phone (R5). For the owner: PRD Access still says "an office admin
  is invited by their own email address", and the code now requires a number of everyone —
  the PRD sentence is the owner's to amend; `/sign-in` is drawn inside the office shell,
  navigation included, where DESIGN's Brand section speaks of a sign-in screen on its own;
  Pro is needed before a production instance (SMS, 30-day sessions), not before; `TASKS.md`,
  "Resync every other clone", is still unticked.
- **Next:** owner pastes the four claims into Clerk (Sessions, Customize session token) and
  creates one test admin there; then R2's end-to-end check on a throwaway database, and the
  tick.

### 2026-11-12 — R2 signed in end to end and ticked

- **Did:** the owner pasted the four session claims into Clerk. A real token then carried
  them as the adapter reads them: the flags as booleans, the number in E.164, a missing
  email as `null`. On a throwaway database and Clerk test numbers, in the browser on
  `next dev`: the seed admin signed in by code and was bound to Clerk's user id; the roster
  loaded; an invitation from the screen wrote the row, its audit row and the Clerk user;
  sign-out; a Clerk user no roster names read the not-on-a-roster state and signed out
  from it; the admin signed in again with no reload. On a built app with
  `TRADER_DEV_IDENTITY=enabled`, by `curl`: `/dev-signin` 404 to GET and POST, `/sign-in`
  200, `me.get` 401 with no session, with the development headers and with the cookie. One
  more commit on `clerk-identity-seam`, found by that check: the header kept the last
  person's name after a sign-out (Notes). The database dropped and the three test users
  deleted after. 1,213 tests.
- **Decided:** nothing. Not done: a tab left asleep past Clerk's 60-second token was not
  tried — a headless tab never sleeps; `CLERK_AUTHORIZED_PARTIES` was left blank
  throughout, so the option was never exercised against a real token; the session reset and
  the sign-in page's two drawn states have no unit test; nothing was checked at 768 or 1024;
  email-code sign-in was not tried, only the number. Seen once and not explained: Clerk's
  form stuck on its code step (Notes). For the owner, unchanged from the entry above: the
  PRD Access sentence, `/sign-in` inside the shell, Pro before production; and one test
  user of the owner's own, `+1 201 555 0000`, is still on the development instance.
- **Next:** owner reviews and merges the branch; then track line R3, the production path
  on staging (plan first: CI, auth).

### 2026-11-12 — Production path on staging (Release 0.1, R3): built, staging begun, not ticked

- **Did:** branch `production-path-staging` from `c8e7209`, seven commits. `assertLoginRole`
  beside the runtime guard. `pnpm --filter @trader/db onboard`, a dry run unless `--apply`.
  The environment checked at start (`deploy-env.ts`, `instrumentation.ts`, `start.ts`).
  `GET /api/ready`. The content security policy per request in `proxy.ts` and transport
  security in `next.config.ts`. `@sentry/nextjs` 11.12.0 in `apps/web` behind
  `ErrorReporter`, server only, every outgoing event rebuilt from an allow-list.
  `packages/db/README.md`; six decision rows; `.env.example`. No migration, no procedure, no
  CI change. Seen locally on a built app: a build with nothing set passes and the same
  build refuses to start, naming `DATABASE_URL`, `CLERK_AUTHORIZED_PARTIES`, `SENTRY_DSN`;
  with placeholders, the four baseline headers and the policy on `/sign-in`, all 18 scripts
  carrying the request's nonce, Clerk's form drawn in a browser with one refusal in the
  console, its telemetry, since switched off; `/api/ready` 503 against no database, reported.
  Watched red: both login comparisons and the guard behind them; onboarding's bypass
  refusal, both duplicate refusals, the name's case and spacing, input validation, the
  stated counters, the rollback; each start-up requirement and both runtime checks;
  readiness's login check, its report and its status; the policy's host check, closing mark,
  `'strict-dynamic'` and nonce length; the allow-list, an exception's message, the message
  rule, the tag list, the integrations and collection switches, the reporter's address check
  and its deferral. 1,295 tests.
- **Decided:** by the owner on 2026-11-12 (the plan approved as written, its nine
  recommendations, and three answers: `@sentry/nextjs`, staging in a Neon project of its
  own, the journal replayed as it stands), the six rows of that date in ARCHITECTURE.
  Changed from the plan: the forced error for Sentry is a failed readiness check, not an
  invalid `TRADER_SYNC_MODE`, which now stops the start (Notes); Clerk's client telemetry is
  off; the start-up work is in `start.ts` (Notes); readiness sets no statement timeout, the
  pool's 5 s connection timeout standing alone; the policy leaves out
  `upgrade-insecure-requests`, which transport security covers. Staging, by the owner that
  evening: a Neon project on Postgres 18.7 in `aws-us-east-1`, its owner read as
  `rolbypassrls` and `rolcreaterole` true and not a superuser, its sample table dropped; a
  Sentry organization and project; a Vercel project rooted at `apps/web` on Hobby, whose
  first build of `main` passed in 55 s with no variable set; the vendors' Neon, Vercel and
  Sentry plugins in Claude Code. Not done: **R3 is not ticked.** Staging is not migrated,
  `trader_app` has no password, no Preview variable is set, nothing has signed in on a
  deployment, no report has reached Sentry, no restore has been timed and the window is not
  recorded (the project read 6 hours of history on the free plan). Unseen and owed on the
  deployment: Sentry receiving anything at all — the SDK was run only against a recording
  transport — and `after()` holding a function open for it; `onRequestError` on a real
  error; the policy under a signed-in office, Clerk's challenge frame and its image host;
  HSTS as Vercel serves it; the pool behind PgBouncer; `assertLoginRole` on a real login,
  which no test can make. Not done at all: a browser SDK, source maps, rate limits, the
  `Origin` check, the per-transaction `session_user` check, `attachDatabasePool`. For the
  owner: Vercel's terms keep Hobby to non-commercial use, and the restore drill needs a
  Neon plan with instant restore — both are approvals at their step; once this merges, the
  Production deployment refuses to start until R9 sets its variables, by design; the Vercel
  plugin sends its vendor a daily ping and the names of its own skills unless
  `VERCEL_PLUGIN_TELEMETRY=off`; PRD Access still says an admin is invited by email, and the
  onboarding script, like `roster.invite`, requires a number — the PRD sentence is the
  owner's to amend; `TASKS.md`, "Resync every other clone", is still unticked.
- **Next:** owner migrates staging over the direct endpoint, sets `trader_app`'s password
  and Vercel's Preview variables (`packages/db/README.md`); then the staging checks, the
  restore drill, and the tick.

## 2026-11-13

### 2026-11-13 — R3 staging acceptance begun; written on 2026-11-14 from what can still be read

- **Did:** no entry was written that day; this one states only what the repository and
  the vendors still show. Commits `d0cb6a2` (the release named in the Sentry SDK test, red on
  CI before it) and `00679b2` to `56f13dc` (the operator-access TASKS line, onboarding
  printing a connection failure's own code, the runbook through the Keychain wrapper, the
  decision row, the Sentry tidy-up line). Five Preview variables on Vercel, each scoped to
  `production-path-staging`. On staging's database: the journal's 40 migrations, one
  company `R3 Staging Co`, an admin and a worker with fictional numbers, both bound to a
  Clerk user, one audit row, `trader_app`'s grants in place. Sentry `trader-web`: three
  events at 22:06 UTC from the preview of `d0cb6a2`, `customer.list` twice and `job.list`
  once, each `sqlstate 42501` — the forced error. Not readable any more, so not claimed:
  which browser checks were made and what they showed.
- **Decided:** by the owner, the row of that date in ARCHITECTURE (staging operator
  access), since amended by the 2026-11-14 rows.
- **Next:** the restore drill and R3's record.

## 2026-11-14

### 2026-11-14 — Staging autonomy, tools and the browser suite: built; staging runs wait on four Keychain items

- **Did:** `production-path-staging` pushed (PR #92 at `56f13dc`). Branch
  `staging-autonomy` from it, nine commits: three TASKS lines; `.gitignore`;
  `@playwright/test` 1.65.0 with `apps/web/e2e` (configuration and one serial flow) and
  the `e2e:staging` scripts; three decision rows; RULES (Toolbox, the agent's push and pull
  request); `CLAUDE.md`; the database runbook; `.env.example`. Outside the repository:
  wrappers `staging-app`, `staging-e2e`, `staging-neon`, `sentry-read` beside the two of
  2026-11-13; the permission rules rewritten in three tiers; Neon CLI 9.4.0, Sentry CLI
  3.8.2 and Clerk CLI 4.1.0 installed; Clerk's MCP server registered. Seen: `pnpm check`
  green four times (1,295 tests), the suite listed by Playwright and refusing to load
  without its two values; each wrapper refusing a bad call; `gh pr merge` and
  `vercel env pull` refused by rule, `vercel whoami` and the application-role wrapper
  running unprompted. Sentry reassessed, read-only: all three events of `TRADER-WEB-1` and
  `TRADER-WEB-2` carry a tag list, the release, a request id, `user.geo` (Ashburn, the
  sending server's city, with every user field null), a `trace` context and
  `error_names` `k>e>DatabaseError`; nothing about a person, and exactly the three items
  of the open tidy-up line. Both issues left unresolved.
- **Decided:** by the owner on 2026-11-14 (plan v2 approved, and eight answers), the three
  rows of that date in ARCHITECTURE: split by role, with only owner-role SQL and Neon's
  destructive commands prompting; `.env` kept as the local file, no staging file;
  previews kept behind Vercel's protection, reached with the automation bypass, no custom
  domain; the suite run on demand, not in CI; the four tools; this work on its own branch.
  Changed from the plan: the suite sends the bypass once and keeps its cookie instead of a
  header on every request (Notes); `staging-e2e` takes a branch name, not a URL; a fourth
  wrapper, `sentry-read`; `vercel alias` stays denied, since no domain is used; the first
  push was refused by the session's classifier and went through once the rule was written.
  Not done: **nothing has run against staging.** The suite has never met Clerk's form or
  the wall, so its selectors are unproven; the application role's connection, the Neon
  and Sentry CLIs and Clerk's MCP have answered nothing; no variable was set and no preview
  redeployed; Playwright's browser is not downloaded; no Maestro flow was run (its devices
  were listed); `staging-app web-dev` untried. The restore drill was not run and no
  Sentry issue was changed, by instruction. For the owner, the smallest set: Vercel's
  automation bypass secret generated and stored as `trader-staging-vercel-bypass`; the
  pooled `trader_app` string as `trader-staging-app-url`; a Neon key scoped to the staging
  project as `trader-staging-neon-key`; a Sentry read token as `trader-sentry-token`; the
  five Preview variables widened to every preview branch; Clerk's MCP sign-in in a new
  session; the two stray keys in `.env`. EAS is not signed in. `TASKS.md`, "Resync every
  other clone", is still unticked.
- **Next:** owner creates the Keychain items; then the browser suite on the
  `production-path-staging` preview, R3's record, and the restore drill on the owner's
  separate word.

### 2026-11-14 — Staging moved to a Vercel project of its own; the browser suite green on it

- **Did:** on `staging-autonomy`, four commits. The owner created a second Vercel project
  for staging (Node 24.x, rooted at `apps/web`, protected on every deployment, previews
  only), its bypass secret, four Preview variables and the Keychain items. Outside the
  repository, installed by the owner from files this session wrote: `staging-vercel`,
  pinned to that project's ids and checking them with Vercel before every command, and
  `staging-e2e` taking a deployment URL; the nine unpinned Vercel rules removed. Watched
  refusing: `deploy --prod`, a URL of the other project, a secret variable's name, the
  suite on the other project's host. Seen: the project's first record assigned to
  Production and cancelled unbuilt by its ignored build step; a CLI Preview READY with no
  alias; the pushed branch's Preview READY on the branch alias;
  `CLERK_AUTHORIZED_PARTIES` set for the branch to that origin and the redeploy taking the
  alias; 302 without the bypass. The suite red once at Clerk's email field, then all five
  steps green in 15 s on the alias. After it: one customer in the staging database with
  the run's stamp, no runtime error on the project, no new Sentry issue. Each credential
  answered a known read with no value shown. One `pnpm check` red on the
  `material.create` race (Notes), green on the rerun. 1,295 tests.
- **Decided:** by the owner on 2026-11-14, the row of that date in ARCHITECTURE: staging's
  own project, and its Preview deployments Claude Code's without asking each time.
  Changed from the plan: the first Preview came from the pushed branch, since the CLI
  refuses a Preview as a project's first deployment; the suite runs on the branch alias,
  not on a CLI deployment's URL; the wrapper also takes `env update` and `project`; the
  session's classifier refused the wrapper's install and the permission edit, so the
  owner ran both. Not done: **R3 is not ticked.** Of its three criteria: the office runs
  on the staging deployment as `trader_app` — seen, readiness 200 behind the wall and the
  flow green; a forced error reaching Sentry — seen on 2026-11-13 from the earlier
  project's preview, not forced again from this one, so this project's DSN is unproven;
  the timed restore — not run. Not seen: a `staging-vercel env rm` prompting, the
  wrapper's `logs --deployment`, the suite at any other branch. For the owner: the
  earlier project still builds a preview of every pushed branch and still holds the five
  staging-wired Preview variables for `production-path-staging`, left untouched by
  instruction; `TASKS.md`, "Resync every other clone", is still unticked.
- **Next:** owner reviews and merges the pull requests; then a forced report from this
  project's preview, and the restore drill on the owner's separate word, for R3's tick.

### 2026-11-14 — Sentry proven from the staging project; the restore drill prepared, not run

- **Did:** on `staging-autonomy`, documents only. A forced report from the staging
  project's Preview, with nothing changed on staging: a rolled-back row lock held as
  `trader_app` while the suite saved the fixture customer (Notes). Seen: the save refused,
  one `trader_error` line in the Preview's log, and one new Sentry issue carrying the
  environment `preview`, the release of the deployed commit, the request id, the path
  `customer.update` and `sqlstate 55P03` — no message, input, address or person; the same
  three extras as the open tidy-up line (`user.geo` of the sending server, a `trace`
  context, shortened class names). The lock read as rolled back and the suite green
  after. Read: staging's Neon project keeps 7 days of history (it read 6 hours on
  2026-11-12); pull request #93 has no `check` because its base is not `main` (Notes).
- **Decided:** nothing. Not done: **R3 is not ticked** — the timed restore is prepared
  and waits for the owner's word: a branch made from a past instant of staging's default
  branch, timed from the command to its first answered query, read back against a value
  the suite rewrote after that instant; the default branch is not rewritten, and the drill
  branch's deletion is a second approval. `staging-neon` does not yet pass `--no-secrets`
  on `branches create` (Notes); a corrected wrapper is written for the owner to install,
  and no branch is created before it is. For the owner: a third Vercel project on this
  repository, made minutes after the staging one, has no variable, builds every pushed
  branch and holds a Production deployment of this branch that answers 500 on a public
  `vercel.app` host; nothing of it was changed.
- **Next:** owner installs the corrected `staging-neon` and approves the drill; then
  R3's record and tick. Owner merges #92, then #93 once its `check` has run.

### 2026-11-14 — Restore drill timed on staging; R3 ticked

- **Did:** on `staging-autonomy`, documents only. The owner installed the corrected
  `staging-neon` (it adds `--no-secrets` to every `branches create`; `--secrets` watched
  refused). The drill, on the owner's word: an instant noted from the database clock
  (20:26:12 UTC), the suite run after it so the fixture customer's notes changed, then
  a branch of staging's default branch made from that instant. From the command to the
  branch's first answered query: 4 s. The drill branch read the notes as they stood
  before the instant, 40 migrations, two users, one audit row, and `trader_app` with its
  login attribute and grants; the default branch read the later notes, untouched. R3
  ticked on its three criteria: the office on the staging deployment as `trader_app`, a
  forced report in Sentry with nothing of a person, a point-in-time restore timed.
- **Decided:** by the owner on 2026-11-14 ("proceed", on the recommendation put to him):
  the drill is a branch from a past instant, not a restore of staging's default branch in
  place. Not done, and worth knowing: 4 s is the time for a database of one company and
  one customer and says little about a full one; an in-place restore was not rehearsed,
  nor a deployment pointed at restored state, nor a login as `trader_app` on it; the
  drill branch `restore-drill-20261114` and its compute still exist — deleting it is the
  owner's approval. For the owner: ARCHITECTURE still reads "The restore is not yet
  rehearsed" under its production-readiness list, the owner's sentence to amend; the
  third Vercel project and `TASKS.md`, "Resync every other clone", as before.
- **Next:** owner merges #92, then #93 once its `check` has run; then track line R4, the
  field app skeleton.

### 2026-11-14 — The drill written into ARCHITECTURE; #93 on `main` with its `check`

- **Did:** on `staging-autonomy`, documents only, after the owner merged #92 and #93
  retargeted to `main`. ARCHITECTURE: the readiness list states the rehearsal as an
  isolated recovery timed at 4 s and names what was not rehearsed, with a decision row
  for the drill's form. The pull request's description rewritten to what was verified.
  The required `check` had no run after the retarget; the next push started one (Notes).
- **Decided:** by the owner on 2026-11-14, the row of that date in ARCHITECTURE (the
  restore drill is an isolated recovery). Not done: the drill branch
  `restore-drill-20261114` still exists; the third Vercel project still builds every
  push; `TASKS.md`, "Resync every other clone", is still unticked.
- **Next:** owner merges #93; then track line R4, the field app skeleton.

### 2026-11-14 — Permanent staging branch created; no Preview of it yet, acceptance waits

- **Did:** `staging-preview` pushed at `main`'s commit `856b456` by an ordinary push.
  Read first: the staging project protected on every deployment, its ignored build step
  building only Previews, `CLERK_AUTHORIZED_PARTIES` set for `staging-autonomy` alone.
  Vercel started no build of the new branch (Notes), so nothing after the push could be
  done: no deployment, no alias, no variable, no browser run. Branch
  `staging-preview-branch`, documents only: the TASKS line, the Stage 6 decision narrowed
  to a staging domain, one decision row, RULES (Git and CI; Toolbox). 1,295 tests.
- **Decided:** by the owner on 2026-11-14, the row of that date in ARCHITECTURE (staging
  has a permanent branch): fast-forward only, moved by a session, no event-triggered
  workflow; deletion and force-pushes to be blocked at GitHub by the owner, no pull
  request required of it. Not done: **the TASKS line is not ticked** — none of its three
  runs exists. Owed after this branch merges: the fast-forward, the Preview of the new
  commit confirmed as the staging project's, its alias read from Vercel, the branch-scoped
  `CLERK_AUTHORIZED_PARTIES`, a redeploy, the suite; a second redeploy and the suite
  again; then a record of it, which is a later pull request and a second fast-forward.
  Unproven until then: that a fast-forward push builds, and that a redeploy keeps the
  alias on this branch. For the owner: the GitHub ruleset for `staging-preview`;
  `staging-autonomy` and its branch-scoped variable are left, each removal an approval of
  its own; the drill branch `restore-drill-20261114` is kept; `TASKS.md`, "Resync every
  other clone", is still unticked.
- **Next:** owner merges this branch; then the fast-forward of `staging-preview` and the
  permanent staging line's acceptance. R4 after it, plan first.

### 2026-11-14 — `staging-preview` fast-forwarded, authorized and green twice; not ticked

- **Did:** after the owner merged #94, `staging-preview` moved from `856b456` to `975027e`
  by the ordinary push in RULES. Seen: Vercel built that commit as a Preview of the
  staging project, READY in 39 s, its git ref `staging-preview`; the wrapper's `owns`
  answered for it; its one alias read from Vercel's connector; `CLERK_AUTHORIZED_PARTIES`
  added for the branch with that origin; a redeploy READY in 44 s with the alias moved to
  it; the suite's five steps green in 17.9 s on the alias. Then a second redeploy, READY
  in 43 s, the same alias on it, and the suite green again in 17.2 s. Around both runs:
  302 on `/api/ready` without the bypass, the project's protection still on every
  deployment, no runtime error on the project in the hour, no new Sentry issue (the
  three listed are of 2026-11-13 and of the forced report at 20:18 UTC). Branch
  `staging-preview-acceptance`, this file only. 1,295 tests.
- **Decided:** nothing. Not done: **the permanent staging line is not ticked.** Its third
  run, the suite on what a fast-forward builds, has been seen only through a redeploy:
  the build the push made had no authorized origin yet and was never run against. With
  the variable now in place, the next fast-forward is the first to show it unaided. Not
  seen: the suite red and then recovered on this alias; a session finding the branch
  behind at its start. Nothing was removed: `staging-autonomy`, its branch-scoped
  variable, the merged branch `staging-preview-branch` and the drill branch
  `restore-drill-20261114` all stand. For the owner: the GitHub ruleset for
  `staging-preview` (deletion and force-pushes blocked, no pull request required); each
  removal above is an approval of its own; `TASKS.md`, "Resync every other clone", is
  still unticked.
- **Next:** owner merges this branch; then the fast-forward, the suite on the Preview it
  builds with no redeploy, and the tick. R4 after it, plan first.

### 2026-11-14 — `staging-preview` green on a fast-forward's own build; the line ticked

- **Did:** after the owner merged #95, `staging-preview` moved from `975027e` to `6a9a149`
  by the ordinary push in RULES. Seen: Vercel built that commit from the push as a
  Preview of the staging project, READY in 18 s, its git ref `staging-preview`; the
  branch's alias on it with nothing asked; the wrapper's `owns` answering for it; 302 on
  `/api/ready` without the bypass; the suite's five steps green in 17.9 s on the alias,
  with no redeploy and no variable touched. Branch `staging-preview-tick`: the permanent
  staging line ticked on its three runs (2026-11-14: on the alias, after a redeploy,
  after a fast-forward), and this entry. 1,295 tests.
- **Decided:** by the owner on 2026-11-14: the evidence is sufficient for the tick, and a
  routine fast-forward gets no pull request of its own — its run is recorded in the next
  session entry that has other work to carry. Not done, the owner's: the GitHub ruleset
  for `staging-preview` (deletion and force-pushes blocked, no pull request required);
  the removals, each an approval of its own — `staging-autonomy` and its branch-scoped
  variable, the merged branches `staging-preview-branch`, `staging-preview-acceptance`
  and this one; the drill branch `restore-drill-20261114` is kept; `TASKS.md`, "Resync
  every other clone", is still unticked.
- **Next:** owner merges this branch; then the fast-forward and the suite, unrecorded
  unless red. Then track line R4, the field app skeleton, plan first.

### 2026-11-14 — Staging closed out: ruleset, last sync, old authorization and branches gone

- **Did:** read, and one approved removal; branch `staging-closure-record`, this file only.
  The owner made a GitHub ruleset for `staging-preview` — active, that branch alone, rules
  `deletion` and `non_fast_forward`, no bypass actor — and merged #96. `staging-preview`
  then moved from `6a9a149` to `733afd3` by the ordinary push, accepted under the
  ruleset; Vercel built it from the push as a Preview of the staging project, READY in
  15 s, the branch's alias on it; the suite's five steps green in 18.2 s with no redeploy.
  On the owner's word for that one item, `staging-vercel env rm` removed
  `CLERK_AUTHORIZED_PARTIES` scoped to `staging-autonomy`: read after it, the
  `staging-preview` value and the four Preview-wide variables stood, the deployment was
  the same one, and the suite was green in 14.1 s. The owner deleted the remote branches
  `staging-autonomy`, `staging-preview-branch`, `staging-preview-acceptance` and
  `staging-preview-tick`. Last read: `main` and `staging-preview` both at `733afd3` and
  the only remote branches; the suite green in 14.0 s; 302 without the bypass; no runtime
  error on the project and no Sentry issue later than the forced report of 20:18 UTC;
  Neon's `restore-drill-20261114` still there. Each staging tool answered one read: the
  Neon CLI (branches), the Sentry CLI (issues), the Clerk CLI and Clerk's MCP server
  (who it acts as; the development instance). 1,295 tests.
- **Decided:** nothing new. Production, as far as it was observed: the staging project
  protects every deployment and builds Previews only, and on #94 to #96 the other
  project's status read "Canceled by Ignored Build Step"; that project's own settings,
  variables and deployments were not read, by rule. Not ticked, and why: "Staging
  autonomy" — a destructive command prompting is the owner's to have seen (`env rm` is
  in the rules' ask list and ran once approved; a session cannot see its own prompt);
  "Staging tools" — every tool answered, but the Toolbox names no job for Clerk's MCP
  server, whose grant includes managing applications and users, and naming one changes
  what a session may do: a plan of its own; "Resync every other clone" — no other clone
  was inspected; `~/work/TRADER` is absent from this Mac. For the owner: local branches
  of the merged work remain in this clone.
- **Next:** owner merges this branch; then the routine fast-forward and the suite. Then
  track line R4, the field app skeleton, plan first.

## 2026-11-15

### 2026-11-15 — Weekly schedule decisions written into the documents (S0)

- **Did:** a read-only assessment at `d05d655` (the prototype's files, the assignment and
  push code, the five documents), then branch `a03-schedule-documents`, documents only:
  nine decision rows of 2026-11-15 and the Office authority, Audit trail and pull passages
  in ARCHITECTURE; PRD, Weekly schedule; DESIGN's `compact` style and six component rows;
  track lines S0 to S9. No code, no migration, no dependency. Read of the prototype's
  fourth revision, kept outside the repository: 47 of its 48 checks pass and the one
  failure is the circular three-shift choice, which its pairwise rule leaves with half an
  hour nobody may clock in on; it is one HTML file that simulates every rule, and its
  punch lock is two sentences of text. 1,295 tests.
- **Decided:** by the owner on 2026-11-15, the rows of that date: a shift authorizes a
  clock-in under an enforcement switch that is off by default; exactly one eligible shift
  at every scheduled moment; 15 minutes early; the lock by a punch; the override history;
  a start captured offline stored for review; Copy Last Week; the words Schedule, Shift
  and Jobsite. Left to each line's plan and not decided: how eligibility is computed, the
  tables, the history's store, the locks, where the switch lives, how the server tells a
  start the schedule changed under from any other unscheduled one, and the interaction of
  the drawer overlay and of employee navigation on a phone. Not done: nothing is built, so
  `/assignments`, push and the built tests are as they were; 28 of the prototype's 49
  screenshots were not looked at; staging's `job_assignments` rows were not counted; the
  branch is not pushed. Worth knowing: there is still no `apps/mobile`, so S7 and S8 wait
  on R4 and R5; the V1-D07 line stays ticked and S3 and S4 name what they retire of it;
  whether Release 0.1's go/no-go requires enforcement on is not said anywhere.
- **Next:** owner reviews the branch; then track line S1, the eligibility rules as a pure
  module, plan first.

### 2026-11-15 — Schedule eligibility rules as a pure module (S1)

- **Did:** after the owner merged #98, `staging-preview` was moved to `8ca877d` by the
  ordinary push (read: both remote branches at that commit; by the owner's report, its
  Preview built and the suite green). Branch `s1-schedule-eligibility` from `8ca877d`, four
  commits. `assignments/eligibility.ts`, pure: `resolveDay` (one person's shifts and
  overrides on a day, to the one eligible shift at every covered minute or the issues that
  refuse it) and `admitStart` (scheduled, early within 15 minutes, or none). Tests with no
  database: every order of two and of three overlapping shifts, the boundary minutes,
  touching shifts, each refusal, and every accepted day held to one eligible shift at every
  minute — over every day of up to three shifts on six cuts, every fully decided day of
  four, and 400 generated days from fixed seeds, each also checked against the rules
  written a second way. Watched red: the overlap test, the excluded end, the missing
  decision, the conflict, the winner, the starved shift, the circle, the issue order, each
  structural check, 15 against 16, scheduled before early. No migration, no procedure, no
  dependency. 1,341 tests.
- **Decided:** by the owner on 2026-11-15 (the plan approved, its six recommendations): no
  property-testing library; a leftover override refused; every issue of the failing stage
  answered; seconds dropped by the caller; the file's name; the decision row of that date.
  Changed from the plan, found by the exhaustive test: the plan held that a circle always
  leaves time uncovered, and it does not — a fourth shift can hold all the time the three
  share. A circle is refused there too, so it is a check of its own before the stretches,
  and `circular_precedence` names three shifts and the time they share, not an uncovered
  stretch. Issues of one kind are ordered by time, then ids. Not done: nothing consumes the
  module; no zone conversion, switch, lock or procedure (S3, S4); the branch is not pushed.
  For the owner: the masked circle could instead be admitted, since every minute has one
  eligible shift — say so before S3 if that is the rule wanted; the prototype's own
  three-shift fixture was not read, so the half-hour test uses times of its own; local
  branches of merged work and a stale `origin/a03-schedule-documents` ref remain.
- **Next:** owner reviews the branch; then track line S2, the schedule schema, plan first.

### 2026-11-15 — Release 0.1 mandate: one plan for the track, written into the documents

- **Did:** an audit at `1c94b64` (`main`, `staging-preview` and staging's Preview all at
  it, CI green; staging's database at 40 migrations with no `job_assignments` row; no
  `apps/mobile`, no contract export, no invoice procedure, no payments table, no rate
  limit; `eas whoami` not signed in; the schedule prototype's file not on this Mac). Then
  branch `r01-mandate`, documents only: seven decision rows of 2026-11-15, PRD, DESIGN,
  RULES, `CLAUDE.md`, and five new track lines in TASKS. No code. 1,341 tests.
- **Decided:** by the owner on 2026-11-15 (the mandate and four answers), the rows of that
  date: the track worked without per-line approval; the payroll CSV and a plain invoice
  CSV in the release; an Overview and a Developer console with no new role; the
  navigation's names; enforcement on staging by a session after its gates; the
  `release-0.1` integration branch; one public staging host for the phones if the plan
  allows it at no cost. Order agreed: S2, S3, S4, S5, S6 with A01, payroll CSV and D01,
  R6 and R7, the edge line and the public host, R4, R5 with S7 and S8, staging
  enforcement and the integrated run, the device builds. Not done: everything after the
  documents. The owner's, each asked for at its step: `eas login` and the Expo project
  (R4), Resend's domain, key and one test recipient (R7), Clerk's native API on the
  development instance (R5), Apple sign-in and device registration for an ad hoc build.
- **Release 0.1 state** (kept current in the newest entry; a new session resumes here):
  branch `r01-mandate` from `1c94b64`; `release-0.1` not yet made; staging's Preview is
  `staging-preview`'s at `1c94b64`; last green: `pnpm check` on this branch; blockers:
  none; risks: the schedule screen is built from DESIGN's text, not the prototype; the
  public host's exemption, Clerk SMS to a real number on the development instance,
  Maestro offline on iOS and ad hoc provisioning are each unverified until their step.
- **Next:** S2, the schedule schema, on a branch from this one.

### 2026-11-15 — Schedule schema (S2)

- **Did:** branch `s2-schedule-schema` from `r01-mandate`. `0040`, `0041`: the exact-shift
  key, the punch lock and its guards, `copy_id`, `shift_overrides`,
  `shift_override_history`, `companies.schedule_enforced` under a column grant.
  `assignment.create` and `update` name the new key; three API tests restated under it.
  Watched red, each by removing it in the local database and restoring it with the
  migration's own statement: the exact-shift key, the mutation, insert and truncate
  triggers, the lock pair check, the override trigger, pair key, both checks and its
  foreign key, the history's three append-only triggers and two checks, both policies, the
  switch's grant and the history's. Counted first: staging holds no `job_assignments` row.
- **Decided:** in this line's plan, as the 2026-11-15 autonomous-execution row allows; the
  as-built row of that date in ARCHITECTURE: a history table of its own; the switch as a
  per-company column only the owner writes; the lock as two columns on the shift. Not
  done, and S3's and S4's: overlap, override need and "what authorized a start" are judged
  by no database guard; no writer takes an override or writes history yet; nothing sets a
  lock. Worth knowing: until S3 an office create of one job twice in a day at other times
  succeeds, overlapping or not.
- **Release 0.1 state:** branches `r01-mandate` (#100) and `s2-schedule-schema`, stacked;
  staging's database still at 40 migrations and its Preview at `1c94b64`; `release-0.1`
  is made from this branch next, then staging is migrated to 42. Blockers: none.
- **Next:** S3, the validated shift writers and the week read.

### 2026-11-15 — Validated shift writers and the week read (S3)

- **Did:** branch `s3-shift-writers` from `s2-schedule-schema`. `assignments/day.ts`: the
  person-day lock, the day's load, `judgeDay`, the history writer, the issues on the wire.
  `write.ts` rewritten: `assignment.create` with the browser's ids and a decision per
  overlap, answered day by day; `update`, `remove`; `assignment.decide`; each override
  write with its history entry. `assignment.week`, Monday to Sunday, with each shift's
  eligible hours, its lock and the week's overrides. Gate lines for both new procedures.
  The demo's plan step and the old `/assignments` screen moved to the new shapes. Watched
  red, by mutation: the authorization check, the schedule check, the day lock, the history
  write, both locked answers, the resend answer, the override dropped with its overlap,
  the holder inside the pair, the Monday rule, the week's eligible hours, a taken override
  id. 1,376 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. What is
  compared for "what authorized that start": after any write to a day, a start at the
  minute each locked shift's clock-in was recorded must still be admitted on that same
  shift. An override is never removed alone, only with its overlap. No `audit_log` row:
  the history table is the record. Not done: nothing sets a lock yet (S4), so the locked
  and authorization answers are reached only by fixtures; no copy (S5); the old screen
  shows a refusal in one sentence and offers no decision (S6 replaces it); the old screen
  was not opened in a browser after the change. Worth knowing: `assignment.list` and
  `mine` are unchanged; a day written before these writers that does not resolve reads
  `eligible: null` in the week and refuses every further write to that day until its
  overlap is decided.
- **Release 0.1 state:** branches `r01-mandate` (#100), `s2-schedule-schema` (#101),
  `s3-shift-writers`, stacked; `release-0.1` moves to this branch next and gets its first
  Preview; staging's database then goes from 40 to 42 migrations. Blockers: none.
- **Next:** S4, clock-in eligibility and the punch lock behind the switch.

### 2026-11-15 — Clock-in eligibility and the punch lock, behind the switch (S4)

- **Did:** branch `s4-clock-in-eligibility` from `s3-shift-writers`. `0042`: the approval
  reason `unscheduled`. `sync/schedule.ts`: the switch read, `judgeStart` under the
  person's day lock, the lock write. `sync.push`: with the switch on, a `started` judged
  by the schedule after validation, the shift locked in the event's transaction, an
  offline start the schedule does not admit stored pending with `unscheduled`, an online
  one refused `not_scheduled`. `sync.pull` answers `scheduleEnforced`. Seen on real
  commits: with the switch off a push completes while `job_assignments` is locked against
  every reader; an edit committed first leaves the start stored for review; a start
  committed first leaves the edit `locked`. Watched red, by mutation: fourteen rules
  (enforcement, crew not required, the archived job, the admin's exemption, the stored
  start, the admin worker, the lock, the lock once, the shift's job, the day lock, the
  schedule unread when off, the pull flag, the reason, the refusal's name). 1,395 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. The
  server tells the two cases apart by the record's own `captured_offline`: an offline
  start the schedule does not admit is stored for review whatever changed, and one
  captured with a connection is refused. The reason is `unscheduled`, the refusal
  `not_scheduled`. An unscheduled offline start for an admin worker is refused, since an
  admin's labor takes no approval to wait on. An archived job refuses a start under
  enforcement as without it. Not done: `assignment.list`'s `mayClockIn` still answers by
  crew under enforcement (S6 decides what the screen says); a lock stays when the admin
  later rejects the start that set it; the new tag was not seen in a browser; the phone
  (S7). The switch is off everywhere.
- **Release 0.1 state:** branches `r01-mandate` (#100), `s2-schedule-schema` (#101),
  `s3-shift-writers` (#102), `s4-clock-in-eligibility`, stacked, CI green on the first
  three; `release-0.1` has a Preview on the staging project with its own authorized
  origin, the browser suite green on it; **staging's database is still at 40 migrations**
  — the owner-role wrapper has no migrate command, and a version that adds one waits for
  the owner to install it; until then the schedule endpoints fail on that Preview.
- **Next:** S5, Copy Last Week.

### 2026-11-15 — Copy Last Week (S5)

- **Did:** branch `s5-copy-last-week` from `s4-clock-in-eligibility`. `assignments/copy.ts`:
  `assignment.copyPreview`, `copyConfirm`, `copyUndo`, with their gate lines; `day.ts`
  gained a loader for a range of days and one lock order for several people's days. No
  migration: the mark is S2's `copy_id`. Seen on real commits: two admins confirming one
  preview leave one copy and the other is answered the plan as it now stands; one
  confirmation sent twice at once is `copied` and `duplicate`; a statement made to fail on
  its third row writes nothing. Watched red, by mutation: the fingerprint compared and
  what it covers, the resend answer, the day locks, each reason for leaving a shift out,
  the copy's mark, the day carried from one copied shift to the next, undo's lock refusal
  and its history. 1,410 tests; the first full run was red once on the `updated_at`
  flake of `materials/cost.test.ts` (Notes), green on the rerun. Then red on CI: a deadlock
  in the db suite between S2's new foreign key and an older TRUNCATE test (Notes), which
  S2's own CI runs had not hit; fixed here in a commit of its own.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. The
  source is the week before the one named. A shift is left out for a deactivated person,
  an archived job, the same shift already there, an overlap, or a clock-in's leave it
  would take; of two that overlapped last week the earlier is copied. The fingerprint
  covers what is created and what is left out with its reason. A copy is known by the
  browser's id for it. Undo removes shifts edited since the copy too, with the history of
  any decision made on them. Not done: no screen (S6); undo's `stale` answer has no test;
  a copy of a week of about thirty people was not timed.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `s4-clock-in-eligibility`
  (#103) and this one, stacked, CI green on the first four; `release-0.1` moves here
  next. **Staging's database is still at 40 migrations** and waits for the owner to
  install the wrapper's migrate command; the journal is now 43.
- **Next:** S6, the Weekly Schedule screen, with A01's navigation.

### 2026-11-15 — Weekly Schedule screen (S6): built and checked in the browser; not ticked

- **Did:** branch `s6-weekly-schedule-screen` from `s5-copy-last-week`. `/schedule` under
  the name "Schedule", `/assignments` redirecting to it and the old screen removed:
  `schedule-view.ts` (pure, 12 tests), the grid, the drawer, the shift forms with overlap
  decisions and the day shown before a save, the Copy Last Week dialog with undo.
  `assignment.week` also answers the company's zone, each shift's copy, and who decided
  each override and when; `@trader/api/eligibility` exported for the browser. Checked in
  the browser on `trader_demo` at 390, 768, 1024 and 1280: a shift added from a cell; an
  overlap blocked with its hours, overridden with a reason, the day previewed, saved, and
  its card reading "Clock in 15:30–17:00"; the decision read back with who and when, then
  turned round; a third shift whose two choices close a circle refused in words with the
  save disabled; Escape closing the drawer and focus returning to the button that opened
  it; a locked shift read-only with its link to Labor; next week copied (20 created, 2
  left out with their reasons), copied again (nothing to create), undone (20 removed);
  by jobsite with its people counted; one day at a time and one employee when narrow; no
  sideways scroll with a drawer open or closed; no control under 48 pt narrow or 44 wide;
  the day headings held at the top on scroll when wide; no console error. 1,422 tests.
- **Decided:** in this line's plan, the DESIGN amendment (Weekly Schedule, as built): the
  drawer is a native modal dialog; narrow is one day from seven day buttons, with an
  employee filter at every width. **Not ticked**, and why: its done-criterion asks for one
  pass with a screen reader and about 24 people, and neither was done — the demo has nine
  people and no screen reader was run. Also not done: the prototype's fourth revision was
  not at hand, so the screen follows DESIGN's rows and is not reconciled with it; no
  browser test in CI; no Spanish office strings; `mayClockIn` and `blockedBy` are not
  shown (they answer by crew, which enforcement retires); a shift moves only within the
  week on screen; the write refusals `stale` and `authorization` were not seen in the
  browser, only in tests.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `s5-copy-last-week` (#104) and
  this one, stacked, CI green on the first five; `release-0.1` moves here next.
  **Staging's database is still at 40 migrations** — the journal is 43 — and waits for
  the owner to install the wrapper's migrate command; the schedule screen will fail on
  that Preview until then.
- **Next:** A01, the navigation's groups and the Overview; then the payroll CSV and D01.

### 2026-11-15 — Overview and the office navigation (A01)

- **Did:** branch `a01-overview-navigation` from `s6-weekly-schedule-screen`.
  `overview.get`, admin-gated, with its gate line: approvals waiting, sessions with no
  clock-out, refused entries inside their 30 days, shifts in the company's week.
  `/overview`, which `/` now opens; the navigation regrouped to Overview, Jobsites,
  Schedule, Labor, Employees, routes unchanged. Checked in the browser on `trader_demo`
  at 1280 and 390: `/` opening the Overview with 13 to approve and 20 shifts, the demo's
  own figures, each line a link 72 pt or taller, the groups as named, no sideways scroll.
  Watched red, by mutation: pending only, the retention, both ends of the week, the
  Monday, the open-session figure. 1,424 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. One
  read, not four: the queue is paged and the refused-entry read asks for a person and a
  day, so neither can be counted from the browser. "Sessions with no clock-out" is the
  labor derivation's own figure, which leaves a session still waiting for approval among
  the approvals. Not done: Invoices and Developer are not in the navigation until their
  screens exist; invoices still owed is not counted until R6; not checked at 768 or 1024.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `s6-weekly-schedule-screen`
  (#105) and this one, stacked, CI green on the first six; **staging's database is still
  at 40 migrations** of 43 and waits for the owner to install the wrapper's migrate
  command. S6 is built and not ticked: a screen-reader pass and about 24 people are owed.
- **Next:** the payroll-hours CSV, then D01.

### 2026-11-15 — Payroll-hours CSV

- **Did:** branch `payroll-hours-csv` from `a01-overview-navigation`. `payPeriod.export`,
  admin-gated, with its gate line; `core/csv.ts`; the button in a closed period's details.
  The file is `payPeriod.read`'s figures for a closed period: a header, one row for each
  employee, job and work date of the period's own hours, then one for each adjustment with
  its original date and its sign; ids beside the names. Tests: the file inside the
  existing byte-identity test, so a later approval, correction, repair and rate leave it
  the same bytes; its totals equal the read's for two closed periods; an open period is
  `not_closed`; the text itself (quoting, a name that looks like a formula, signed hours).
  Seen in the browser on `trader_demo`: the closed week's file saved, 34 rows and 272.00
  hours, the screen's own figures; the open week offers no file. Watched red, by
  mutation: the open period's refusal, the adjustment rows, the formula guard, the
  quoting. 1,430 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE: the
  columns; hours as decimals with two places; a typed cell that begins like a formula is
  led by an apostrophe; no file for an open period; the button in the period's details
  until the export screen exists (DESIGN, Export panel). Not done: no pay, rate or
  overtime column, by rule; not opened in a spreadsheet or a payroll product; checked at
  1280 only.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `a01-overview-navigation`
  (#106) and this one, stacked, CI green on the first seven; **staging's database is
  still at 40 migrations** of 43, waiting for the owner to install the wrapper's migrate
  command. S6 built and not ticked (screen reader, about 24 people).
- **Next:** D01, the developer console; then R6, invoices.

### 2026-11-15 — Developer console (D01)

- **Did:** branch `d01-developer-console` from `payroll-hours-csv`. `developer.get`,
  admin-gated, with its gate line; `configuredStatus` beside `serviceStatus`;
  `/developer`, last in the navigation: commit, environment, the readiness check's
  status, field sync, minimum builds, protocol, schedule enforcement, the database role,
  refused entries in 30 days and in 24 hours, and the twenty newest lines. Seen in the
  browser on `trader_demo` at 1280 and 390: the eleven facts, readiness Ready, the role
  `trader_app`, no control on the page, no sideways scroll. 1,433 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. The
  commit and environment are read by the server page from the platform's own variables,
  which are not secrets; readiness is the public check's status and nothing of its body;
  no migration count, since the application role cannot read the migrator's journal. Not
  done: no write of any kind, by rule — the sync mode, the minimum builds and the
  enforcement switch are still changed where they live; nothing with a refused entry was
  seen in the browser (the demo has none); not checked at 768 or 1024.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `payroll-hours-csv` (#107) and
  this one, stacked, CI green on all eight; **staging's database is still at 40
  migrations** of 43, waiting for the owner to install the wrapper's migrate command.
  S6 built and not ticked (screen reader, about 24 people). Done of the plan: steps 0 to 6. Open: R6 and R7 (invoices, payments, PDF, email, invoice CSV), the edge line and the
  public staging host, R4, R5 with S7 and S8, enforcement on staging, the device builds.
- **Next:** R6, invoices: drafting and issue.

### 2026-11-15 — Invoices: draft, issue, void (R6)

- **Did:** branch `r6-invoices` from `d01-developer-console`. `0043`: the issue transition
  changes nothing but the issue and is never also a void. `invoices/`: `invoice.create`,
  `save`, `remove`, `suggest`, `issue`, `void`, `list`, `read`, admin-gated, with their
  gate lines. `/invoices` and `/invoices/<id>`, Invoices in the navigation. Seen on real
  commits: fifty drafts issued at once take 1042 to 1091, none twice and none skipped;
  one invoice issued five times at once takes one number. Seen in the browser on
  `trader_demo` at 1280: a draft started for a jobsite, a labor day drawn as a line with
  its hours and no price, the save refused until a price is typed, amounts and totals as
  typed, saved, issued as Invoice 1 after its question, no field left, voided, the list;
  no sideways scroll at 390 or 768. Watched red: the 0043 guard, by restoring 0010's
  function; eleven rules by mutation. 1,454 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. A
  draft's lines are replaced whole by each save; a line's amount is quantity times price,
  half-up to the cent, in integers, as the database's check computes it; a suggestion is
  words and a quantity and never a price; labor is offered one line a work date, every
  worker's approved hours together; an issue sent again answers its number; a void gives
  no number back; no audit row. Not done: payments, the PDF, email and the CSV (R7);
  credit memos (Stage 7); the currency is USD on the screen, though the API takes any;
  no browser test in CI; no Spanish office strings; the screens were not checked at 1024
  and their controls were not measured.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `d01-developer-console` (#108)
  and this one, stacked; **staging's database is still at 40 migrations** of 44, waiting
  for the owner to install the wrapper's migrate command. S6 built and not ticked. Done
  of the plan: steps 0 to 6 and R6. Open: R7, the edge line and the public staging host,
  R4, R5 with S7 and S8, enforcement on staging, the device builds.
- **Next:** R7, payments, the PDF, email and the invoice CSV (needs the owner's Resend
  domain and key, and one approved test recipient).

### 2026-11-15 — Payments, what is owed and the invoice CSV (R7, first half)

- **Did:** branch `r7-payments-csv` from `r6-invoices`. `0044`, `0045`: `invoice_payments`,
  append-only, with its guards. `invoice.recordPayment`, `reversePayment`, `exportCsv`
  with their gate lines; the reads answer `paidCents`, `owedCents` and the payments; a
  void is refused while a payment stands; `overview.get` counts invoices still owed.
  `core/pg-error.ts`. The invoice screens: payments, owed, the CSV button. Seen in the
  browser on `trader_demo` at 1280: an overpayment refused in words, a part payment, a
  void refused while it stands, paid in full with the form gone, a reversal leaving both
  rows and the amount owed again, the list's Owed column, the file saved, the Overview's
  count; no sideways scroll at 390. Watched red: every 0045 guard in the database; ten
  rules by mutation. 1,472 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. No
  overpayment: the payments that stand never total more than the invoice. A payment is
  never edited or removed; a second row reverses it and neither counts. An invoice with a
  standing payment is not voided. The CSV's columns. **Found and fixed, beyond this
  line:** a database refusal recognised by `instanceof` was a 500 through the web route
  (Notes) — the overpayment here, the missing number series of R6 (#109), and the
  first-sign-in bind conflict in `resolve-user.ts`, which is identity code and was changed
  only in how it reads the same error. Not done: the PDF and its email, which need the
  owner's Resend domain, key and one approved test recipient; credit memos; a payment's
  date is not checked against the issue date; not checked at 768 or 1024.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r6-invoices` (#109) and this
  one, stacked; **staging's database is still at 40 migrations** of 46, waiting for the
  owner to install the wrapper's migrate command. S6 built and not ticked; R7 half built.
  Open after this: the PDF and email, the edge line and the public staging host, R4, R5
  with S7 and S8, enforcement on staging, the device builds.
- **Next:** the edge line (rate limits, body limit, `Origin` check), which needs nothing
  from the owner; then R4.

### 2026-11-15 — Edge protection for a public host

- **Did:** branch `edge-protection` from `r7-payments-csv`. `0046`, `0047`:
  `rate_limit_windows`, a hash and a count, not tenant data. `core/rate-limit.ts`: a
  fixed window counted in one statement on the database's clock. `server/edge.ts` in
  front of the route: a body over one mebibyte 413, of unstated length 411; a
  state-changing request from another site's `Origin` 403; 600 requests a minute an
  address, 300 a signed-in identity, each 429 with `Retry-After`; a limiter that fails
  refuses nobody and is reported. Read on Vercel's pages that day: `x-forwarded-for` is
  the client's address and is overwritten by the platform; Deployment Protection
  Exceptions and WAF rate limiting are on every plan, the first a dashboard action with a
  typed confirmation. Seen on `next dev`: a foreign-origin POST 403, an oversized one 413,
  a shift added and removed from the browser. Watched red, by mutation: twelve rules.
  The first full check was red on 29 web tests whose hand-built POSTs stated no length
  (Notes); 1,486 tests after.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE: the
  limit lives in the application and Postgres, not in the platform's firewall, so it is in
  the repository and tested; the key is hashed; nothing is counted by address where the
  platform set none; the limiter fails open. Not done: the limits were not seen on a
  deployment (the public host is next, and needs the owner); no limit on the pages
  themselves, only on the API route; the per-region caveat does not apply since one
  database counts; session-cookie attributes are Clerk's and were not examined.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r7-payments-csv` (#110) and
  this one, stacked, CI green on the first eleven; **staging's database is still at 40
  migrations** of 48. Owner actions open, each blocking only its own step: install the
  wrapper's migrate command (every staging check); add the `release-0.1` alias under
  Deployment Protection Exceptions (the phones); Resend's domain, key and one test
  recipient (the PDF's email); `eas login` (device builds). S6 built and not ticked; R7
  half built.
- **Next:** R4, the field app skeleton.

### 2026-11-15 — Field app skeleton (R4)

- **Did:** branch `r4-field-app-skeleton` from `edge-protection`. `@trader/api/contract`
  (zod alone, pinned to the schema's enums and held pure by tests), the development
  headers' names moved into it, and a lint rule on `apps/mobile`. The Expo app
  `app.jpteq.trader`: SDK 58 with a development client, the theme, the brand icons, two
  typed catalogs, the development sign-in, Today with the caller's jobs from `sync.pull`,
  Settings with the name and the language. Built and run as a development build on
  iPhone 17 Pro (iOS 26.2) and on `Medium_Phone_API_36.1`: the smoke flow signs in as the
  demo foreman, reads the job list, opens Settings, switches to Spanish and returns, every
  step by `testID`, green on both; red at `job-list` with the API stopped. `pnpm check`,
  `pnpm build` and a frozen install green with the app in the workspace. 1,496 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. The
  TASKS line now names the packages as installed: `expo-splash-screen` and `vitest` added,
  gesture-handler, reanimated and a `zod` of the app's own not taken. Not done: no
  `eas.json` and no release or preview build, so the development sign-in being off outside
  a development bundle is `__DEV__`'s word, unseen; Clerk, the device store, the outbox
  and the clock (R5); the language choice does not outlast the app's run; layouts were
  not measured with the Spanish strings; CI does not run the flow, only the app's
  typecheck, lint and five tests. Watched red: the flow with the API stopped; the lint
  rule on a value import of `@trader/api` and on `@trader/db`. Stage 5's Expo, development sign-in and i18n lines are left unticked for those
  reasons; its contract line is ticked.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `edge-protection` (#111) and this
  one, stacked, CI green on all twelve before it; `release-0.1` moves here next.
  **Staging's database is still at 40 migrations** of 48: nothing since S2 has been seen
  on staging. Owner actions open, each blocking only its own step: install the wrapper's
  migrate command; the `release-0.1` alias under Deployment Protection Exceptions;
  Resend's domain, key and one test recipient; Clerk's native API on the development
  instance (R5); `eas login` (device builds). S6 built and not ticked; R7 half built.
- **Next:** R5, the field app's sign-in, store, outbox and clock, with S7 and S8.

### 2026-11-15 — The phone's clock, outbox and schedule (R5 without its sign-in, S7, S8's screen)

- **Did:** branch `r5-field-time-tracking` from `r4-field-app-skeleton`. `sync.pull` answers
  the caller's own shifts and eligible hours. In `apps/mobile`: the device store (Drizzle
  on expo-sqlite), the sync cycle, the clock's rules, a UUIDv7 minter, the location stamp;
  Today (clock in, break, switch, clock out; under the schedule the eligible shift alone
  or "ask the office"), Schedule (own shifts, how old the pull is, own hours), Settings;
  the session and the language kept across launches; English and Spanish. Thirty-eight
  unit tests of the cycle, the clock and the minter with a stand-in server that loses a
  response, stops part-way, refuses a record and changes state. The flow suite
  (`.maestro/suite.sh`), green on iPhone 17 Pro (iOS 26.2) and on `Medium_Phone_API_36.1`,
  each write read back from the server's tables: six events of a clock-in, switch, break
  and clock-out, once each and in order, with a location; two captured with the API
  stopped, the app closed and reopened between them, delivered once and not again on a
  second send; a refused location permission sending none; under enforcement a start
  locking its shift, a second person offered nothing and shown nobody's shifts, a start
  refused `not_scheduled` with its line for the office, and a start captured after 135
  seconds offline on a shift the office had removed, stored pending as `unscheduled` and
  said so on the phone. Watched red: four mutations of the pull, twenty-five of the
  cycle, the clock and the minter.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE: two
  minutes for the reachability reading and for a location in hand; 60 seconds between
  cycles; high accuracy; breaks kept in; the shift window of the pull. Found by the
  flows, not by a test: a tap that read the snapshot before the outbox could capture
  nothing mid-cycle (Notes); balanced accuracy gives no location on the emulator. Not
  done: **R5 is not ticked** — no SMS-code sign-in on the phone (`@clerk/expo` not
  installed; the owner's native-API switch and publishable key first), no own profile,
  no physical phone; **S8 is not ticked** for the same phones. Also not done: no
  biometric attestation; the device store's own SQL has no unit test, only the flows; no
  flow for `paused`, `read_only`, `update_required`, a wrong clock or a foreman's crew;
  hours worked offline are not added to "worked today" until they are pulled back; the
  iOS permission sentence is English only; layouts were not measured in Spanish; no
  screen-reader pass; pull's job coordinates, customer name and reasons (Stage 5, pull
  extension) are not built; `eas.json` and the preview builds.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r4-field-app-skeleton` (#112)
  and this one, stacked, CI green on all thirteen before it; `release-0.1` moves here
  next. **Staging's database is still at 40 migrations** of 48: nothing since S2 has
  been seen on staging. Owner actions open, each blocking only its own step: install the
  wrapper's migrate command (every staging check); Clerk's native API on the development
  instance and its publishable key as an EAS variable (the phone's sign-in); `eas login`
  (device builds); the `release-0.1` alias under Deployment Protection Exceptions (the
  phones); Resend's domain, key and one test recipient (the invoice email). S6 built and
  not ticked; R7 half built; R5 and S8 as above.
- **Next:** the phone's SMS-code sign-in behind the session seam, as far as it can be
  built before the owner's two Clerk items; then `eas.json` and the preview profile.

### 2026-11-15 — The phone's SMS-code sign-in: written, typechecked, never run against Clerk

- **Did:** branch `r5-phone-sign-in` from `r5-field-time-tracking`. `@clerk/expo` 4.16.1
  and `react-dom` in `apps/mobile`; the provider around the app when a build carries its
  key; a phone sign-in screen (number, code, then `me.get`); the provider's token as a
  bearer header on every call; sign-out of both; the number parser with tests; both
  catalogs. Seen: typecheck against Clerk's own types; 40 unit tests; with the package in
  the bundle and no key set, the whole flow suite green on the iOS simulator through the
  development identity, and on the Android emulator a sign-in and a first sync.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE. Not
  done, and the reason R5 stays unticked: **nobody has signed in through Clerk on a
  phone.** Unseen: Clerk's hooks behaving as its page says; a code arriving; the server's
  adapter accepting a phone's bearer token (its `CLERK_AUTHORIZED_PARTIES` check and the
  four session claims on a native session); the session surviving a restart with no
  network; a sign-out offline. No flow can cover it until a development build carries the
  key. The Android suite was not rerun whole on this branch.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r5-field-time-tracking` (#113)
  and this one, stacked; `release-0.1` moves here next. **Staging's database is still at
  40 migrations** of 48. Owner actions open, each blocking only its own step: install the
  wrapper's migrate command (every staging check); Clerk's native API on the development
  instance and its publishable key given to the build (the phone's sign-in); `eas login`
  (device builds); the `release-0.1` alias under Deployment Protection Exceptions (the
  phones); Resend's domain, key and one test recipient (the invoice email). S6 built and
  not ticked; R7 half built; R5 and S8 open on the sign-in and the physical phones.
- **Next:** with the owner's Clerk items, the sign-in end to end on both devices; with
  `eas login`, `eas.json` and the preview builds; with the wrapper, staging migrated and
  the browser suite. Without any of them: the invoice PDF behind a mailer seam.

### 2026-11-15 — Invoice PDF on demand (R7, the PDF)

- **Did:** branch `r7-invoice-pdf-email` from `r5-phone-sign-in`. `pdf-lib` 1.17.1 in
  `packages/api`; `invoices/pdf.ts` (a pure renderer and `invoice.pdf`, admin-gated, with
  its gate line); "Save as PDF" on an issued or void invoice's page. Seen in the browser
  on `trader_demo` at 1280 and 390: an invoice issued, the button pressed, `invoice-1.pdf`
  saved, the note shown, no sideways scroll, the button 48 pt; the file opened as an image
  and read. Found by looking, not by a test: a long description ran into the quantity,
  and quantities showed `8.000`; both fixed and pinned. Watched red: eleven mutations of
  the renderer, two of them only after their tests were made stronger (Notes). `pnpm demo
--reset` after the check.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE: made
  on demand and never stored; the invoice's own stored figures; dated with the issue;
  the customer's details as they stand now; `?` for what the font cannot draw. Not done:
  **the email and `invoice_sends`**, so R7 stays unticked — the Resend adapter needs the
  owner's domain, key and one approved recipient to be seen sending, and the table is a
  migration of its own; no logo on the page; English only; not opened in Acrobat or a
  printer's preview; not checked at 768 or 1024; payments are not listed on the page,
  only their total.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r5-phone-sign-in` (#114) and
  this one, stacked; `release-0.1` moves here next. **Staging's database is still at 40
  migrations** of 48. Owner actions open, each blocking only its own step: install the
  wrapper's migrate command (every staging check); Clerk's native API on the development
  instance and its publishable key given to the build (the phone's sign-in); `eas login`
  (device builds); the `release-0.1` alias under Deployment Protection Exceptions (the
  phones); Resend's domain, key and one test recipient (the invoice email). S6 built and
  not ticked; R7 open on the email; R5 and S8 open on the sign-in and the physical phones.
- **Next:** the invoice email behind a mailer seam with its recorded sends and the
  staging allow-list; then whichever owner item arrives first.

### 2026-11-15 — Invoice email and recorded sends (R7): built, no message seen arriving

- **Did:** branch `r7-invoice-email` from `r7-invoice-pdf-email`. `0048`, `0049`:
  `invoice_sends` with its guards. `core/mailer.ts`, the mailer in the context;
  `invoice.send` with its gate line; `invoice.read` answers the sends and the customer's
  address; the Resend adapter, its three variables and the deployment check in `apps/web`;
  the email section on the invoice page. Seen in the browser on `trader_demo` at 1280 and
  390 with no mail service set: no section on a draft, the customer's address offered, a
  non-address stopped by the browser, a send failing closed in words and listed as not
  sent, a second attempt listed too, no form on a void invoice with its history kept, no
  sideways scroll, the button 48 pt wide and 56 narrow. Watched red: all thirteen guards of
  the table, each removed in the local database and restored; fifteen mutations of
  `invoice.send` and the seam; eleven of the adapter and its environment rules.
  `pnpm demo --reset` after the check.
- **Decided:** in this line's plan; the as-built row of 2026-11-15 in ARCHITECTURE: a
  fourth seam; no mail package; the allow-list as the whole of who may be sent to outside
  production; the row lock held across the send; failures as codes. Not done, and why R7
  stays unticked: **no message has left this system.** Resend's request is written from
  its page and tested against a stand-in; unseen are the key accepted, the sender's
  domain verified, the PDF opening from a real inbox, and the idempotency key honoured.
  Also not done: the email's words are English and plain; no reply-to; no bounce or
  delivery state after acceptance; a `duplicate` of a failed send says only that it
  failed; staging has neither the migration nor the variables.
- **Release 0.1 state:** branches `r01-mandate` (#100) to `r7-invoice-pdf-email` (#115)
  and this one, stacked; `release-0.1` moves here next. **Staging's database is still at
  40 migrations** of 50. Owner actions open, each blocking only its own step: install the
  wrapper's migrate command (every staging check); Clerk's native API on the development
  instance and its publishable key given to the build (the phone's sign-in); `eas login`
  (device builds); the `release-0.1` alias under Deployment Protection Exceptions (the
  phones); Resend's domain, key, sender and one approved recipient as staging variables
  (one send seen). S6 built and not ticked; R7 open on that one send; R5 and S8 open on
  the sign-in and the physical phones.
- **Next:** every remaining line of the track now starts with an owner action above.
  Without one: S6's screen-reader pass cannot be done by a session; the 24-person check of
  the schedule can, on a larger demo.

## 2026-11-16

### 2026-11-16 — Staging sign-in read; the phone's Clerk sign-in seen, two faults fixed

- **Did:** read-only, staging as it stands: the owner's custom staging host is attached to
  `staging-preview` and answers with no bypass (`/api/ready` 200, a call with no session
  401, `/dev-signin` 404); it serves `1c94b64`, 49 commits behind `main` (`3abacb2`, #100
  to #116 merged), on a database at 40 migrations of 50. One company, `R3 Staging Co`; an
  admin and a worker, each a fictional Clerk test number, each bound to its Clerk user;
  one fixture customer; no email on either. The branch's `CLERK_AUTHORIZED_PARTIES` was
  last written on 2026-11-14, before the host existed. Clerk's native API is on, with the
  iOS and Android applications registered; `eas whoami` answers and the Expo project
  exists (its id is uncommitted in `apps/mobile/app.json`), with no variable, no build and
  no Apple team. Then branch `r5-phone-token` from `3abacb2`, two commits: on the iOS
  simulator against a throwaway demo database, a sign-in by code through Clerk, the bind,
  `me.get` and `sync.pull` 200 — and 401 once the API's origin list was set, and a false
  "sign in again" on a relaunch. Both fixed (the decision row of this date; `token.ts`),
  each rule watched red, then seen: three relaunches and a clock-in and clock-out stored
  with the list set. 1,575 tests.
- **Decided:** in this line's plan, the row of 2026-11-16 in ARCHITECTURE. Not done:
  nothing on staging was changed. Not seen: the fix on a deployment, Android, a browser
  session under the new proxy (tests only; the staging suite covers it once deployed), a
  sign-out, a relaunch offline, a location on the Clerk run. R5 stays unticked.
- **Release 0.1 state:** `main` at `3abacb2`; this branch's pull request open. To make the
  staging host usable, in order: the database migrated 40 to 50 (the owner-role wrapper
  still has no migrate command); the custom host's origin added to `staging-preview`'s
  `CLERK_AUTHORIZED_PARTIES`; `staging-preview` fast-forwarded and the browser suite run.
  For the phones after that: jobs, a crew and a foreman on staging's roster; the device
  builds' line in TASKS with `eas.json`, the API's address and the publishable key as EAS
  variables; an Apple team on the Expo account and the test iPhone registered.
- **Next:** owner merges this branch and migrates staging; then the three staging steps
  above, and the device builds' line, plan first in its pull request.

### 2026-11-16 — Permanent automation planned; decisions written, P0 done

- **Did:** read, then documents and one staging variable; branch `automation-foundation`
  from `r5-phone-token` (#117, still open), two commits. Read on 2026-11-16: `main` at
  `3abacb2`, `staging-preview` 49 commits behind at `1c94b64`; staging's database and the
  kept rehearsal branch both at 40 migrations of 50, with no labor event and no receipt;
  the staging host attached to `staging-preview`, exempt from the wall, readiness 200;
  GitHub with no secret, variable or environment; Clerk's Android application with no
  fingerprint; the Expo project with no build; no Resend record in DNS. Written: nine
  decision rows of this date, RULES (Git and CI, Toolbox), TASKS' Automation section with
  P0 to P6 and the owner's line, Stage 6's staging-domain decision ticked. Committed: the
  Expo project's id and owner in `app.json`, as `eas init` left them. Set: the staging
  host's origin beside the alias in `staging-preview`'s `CLERK_AUTHORIZED_PARTIES`.
  1,575 tests.
- **Decided:** by the owner on 2026-11-16 (the plan approved, and the decisions pasted
  before it), the rows of that date. Not done: the variable is not deployed — the
  redeploy was refused to the session, so the office on the staging host still checks
  the old list until the first promotion; RULES has no `production` rule yet (the edit
  was refused to the session; it is P6's now); nothing is built — no workflow, no
  environment, no build, no DNS record. Not read: `eas env:list`, the tools' versions,
  the DNS token's Keychain item.
- **Release 0.1 state:** `main` at `3abacb2`; #117 open and green; this branch stacked on
  it. Staging: 40 migrations of 50, serving `1c94b64`. Next to move it is P1's first
  promotion, which needs the owner's `staging` environment and its two secrets.
- **Next:** owner merges #117 and this branch and creates the `staging` environment; then
  P1, the promotion workflow, plan first in its pull request.

### 2026-11-16 — P1's migration gate simplified by the owner; documents only

- **Did:** after the owner merged #117 and #118 (`main` at `2b41dbc`), branch
  `p1-policy-update`, documents only: one decision row and TASKS' P1 and owner lines.
  1,575 tests.
- **Decided:** by the owner on 2026-11-16, the row of that date (migration gate without a
  second environment): two GitHub environments, `staging` and `production`; a merge's
  promotion migrates only what the reading passes and the rehearsal verified; anything
  else, and the whole backlog `0040` to `0049`, waits for the owner's own dispatch
  naming the last migration it authorizes. Worth knowing: a session's `gh` signs in as
  the owner, so the workflow cannot tell the two apart — a session never runs
  `gh workflow run` on the promotion, and a deny rule for it in the owner's settings is
  what makes that more than a promise. Not done: nothing is built; staging is still at
  40 migrations of 50, serving `1c94b64`.
- **Release 0.1 state:** `main` at `2b41dbc`; staging unchanged. P1 needs the owner's
  `staging` environment with its two migrator secrets before its rehearse-only run.
- **Next:** owner merges this branch; then P1, plan first in its pull request, ending at
  the rehearsal's report for the owner.

### 2026-11-16 — Staging promotion built (P1); nothing run, the backlog still withheld

- **Did:** branch `p1-staging-promotion` from `p1-policy-update` (#119, open), six
  commits. `promote-staging.yml`: database, deploy, verify. In `packages/db`:
  `promotion/reading.ts`, `plan.ts`, `journal.ts`, `fingerprint.ts` and
  `run-promotion.ts`. `/api/ready` answers the deployed commit. The browser suite runs on
  the public host with no bypass, and holds the host to an expected commit. Every action
  pinned by commit. The runbook's promotion section. Watched red, by mutation, twelve
  rules: the DROP rule, a function's body read, quoted words read, the owner's gate, the
  flags, any tag authorizing, the owner not required, a rehearsal migrating, the journal
  prefix, a rehearsal behind staging, any string as a commit, the gate's number. The
  reading over the whole journal flags eight of fifty; of the backlog, `0040` (a dropped
  unique constraint, replaced by the exact-shift key), `0041` (REVOKE of the
  application's UPDATE on `companies`, then column grants) and `0042` (an enum value
  added). 1,623 tests.
- **Decided:** in this line's plan; the as-built row of 2026-11-16. Changed from the
  plan: the schema is compared through the catalog, not `pg_dump`, so no client is
  installed; the deployment is awaited by asking the host which commit it serves, not
  through GitHub's deployment records; a deploy key is used for the push when the owner
  has made one, since the job's own token may not move a branch across a workflow
  file's change; the suite's public-host mode came forward from P2. Not done, and why P1
  is not ticked: **the workflow has never run.** Unseen: the environment's secrets
  reaching it, the rehearsal branch accepting the owner's direct connection, the
  catalog lines equal between Neon and a replay, the push starting Vercel's build, the
  host naming a commit, the suite on the public host. Not built: the readiness artifact,
  the commit status and the issue (P2); a check that no workflow names production.
- **Release 0.1 state:** `main` at `2b41dbc`; #119 and this branch open, stacked.
  Staging: 40 migrations of 50, serving `1c94b64`, its origin list updated and not yet
  deployed. Order from here: the owner merges both and makes the `staging` environment;
  a rehearse-only dispatch; its report read; then the owner's own dispatch,
  `mode=promote`, `authorize_through=0049_invoice-send-guards`. A session makes neither
  the second dispatch nor any dispatch that names a migration.
- **Next:** the rehearse-only run and its report to the owner; then P2.

### 2026-11-16 — Staging mail's DNS and variables; promotion safeguards built, nothing run

- **Did:** P3, outside the repository: the DNS wrapper (`list`, `plan`, `apply`; four fixed
  records, no name taken, watched refusing one), installed by the owner; the four Resend
  records created under the staging mail subdomain and read back on four resolvers, the
  apex's records untouched; the domain verified by the owner; `MAIL_FROM` and
  `INVOICE_EMAIL_ALLOWLIST` (one address, the owner's) on staging's Preview beside the
  owner's `RESEND_API_KEY`. Read: the allow-list is already the whole of who staging can
  mail, and the request carries one recipient and no other recipient field. Then branch
  `p1-safeguards` from `900dadc`: the approval code, the endpoint pins, the migrate
  purpose, the development identity refused on a deployed database, `STAGING_URL` read as
  a secret; two decision rows, RULES' environments, the runbook. Watched red: thirteen
  mutations, each against a green baseline.
- **Decided:** by the owner on 2026-11-16, the two rows of that date (shared database;
  promotion safeguards). Not done: **nothing has run.** The promotion after #120 failed
  at its plan step before the environment's secrets existed; no rehearsal, no migration,
  no email. The fixture tenants' companies are not onboarded (TASKS); the browser flow's
  tenant guard is built and was seen on staging's alias, green with the suite's company
  id and red on a wrong one before any write. Worth knowing: on a Clerk development
  instance every fictional number signs in with the one test code (read on Clerk's page),
  the suite's defaults in `staging.spec.ts` are staging's fixture accounts, and the host
  is public: anyone could sign in as staging's admin. Today they cannot — the deployed
  commit still checks the old origin list, so every session on the public host is a 401
  (seen) — and the first promotion opens it. Built for it, with the owner's key in the
  `staging` environment: the suite signs in by single-use Clerk tickets (the row of this
  date), seen on staging's alias with tickets made through the Clerk CLI — five steps
  green, a made-up ticket and a spent one refused; ten more mutations watched red. Not
  seen: the workflow's own ticket step, which first runs in the promotion. Test mode is
  still on and is the owner's to turn off; the phone app has no ticket path.
- **Release 0.1 state:** `main` at `900dadc`; staging at 40 migrations of 50, serving
  `1c94b64`. Order from here: the owner sets the two endpoint ids and merges this branch;
  the merge's own run rehearses and prints the code; the owner dispatches `promote` with
  it; then one invoice email to the allow-listed address.
- **Next:** the rehearsal's report to the owner; after the promotion, P3's send.

## 2026-11-17

### 2026-11-17 — Overhaul planned and approved; reliability batch (O2)

- **Did:** read-only ground truth at `9108276` (three investigations: the pipeline, the
  product and code, the toolbox), then the plan, approved. Read: promotion run
  44009174126 rehearsed `0040`–`0049` cleanly and stopped at the owner's gate; staging at
  40 of 50, its host 73 commits behind and naming no commit; the `staging` environment
  holds no `E2E_*` variable, so the suite's tenant guard is idle in CI; Clerk's connector
  shows no test-mode setting, so that switch is the dashboard's. Branch
  `overhaul-reliability`: the roster cycle broken by `roster/current-rates.ts`;
  `material.create` with no conflict target (the racing test 1 red in 30 before, 30 green
  after); the cost test's fixture stamped in the past; the queue and the pull reading
  `receiptStandings`; the browser's id minter at `app/uuidv7.ts`; 31 unused strings gone;
  not-found to the Overview; the README. No migration, no dependency.
- **Decided:** by the owner on 2026-11-17 (the mandate and four answers): the backlog is
  applied first, before any merge; staging deploys from `main` by Vercel's deploy hook, a
  secret of the `staging` environment; the phone keeps the PRD's phasing; Cloudflare gets
  its documentation connector and a read-only token, writes staying on the pinned wrapper.
  Their decision rows come with the batches that enact them (TASKS, Overhaul). Not done:
  the other conflict targets are unaudited (Notes); `@types/pg` stays a dependency of
  `packages/db`, whose exported types need it. For the owner: DESIGN's "Scheduled shift
  (crew)" row still reads "To be built (TASKS S7)" though S7 is ticked.
- **Next:** the owner's three steps of O0; O1's branch; neither branch merges before O0.

### 2026-11-17 — Toolbox batch (O1): built; the machine's half waits for the owner

- **Did:** branch `overhaul-toolbox`, stacked on `overhaul-reliability` (#122).
  `.claude/settings.json` and three skills (`pr-prep`, `staging-status`, `ui-check`);
  `.claude/settings.local.json` ignored; `audit.yml` beside CI; overrides for
  `source-map-js` and `vite` (both published more than a day before), after which
  `pnpm audit` reads 5 moderate, none high. RULES (Toolbox), the decision row. Watched
  refusing: Clerk's five denied tools left the session the moment the file existed; the
  new `staging-dns` draft refused a name with a metacharacter, a name outside the zone and
  an argument to `plan`, and its write path is byte-identical to the installed one. Read
  for the owner's steps: staging's fixture company, its admin and worker both bound, on
  the suite's default numbers.
- **Decided:** the row of 2026-11-17 (toolbox, shared rules and the audit). Not done, each
  the owner's to install since a session may not write there: the new `staging-dns`, the
  `trader-cloudflare-dns-read` Keychain item, Cloudflare's documentation connector, the
  Playwright connector's version pin, `eas-cli`'s upgrade. Not seen: `inspect` answering
  (no token yet); gitleaks over this history (first run is the pull request's); the audit
  on a schedule. Vercel's and Sentry's connectors still read every project the account
  can: a rule cannot narrow a tool's arguments, so "staging only" there is a session's
  discipline, stated in RULES, not a guarantee.
- **Next:** O0's three owner steps; then both pull requests merge and O3 starts.

### 2026-11-17 — Gate #3 read; the browser suite made to refuse a run it was not told

- **Did:** read-only, twice: the promotion's sign-in path (the key in the `staging`
  environment alone, tickets by `POST /v1/sign_in_tokens` and the `ticket` strategy, no
  trace or artifact), and staging itself — one company, `R3 Staging Co`, its admin and
  worker on the suite's two fictional numbers, each bound, one customer, nothing else; 40
  migrations, equal by hash to the journal's first forty; the rehearsal branch at 50.
  Found: the three `E2E_*` values had been made as secrets where the workflow reads
  variables, so they arrived blank; the owner made them variables. Then branch
  `e2e-fail-closed` from `9108276`: the defaults removed, `missingSettings` in
  `tickets.ts`, the ticket step and the spec both refusing. Watched red: the spec's
  refusal, the ticket step's, a blank counted as set, a name dropped from the list — the
  last turned nothing red until the list was pinned by name.
- **Decided:** by the owner on 2026-11-17: no default for the suite's company or its two
  people. Not done: no workflow change, so with the company alone unset the two tickets
  are still made before the suite refuses, and expire unused; the fallback to Clerk's
  test code when no ticket is given is kept. Not seen: the refusal in the workflow, and
  the verify job at all, which has never run. The `staging-e2e` wrapper passes none of
  the three, so a session's own run refuses until it does: the owner's file.
- **Release 0.1 state:** `main` at `9108276`; staging at 40 of 50, serving `1c94b64`. This
  branch's merge starts a promotion that verifies the rehearsal and stops at the owner's
  gate, red by design, with nothing migrated; its report prints the code for the new
  commit, and a code printed for `9108276` no longer holds.
- **Next:** owner merges this branch, reads that run's report and dispatches `promote`
  with its code; then the verify job's first log.

### 2026-11-17 — #124 merged; the gate held; `main` made a session's to merge

- **Did:** read-only after the owner merged #124 (`main` at `f5e31aa`): CI green; the
  merge's promotion verified the rehearsal branch (50 of 50, schema equal to a replay) and
  stopped at the owner's gate with `deploy` and `verify` skipped; staging still at 40 by
  hash, `staging-preview` still `1c94b64`; the run's approval code recomputed from the
  files and equal. Read for the owner: every way a session reaches the owner's GitHub
  credentials (the CLI's token with repository and workflow scope, the account SSH key,
  the Keychain helper, a signed-in browser), and that a collaborator's fine-grained token
  cannot work on a personal repository (GitHub's page, this date), so an isolated identity
  here is a GitHub App. Then branch `main-autonomy-policy`, documents only: RULES (Git and
  CI, Session protocol), `CLAUDE.md`, one decision row, one TASKS line.
- **Decided:** by the owner on 2026-11-17, the row of that date: a session merges into
  `main` through its pull request and `check`; production is the owner's alone, by policy
  and not yet by permission; the backlog's approval stays the owner's dispatch. Not
  changed, and asked of the owner: whether "plan, stop, wait" for schema, auth, sync,
  money and CI still waits. Not done: nothing merged by a session yet — the local deny
  rule stands, and a merge now would kill the code the owner holds; #123's committed
  settings still list a merge and a dispatch as never run and need this policy before
  they merge.
- **Release 0.1 state:** `main` at `f5e31aa`; staging at 40 of 50, serving `1c94b64`; the
  approval code for this commit is in run 44037693363's report. Open: #122, #123 and this
  branch, none to merge before the backlog is applied.
- **Next:** the owner's dispatch, `promote` with that code; then the verify job's first
  log, and these three pull requests merged in order.

### 2026-11-17 — First promotion: staging at the journal and deployed; the suite's first test faulty

- **Did:** read after the owner's authorized dispatch (run 44046566988, `main` at
  `5c2cc12`): `database` and `deploy` green, staging at 50 of 50 by hash, `staging-preview`
  and the staging host at `5c2cc12`, readiness 200, a call with no session 401, the
  development sign-in 404. `verify` red at the suite's first test, the other four not
  run: on the public host with an expected commit — a path no run had taken — it read the
  readiness body after disposing the request context. The ticket step made two tickets;
  the log holds neither a ticket nor a key. Branch `e2e-readiness-read`: `askReadiness`
  (`e2e/readiness.ts`) reads the body before the context goes, the spec uses it, and a
  test asks it with Playwright's own context of a local server. Watched red: the original
  fault ("Response has been disposed"), a followed redirect, a commit taken from any 200.
  Seen on the staging host, the first test alone: green on `5c2cc12`, red on another
  commit.
- **Decided:** nothing. Not done: the four signed-in tests have still never run in the
  workflow — tenant check, forged ticket, spent ticket, the worker's refusal; O0 is not
  ticked.
- **Release 0.1 state:** `main` at `5c2cc12`; staging at 50 of 50 and serving it; nothing
  pending, so this branch's merge starts a promotion that migrates nothing, deploys the
  merge and runs all five tests with fresh tickets.
- **Next:** merge this branch on a green `check`; read that promotion's verify log; then
  O0's tick and O3.

### 2026-11-17 — Staging promoted end to end; all five browser tests green; O0 ticked

- **Did:** read after the owner merged #126 (`main` at `0eec8b9`): CI green; promotion
  44049053024 green in all three jobs with nothing pending and nothing migrated;
  `staging-preview` and the staging host at `0eec8b9`; staging at 50 of 50. The verify job
  made two tickets and ran five tests green in 16.6 s: readiness and the commit, a
  made-up ticket refused, the admin held to `E2E_COMPANY_ID` and rewriting the fixture
  customer, the spent ticket refused, the worker refused the office. The log holds no
  ticket and no key; no artifact exists. Read back from the database: one company, two
  users, one customer, its notes carrying the run's stamp. Branch `o0-record`, documents
  only: O0 ticked.
- **Decided:** nothing new. Not done: the committed `.claude/settings.json` and the
  owner's local file both still deny `gh pr merge` and every `gh workflow run`, against
  the 2026-11-17 policy in RULES; a session's edit of its own rules was refused, rightly,
  so the change is the owner's to make. No session has merged yet. P1 is not ticked: a
  run for a commit already promoted, a merge carrying a flagged migration and a dispatch
  with a wrong code are each unseen. Clerk's test mode being off rests on the owner's
  word.
- **Release 0.1 state:** `main` at `0eec8b9`, staging serving it at the journal, the
  suite green. Still on GitHub: `overhaul-reliability` and `release-0.1`, each deletion
  the owner's.
- **Next:** O3, staging from `main` by the deploy hook (plan first: CI); it needs the
  owner's deploy hook as a secret of the `staging` environment.

### 2026-11-17 — The DNS wrapper's `inspect` installed; the zone read whole

- **Did:** on the owner's instruction, `~/.config/trader/staging-dns` extended with
  `inspect [NAME]`, the earlier file kept beside it; its write path is the installed one
  unchanged (four lines of argument handling differ). Seen: `inspect` listing the zone's
  ten records and the staging host's CNAME with both resolvers' answers; `list` and
  `plan` as before, all four records "ok"; `apply` not run. Watched refusing: a name
  outside the zone, a name that is not a host name, a second name, an argument to `list`
  and to `plan`, an unknown command; and, with the wrapper's request function run alone
  against a stand-in for `curl`, every method but GET under `inspect`. The zone read
  the same before and after. Branch `dns-inspect-docs`, documents only: RULES' Toolbox
  line, one decision row, a Note.
- **Decided:** by the owner on 2026-11-17, the row of that date: one token, no read-only
  second one. Not done: whether the Keychain item named "TRADER Cloudflare DNS
  Automation" holds the same token as `trader-cloudflare-dns-token` — a session does not
  read the Keychain, so the comparison is the owner's one command; the committed
  settings still deny a `trader-cloudflare-dns-read` item that no longer exists. No DNS
  record was written.
- **Release 0.1 state:** unchanged: `main` at `0eec8b9`, staging serving it at 50 of 50,
  the suite green; #127 open, this branch stacked on it.
- **Next:** O3, staging from `main` by the deploy hook (plan first: CI).

### 2026-11-17 — Staging from `main` (O3) and the final two-branch workflow: built, not yet run

- **Did:** read first, on the owner's report: #122 and #123 merged, `main` at `0eec8b9`
  with `check` green, staging at 50 of 50 and its host naming that commit, the three
  `E2E_*` variables set, both numbers already in E.164 with their `+`. Branch
  `o3-staging-from-main`, stacked on #128 (#129). `promote-staging.yml`: no
  `staging-preview` anywhere; `deploy` calls the staging project's deploy hook with no
  checkout and no token, only while `main`'s head is the run's commit; `verify` holds
  the host to the commit before the suite; a `report` job writes the `staging` status.
  `apps/web/vercel.json` stops a push to `main` building. `TRADER_ENVIRONMENT`
  (`environment.ts`): required at start, the only thing that lifts the mail allow-list,
  the name on an error report. The audit's one exception, by name. Watched red: the
  workflow's four text tests against the old file; seven tests of the environment before
  its code. The deploy and report steps run by hand against stand-ins for `curl`, `git`
  and `gh`, fourteen cases. RULES, `CLAUDE.md`, the README, the runbook (the staging
  project's settings, expand and contract, releasing to production and its setup order),
  one decision row, TASKS.
- **Decided:** by the owner on 2026-11-17, the row of that date (two branches and a
  release by pull request): the staging project keeps `main` as its Production branch;
  the owner merges every pull request; no separate GitHub identity; a release is a pull
  request into `production`. In the plan: the hook stays, since a native build starts
  before the migration; a superseded run is green with a `pending` status. A first
  version of this batch made staging a Preview with the project's Production branch
  moved off `main`; the owner corrected it before it merged. Not done: **nothing has
  run.** The workflow cannot be tried from a branch and the hook does not exist yet.
  Unseen until the first merge: the hook building `main` with `git.deploymentEnabled`
  off, that build being the project's Production deployment, the host moving to it, the
  status written, a deployment starting with `TRADER_ENVIRONMENT`. Not built: the
  `release` check (P6); nothing of production exists. O3 is not ticked. Notes about
  `staging-preview` stand until the cutover is seen.
- **Release 0.1 state:** `main` at `0eec8b9`, staging serving it at 50 of 50. Before #129
  merges, the owner's, on the staging project (the runbook's list): every variable for
  Production as well, `CLERK_AUTHORIZED_PARTIES` and `TRADER_ENVIRONMENT=staging` added,
  the ignored build step removed, one deploy hook for `main` stored as
  `STAGING_DEPLOY_HOOK`, the staging host made the Production domain. Merge #129 alone:
  it carries #127 and #128.
- **Next:** the first promotion after the merge, read end to end; a second merge unaided;
  then O3's tick, the `release` check, and the branch deletions on the owner's word. O4
  only after.

### 2026-11-17 — Restore and reconcile (O8): the dropped row and entries back; a session merges into `main`

- **Did:** from the audit taken at `0eec8b9`, read at `82b33b9`. Branch
  `o8-restore-reconcile`, five commits, documents and settings only. Restored, each equal
  byte for byte to `c5a1cae`: ARCHITECTURE's row "`main` worked autonomously", and the Log
  entries "Gate #3 read" and "#124 merged". Counted: of the lines `main` had added since
  the merge base, `23a5001` lost that one row and those 48 lines and nothing else; every
  other removal in that merge was a commit of the branch. One answer to who merges, in
  RULES (Git and CI, Toolbox, Session protocol), `CLAUDE.md`, the README, TASKS, the
  database runbook, `pr-prep` and the committed settings, which no longer deny
  `gh pr merge`. TASKS lines O8 to O13. Watched: `gh pr merge --help` refused before the
  change.
- **Decided:** by the owner on 2026-11-17, the row of that date (a session merges into
  `main`; `production` stays the owner's), which supersedes the owner's merge in the
  two-branches row written the same day. Not done: the owner's local settings file still
  denies `gh pr merge`, so no session can merge until the owner removes that line, and
  this pull request is the owner's to merge; nothing refuses a merge into `production`
  but the rule (Notes); "Isolated identity before production" is not brought back; of the
  audit's decisions only D1 and D9 are recorded — D2 to D8 are each its batch's plan.
- **Release 0.1 state:** `main` at `82b33b9`. O3's first promotion is still unread in
  this file: this session did not look at staging.
- **Next:** owner merges this branch and lifts the local deny; then O3's first promotion
  read end to end, and O9, plan first.
