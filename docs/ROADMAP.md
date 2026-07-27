# Roadmap

Where the build is now, what each phase delivers, and what must be settled or acquired
before each one starts.

_What the system is_ → [SPEC.md](SPEC.md). _Why choices were made_ →
[DECISIONS.md](DECISIONS.md). _Service costs and lead times_ → [ACCOUNTS.md](ACCOUNTS.md).
This file owns the build path and current status.

## Now

**Phase 0, in progress.** The pnpm workspace and `packages/db` are done — full schema, the
append-only triggers, and invariant tests passing against local Postgres. Next is
`packages/api` (tRPC, Clerk context, `me.get`), which needs no accounts.

The remaining Phase 0 steps are blocked on signups, not code: Neon and Clerk for the web
app, Expo for mobile, Sentry and Vercel to deploy.

## How phases work

Each phase is independently shippable and usable on a real job. Ship phase N before building
N+1. **Planning horizon: 13–20 weeks solo** — the nominal 10 weeks did not survive
adversarial review. The ranges below allocate that band; they are effort, not dates.

| Phase                             | Delivers                                   | Effort        | Status          |
| --------------------------------- | ------------------------------------------ | ------------- | --------------- |
| **0 — Foundation**                | Monorepo, schema, auth, one deployed stack | 2–3 wks       | **In progress** |
| **1 — Offline clock in/out**      | The sync core, and **the pilot goes live** | 4–7 wks       | Not started     |
| **2 — Jobs, roster, materials**   | Self-service setup, materials with photos  | 3–4 wks       | Not started     |
| **3 — Closeout & reconciliation** | Day lock, corrections, job cost to date    | 2–3 wks       | Not started     |
| **4 — Invoices**                  | Invoice CRUD, PDFs, tracked to paid        | 2–3 wks       | Not started     |
| **5 — Payments**                  | Client portal, payment capture, payouts    | Trigger-based | Unscheduled     |

---

## Phase 0 — Foundation

Repo, TypeScript monorepo (mobile + web + shared types), Drizzle schema for core tables,
Neon database, Clerk wired, one deployed backend, Sentry on.

**Done when** an admin can log in on web and a worker on mobile against the real deployed
stack.

**Needs:** Neon · Clerk · Vercel · Sentry · Expo. **Gates:** none outstanding.

## Phase 1 — Offline clock in/out — _and the pilot_

Local store on `expo-sqlite`, append-only event model, client UUIDs, derived-session
computation, the server-authoritative conflict handler, and **the sync layer itself** —
outbox push, pull, retry/backoff, visible per-record status, device-side migrations.

Sync services exist — PowerSync and ElectricSQL among them — and building rather than buying
is a deliberate choice recorded in [DECISIONS.md](DECISIONS.md). The consequence for
planning: estimate this as build, not wiring.

**Done when** a worker tracks a real day's hours across spotty connectivity and the office
sees correct, deduplicated hours per job.

This phase carries the most risk in the project. Everything later is additive on a working
sync core; if the core is wrong, everything above it inherits the fault.

| Gate                                              | Due                              | Why it blocks                                                                                |
| ------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| Offline auth grace policy                         | **At start**                     | A Clerk session expiring in a dead zone must not block clock-in — it shapes the auth path    |
| Sync protocol shape — cursor, batch size, backoff | **At start**                     | The protocol _is_ the phase                                                                  |
| Language: English-first vs Spanish-first          | **At start**                     | i18n from day 1 is cheap; retrofitting is not                                                |
| Data retention policy                             | **Before the policy is drafted** | The privacy policy cannot be written without it, and statute largely dictates the answer     |
| Account deletion flow                             | By pilot launch                  | A store requirement, not a nicety — see the compliance note below                            |
| ToS and Privacy Policy                            | By pilot launch                  | Real users, real payroll data                                                                |
| Apple App Privacy details · Play Data Safety form | By pilot launch                  | Separate mandatory forms, one per store. Both must declare location and what Sentry collects |
| Sentry PII scrubbing configured                   | By pilot launch                  | Crash breadcrumbs capture phone numbers and location unless told not to                      |
| Pilot success criteria                            | By pilot launch                  | You cannot judge a pilot you never defined success for                                       |

