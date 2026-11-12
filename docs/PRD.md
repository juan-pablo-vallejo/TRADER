# TRADER — Product Requirements

Phone-first daily closeout and job costing for small painting contractors. How it is built →
[ARCHITECTURE.md](ARCHITECTURE.md). The order it gets built → [TASKS.md](TASKS.md).

## Product overview

A field crew records labor, materials and job progress on their phones during the day, offline
if necessary. The office approves what needs approving, exports payroll, and invoices the
customer from the same record. TRADER is the contractor's system of record for field activity;
their accounting package stays the system of record for the books, and TRADER exports to it.
Owner and sole developer: Juan Pablo Vallejo, a former painter-estimator. Design partner and
first pilot: a painting contractor in Rhode Island and Massachusetts, about 30 people.

## Problem statement

Small painting contractors lose margin because field activity lives in texts, calls, photos and
memory until someone reconstructs it days later. Hours are wrong, materials go unbilled, and
job cost is known — if at all — after the invoice has gone out. Existing tools assume an office
worker with a laptop and a connection; the crew has a phone, gloves, sunlight, and a basement
with no signal.

## Goals

1. Every hour and every material is recorded the day it happens, by the person it happened to.
2. The office closes a pay period — approve, correct, export — without reconstructing anything.
3. Job cost to date is visible before the job closes, not after.
4. Nothing recorded is ever silently lost, duplicated or rewritten.
5. The contractor can leave with their data: invoice exports for QuickBooks Online and QuickBooks
   Desktop, a payroll-hours export, and a full export.

Non-goals for V1: payment processing, estimates and quotes, scheduling beyond assignments, a customer
portal, a marketplace, an AI estimator, and anything that requires a second contractor to exist.

## Target users

| User           | Device                     | Connectivity | What they do in TRADER                                                                                                                                                                                 |
| -------------- | -------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Worker         | Own phone (iOS or Android) | Unreliable   | Clock in/out, switch jobs, log materials and photos, see own recorded hours, materials and assignments, edit own name and phone                                                                        |
| Foreman        | Own phone                  | Unreliable   | Everything a worker does, plus crew labor on own jobs, the crew's current state when online, and the day closeout                                                                                      |
| Admin (office) | Phone and laptop           | Reliable     | Roster, jobs, customers, assignments, approvals, any worker's hours and their repair, material costs and missing material entries, job cost, closeouts, pay periods, payroll export, invoices, exports |

Everyone is a user with their own login — a crew member's on their own phone number, an office
admin's on their own email address; nobody shares an account.

- A worker creates their own labor and material records on the jobs they are allowed to work,
  sees their own recorded history, and changes their own name and phone. A worker never edits a
  recorded entry and never sees another worker's history; a mistake is fixed by a correcting
  entry (Labor, Day closeout).
- A foreman's extra authority reaches only the crews they lead and those crews' jobs.
- An admin's authority covers the whole company and nothing outside it. It never includes
  rewriting a recorded entry, a submitted closeout, a closed pay period or an issued invoice,
  and the approval rule below says which decisions an admin may not make alone.

## Core features (V1)

### Labor

- One-tap clock in, clock out, pause/resume and job switch, confirmed with the device's
  biometrics. Attestation is evidence, never a precondition: a failed or unavailable check
  records `none` and the event is still written.
- Labor is an append-only event log. Hours and sessions are derived from it; nothing is stored
  as an editable number, and no role — including admin — edits a recorded event. Corrections
  are new events that reference the original.
- Device time is business time. It is recorded as the device reported it and stays the entry's
  time: a time that looks wrong is sent to the office for review, never replaced by the time
  the server received it. Device time is never used to settle a dispute; approval is.
- Pay rates are effective-dated; a changed rate is a new rate from a date, never an edit.
- Hours belong to the pay period that contains their work date when they are approved before
  that period closes. An admin may close a period while entries in it still wait for approval:
  the office is shown what is unresolved and must acknowledge it first. A closed pay period
  and its export are immutable: anything approved, corrected or repaired after the close is
  exported exactly once, as an explicit adjustment in the next period to close, carrying its
  original work date.
- A worker's time on a job is summed for the day first, then rounded half-up to the hundredth
  of an hour; job cost, the payroll export and any invoice line drawn from labor use that
  figure. The recorded entries are never rounded. No pay or overtime calculation in V1: TRADER
  exports approved hours, payroll computes pay.

### Office approval

