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
5. The contractor can leave with their data: QuickBooks-importable exports plus a full export.

Non-goals for V1: payments, estimates and quotes, scheduling beyond assignments, a customer
portal, a marketplace, an AI estimator, and anything that requires a second contractor to exist.

## Target users

| User           | Device                     | Connectivity | What they do in TRADER                                                                 |
| -------------- | -------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| Worker         | Own phone (iOS or Android) | Unreliable   | Clock in/out, switch jobs, log materials and photos, see own hours and assignments     |
| Foreman        | Own phone                  | Unreliable   | Everything a worker does, plus crew labor on own jobs and the day closeout             |
| Admin (office) | Phone and laptop           | Reliable     | Roster, jobs, customers, assignments, approvals, pay periods, payroll export, invoices |

Everyone is a user with their own login.

## Core features (V1)

### Labor

- One-tap clock in, clock out, pause/resume and job switch, confirmed with the device's
  biometrics. Attestation is evidence, never a precondition: a failed or unavailable check
  records `none` and the event is still written.
- Labor is an append-only event log. Hours and sessions are derived from it; nothing is stored
  as an editable number, and no role — including admin — edits a recorded event. Corrections
  are new events that reference the original.
- Device time is business time. It is recorded as the device reported it and is never used to
  settle a dispute; approval is.
- Pay rates are effective-dated. Closed pay periods are immutable; a late entry becomes an
  adjustment in the next open period. No pay or overtime calculation in V1: TRADER exports
  approved hours, payroll computes pay.

### Office approval

An entry needs office approval before it counts toward payroll or job cost when any of these
holds: it was captured offline; it was edited or corrected; its recorded time was set by the
user, not taken at capture; its location stamp is missing or outside the job's radius; its
device's clock disagreed with server time beyond the allowed tolerance; it arrived after its
day's closeout was accepted. Everything else is approved by default. Nobody approves their own
entries. The approval queue tags each entry with every reason it is there.

### Jobs and location

- Jobs belong to a customer and are assigned to a crew; a crew has a foreman. A worker's jobs are
  those of every crew they belong to, switched freely during a day. A dated assignment with an
  expected start and end plans a worker's day; it never authorizes work or becomes hours.
- Location is a foreground stamp at clock-in, clock-out and job switch, plus Smart Clock-In;
  never tracking, sampling, history or a map. Missing or out-of-radius: approval, never a block.

### Smart Clock-In

- Follows the manual pilot, within V1. An admin makes an employee eligible; it runs once they
  read an in-app background-location disclosure, activate it and grant the phone's permission,
  which no admin setting overrides. Manual clock-in always remains.
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

The foreman reviews the day's labor and materials for a job, sets job status and a note, and
submits. A submitted closeout is locked; later changes are correcting entries that go through
approval.

### Invoicing and exports

- Invoices move `draft → issued → void`. An issued invoice is immutable; a change is a credit
  memo or a new invoice. Numbering is gap-free per company and continues the partner's
  existing series. Line items are snapshots of job labor and materials, never live references.
- The admin enters tax per invoice; TRADER only does the arithmetic. No paid flag and no
  payment capture: the office records payment in their accounting package.
- PDF rendered on demand. QuickBooks CSV export of invoices; payroll CSV export of approved
  hours; full data export.

### Sync and offline

Every field action is durable on the phone the moment the tap returns, with or without signal
or a valid session, and its delivery state is always shown (DESIGN.md). Devices hold only the
user's own entries and reference data offline; crew views are online-only.

### Access

Invitation-only accounts. Sign-in by passkey with an email-code fallback; no passwords, no
SMS. A new user starts as a worker; roles are a deliberate roster action.

## Pilot and V1 completion

- Pilot build: sign-in, manual clock in/out with job attribution, sync, the approval queue,
  and the payroll export, distributed by TestFlight public link and the Play internal track.
  The pilot is unpaid.
- V1 complete — the billing trigger — requires every V1 feature above, production distribution
  on the App Store and Google Play (US storefronts), and a partner-signed acceptance checklist.

## Compliance before real users

Privacy policy and terms of service; account deletion as deactivate-and-pseudonymize, because
labor records are retained by law; Apple App Privacy details and Google Play Data Safety form,
each declaring location (background too, before Smart Clock-In) and what Sentry and PostHog
collect; Sentry PII scrubbing; local employment rules on location checked before Smart Clock-In.

## After V1

Push notifications, web approval by push to the admin's phone, SMS, roster self-service, audit
log, dark theme, payments, a customer portal, per-company branding (each contractor's own logo
in the crew app and office header), and a second contractor — the schema is tenant-safe from
the first migration, so that is onboarding work, not restructuring.