**Needs:** Apple Developer · Google Play · domain · **Neon Launch billing begins here.**
Jobs and roster are hand-seeded until Phase 2.

### Distribution

The crew is mixed, so both tracks are needed.

**iOS — TestFlight external testing.** The public-link path. Each version's first build goes
through Beta App Review, roughly a day. That is latency on every pilot hotfix, not a gate.
(Internal testing is instant but requires testers to be App Store Connect users on your team
— the wrong shape for a field crew.)

**Android — a Play closed-testing track**, which distributes immediately.

Google's 12-testers/14-continuous-days rule does **not** gate the pilot. It gates _production
access_ — a public Play listing, which this roadmap does not schedule. A pilot is itself a
closed test, so the clock can run during it: with 12+ Android crew continuously opted in, the
pilot clears that gate as a side effect. If fewer stay opted in the window rebuilds, and you
pad with outside testers before wanting a public listing. A count to watch, not a deadline.

### Compliance that comes with real users

Three items on the gate list above are easy to underestimate.

**Account deletion is a store requirement that cannot mean erasure.** Labor events survive by
law and by trigger; deletion deactivates the account and anonymizes the identifiers. The
mechanism is settled in [DECISIONS.md](DECISIONS.md) — the flow still has to be built.

**Each store has its own privacy form**, separate from the policy document: Apple's App Privacy
details and Google's Data Safety form. Both must declare device location, and both must account
for what Sentry collects.

**Sentry needs scrubbing before real workers use the app**, not after. Breadcrumbs capture
phone numbers and now location by default, which makes an honest declaration worse and puts PII
somewhere it does not belong.

### Before the pilot: run a restore drill

Take a Neon point-in-time restore to a branch and run the invariant tests against the restored
copy. For a payroll system of record, one tested restore is worth more than any document here.
An untested backup is a belief, not a capability.

## Phase 2 — Jobs, roster, materials

Roster management (invite/deactivate, pay rates), job CRUD with customers, material logging
with photo upload.

**Done when** an admin can set up people and jobs, and the field logs materials alongside
hours — without you in the loop.

**Gates:** pay-rate history (effective-dated vs snapshot-at-session — a mutable rate
retroactively corrupts past job costs) · file storage provider · geocoding provider.

**Needs:** whichever storage and geocoding providers those gates select — each becomes an
account with a row in [ACCOUNTS.md](ACCOUNTS.md). Inngest, if background jobs start here.

## Phase 3 — Closeout & reconciliation

Day-close lock, admin correcting entries, reconciliation table with drill-down,
job-cost-to-date in cents.

**Done when** a foreman closes out a day, it locks, the office sees it, and a correction is
issued without mutating history.

**Gates:** closeout actor — foreman-only vs worker-own-day.

## Phase 4 — Invoices

Invoice and line-item CRUD, PDF generation to object storage, manual sent/paid, labor and
material costs pulled into line items.

**Done when** an admin issues an invoice from a completed job's data and tracks it to paid.

## Phase 5 — Payments

Client portal, real payment capture, contractor payouts. **A trigger, not a date:** a customer
asks to pay online, or a paying contractor base needs payouts. Not before. The schema is
already shaped for it, so this adds tables rather than restructuring existing ones.

---

## Beyond v1

Unscheduled and trigger-based. Listed so the shape is visible, not to commit to it.

- **First public Play listing** — the milestone Google's 12/14 rule actually gates. Post-pilot.
- **Second company onboarding** — the trigger for Postgres RLS. `company_id` is already the
  seam on every tenant-scoped table.
- **Marketplace** and **AI estimator** — recorded in DECISIONS as later phases, explicitly not
  the wedge.