An entry needs office approval before it counts toward payroll or job cost when any of these
holds: it was captured offline; it was edited or corrected; its recorded time was set by the
user, not taken at capture; its location stamp is missing or outside the job's radius; its
device's clock disagreed with server time beyond the allowed tolerance; it arrived after its
day's closeout was accepted. Everything else is approved by default. The approval queue tags
each entry with every reason it is there.

- Captured offline means the phone had no confirmed contact with TRADER's server when the entry
  was recorded; unknown or out-of-date contact counts as offline. Recording never waits to find
  out, and a late upload does not by itself make an entry offline.
- The server checks the time an entry claims against the time it arrived: an entry that says
  it was captured online, at the time it carries, cannot arrive long after that time without
  going to approval — with the time it claims intact — and an entry timed in the future is
  refused, kept on the phone and recoverable by the office. A phone cannot skip approval by
  describing itself favourably.
- Decisions are an admin's. The person who logged a material entry never decides it, and the
  person who submitted a correction never decides it. A repair an admin writes for someone else
  goes through approval like any correction.
- An admin's own labor needs no approval: what would send it to approval is still recorded
  with the entry, and the entry counts as recorded.

### Office review and job cost

- The office sees any worker's recorded day — sessions, the events behind them, what is
  pending and why — and repairs it there with correcting entries, which go through approval.
- The office enters what a logged material cost, and adds a material entry the crew never
  logged. An office entry is marked as entered by the office and by whom; it never changes an
  entry already submitted or closed out.
- Job cost to date is approved labor at the rate in force on each work date plus priced
  materials, shown per job with what is still pending or unpriced beside it, never folded in.
- A reconciliation view lists, for a pay period, every worker's approved hours by day and job,
  everything still unresolved, and every adjustment the period carries from earlier ones.
- Role changes, activations and deactivations, invitations, pay rates, repairs and approval
  decisions record who made them, when, and what changed. Nothing else is audited in V1.

### Jobs and location

- Jobs belong to a customer and are assigned to a crew; a crew has a foreman. A worker's jobs are
  those of every crew they belong to, switched freely during a day. A dated assignment with an
  expected start and end plans a worker's day; it never authorizes work or becomes hours. An
  admin may schedule any worker on any of the company's jobs: the assignment adds nobody to a
  crew and opens no one's records, and the office is shown when the worker could not clock in
  on that job as things stand.
- Location is a foreground stamp at clock-in, clock-out and job switch, plus Smart Clock-In;
  never tracking, sampling, history or a map. Missing or out-of-radius: approval, never a block.

### Smart Clock-In

- Pilot: on app open, one foreground reading may suggest a job; the worker confirms the normal
  clock-in. Never automatic or background; permission optional; manual selection always remains.
- Arrival reminders follow the pilot, in V1. An admin makes an employee eligible; it runs once
  they read an in-app background-location disclosure, activate it and grant the phone's
  permission, which no admin setting overrides. Manual clock-in always remains.
- A work window (company default, employee override) is an expected start and end, not a
  schedule. From 30 minutes before the start to its close, entering a crew job's radius
  (the approval rule's, 200 m when first set, so a change affects both; no coordinates, no
  reminder) raises a local notification, not a push; the employee confirms the normal
  clock-in. Departure only reminds; after the window, at most a timed open-session reminder.
- Entries and exits stay on the phone; only the clock-event stamp carries location to the
  server (device status may, without coordinates). The phone checks its policy before acting on
  an alert; its authorization expires; geofences go as soon as the OS allows, timing unpromised.
  Release waits on verified privacy enforcement; V1 waits on release. Attestation is evidence,
  never an approval reason; no face data; periodic sampling is outside V1, owner-gated.

### Materials and photos

- Materials are logged against a job with description, quantity, unit and an optional cost the
  office may fill in later. Logging never waits on cost.
- Material-receipt photos and job-progress photos attach to the job. The record syncs first;
  the photo uploads when bandwidth allows, and its upload state is visible.

### Day closeout

The foreman of the job's crew, or an admin, reviews the day's labor and materials for a job,
sets job status and a note, and submits; both submit the same way and get the same answers. A
submitted closeout is locked; later changes are correcting entries that go through approval.
An admin may also close out a job that is archived or has no crew; a foreman closes out only
the jobs of a crew they lead.

### Invoicing and exports

- Invoices move `draft → issued → void`. An issued invoice is immutable; a change is a credit
  memo or a new invoice. Numbering is gap-free per company and continues the partner's
  existing series. Line items are snapshots, never live references.
- A draft's lines may be drawn from the job's labor and materials, and the admin sets what the
  customer is charged on every line. What the job cost the contractor — pay rates, receipt
  costs — informs the admin and is never turned into a price by rule.
- Credit memos against an invoice never total more than the invoice's original total; an
  invoice that has a credit memo cannot be voided.
- The admin enters tax per invoice; TRADER only does the arithmetic.
- The office records the payments a customer makes against an issued invoice — amount, date,
  method — and the invoice shows what is still owed and when it is paid in full. TRADER never
  captures or processes a payment, and a recorded payment changes nothing on the invoice.
- PDF rendered on demand, and sent to the customer by email from TRADER when the admin
  chooses; the invoice shows when it was sent and to whom.
- Exports, each its own file from the same issued invoices or approved hours: invoices for
  QuickBooks Online (CSV), invoices for QuickBooks Desktop (IIF), and payroll hours (CSV); and
  the full data export. The two QuickBooks editions do not take the same file, and which one
  the design partner runs is not yet confirmed, so both ship.
- TRADER does not run payroll and does not synchronize with an accounting package. Where an
  edition cannot import something — some tax setups, credit memos — TRADER gives the office the
  figures and the steps to enter and reconcile it by hand, and never promises that an import
  will succeed.

### Sync and offline

Every field action is durable on the phone the moment the tap returns, with or without signal
or a valid session, and its delivery state is always shown (DESIGN.md). Devices hold only the
user's own entries and reference data offline; crew views are online-only. An entry the server
refuses stays on the phone, marked as needing attention. For an entry that reached the server
and could be identified, the server keeps a short-lived, minimal note that it was refused and
why — never the entry's contents — so the office can usually answer "where are my hours"
without the phone in hand; an entry that never arrived exists only on the phone. The office
can pause field sync, or require an app update, for everyone: the server then turns sync away
for the time being, the phone keeps every entry exactly as recorded, and sends it when sync
returns. A pause is never a refusal of an entry. The office web is online-only: with no
connection it says so and saves nothing for later.

### Access

Invitation-only accounts, one per person. A crew member is invited by their own mobile number
and signs in with a one-time code sent to it by SMS; an office admin is invited by their own
email address and signs in with a one-time code sent to it. The same code is how an account
is recovered; no passwords. SMS codes go to United States and Canada numbers only. A new user
starts as a worker; roles are a deliberate roster action.

## Pilot and V1 completion

- Release 0.1 — the first production release, for the design partner: sign-in; assigned
  jobs, clock in/out and job switch with offline capture and the location stamp, in English
  and Spanish; own hours; the office web on phone and desktop with dated assignments,
  approvals, repairs, admin closeout and pay periods; invoices created, issued, sent as a
  PDF by email, and their payments recorded. Distributed through the App Store and Google
  Play, published under the owner's own developer accounts.
- The crew starts all at once, and only after Release 0.1's go/no-go line in
  [TASKS.md](TASKS.md) is recorded as passed; a smaller first group is not a required step.
- The pilot continues on Release 0.1 while the rest of V1 is built: the job suggestion,
  biometric confirmation, materials and photos, the foreman's closeout on the phone, the
  payroll export, and invoices exported for both QuickBooks editions (no discount feature).
  The pilot is unpaid.
- V1 complete — the billing trigger — requires every V1 feature above, production distribution
  on the App Store and Google Play (US storefronts), and a partner-signed acceptance checklist.
- Neither is declared from a feeling: Release 0.1 opens on its go/no-go line in TASKS, and
  V1 closes on Stage 10's.

## Compliance before real users

Privacy policy and terms of service, public on `jpteq.app`; account deletion as
deactivate-and-pseudonymize, because labor records are retained by law, requested from inside
the app and from a public web page; sign-in credentials for a demonstration company for each
store's reviewers; Apple App Privacy details and Google Play Data Safety form,
each declaring location (background too, before arrival reminders) and what Sentry and PostHog
collect; Sentry PII scrubbing; local employment rules on location checked before Smart Clock-In.

## After V1

Push notifications, web approval by push to the admin's phone, SMS notifications, roster self-service beyond own
name and phone, an audit log of every write (V1 records the roster, pay-rate, repair and
approval actions named above), dark theme, payment processing, a customer portal, per-company branding (each
contractor's own logo in the crew app and office header), and a second contractor — the schema is
tenant-safe from the first migration, so that is onboarding work, not restructuring.
