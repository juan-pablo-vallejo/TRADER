# Roadmap

Where the build is now, what each phase delivers, and what must be settled or acquired
before each one starts.

_What the system is_ → [SPEC.md](SPEC.md). _Why choices were made_ →
[DECISIONS.md](DECISIONS.md). _Service costs and lead times_ → [ACCOUNTS.md](ACCOUNTS.md).
This file owns the build path and current status.

## Now

**Phase 1, in progress.** Phase 0 is complete: an admin signs in on web and a worker on mobile
against the local stack, each provisioned into Postgres on first request with the correct role,
all under CI.

Phase 1's four **at start** gates are settled — clock skew, pull cursor shape, offline auth and
language; see [DECISIONS.md](DECISIONS.md). The sync core is being built server-first, because
the protocol is testable headless long before a device can exercise it.

## What "v1" means

**v1 is Phases 0 through 4** — a crew that clocks in, an office that closes out and reconciles,
and an invoice that goes to a customer and gets paid. This file is the only place that definition
lives; everywhere else links here.

**The pilot is not v1.** It goes live at the end of Phase 1, on the sync core alone, and the crew
grows into the rest as it ships. That ordering is deliberate: Phase 1 carries the project's real
risk, and shipping it to a real crew early is the only way to find out whether it works. Waiting
for invoicing would leave the riskiest subsystem unvalidated for months.

Invoicing cannot move earlier regardless of preference. Populating an invoice from job data needs
jobs and customers (Phase 2), materials (Phase 2) and closed-out labor (Phase 3) to exist first —
before that there is nothing to populate from.

**Out of v1:** contractor payouts, a customer login portal, estimates and quotes, the marketplace
and the AI estimator.

## How phases work

Each phase is independently shippable and usable on a real job. Ship phase N before building
N+1. **Planning horizon: 14–23 weeks solo** to the end of v1, plus a 3–5 day spike that may cost
nothing — it needs no accounts and no server work, so it can run alongside any phase. The nominal 10 weeks
did not survive adversarial review; the band then widened again when passkey enrolment joined
Phase 1 and payment capture joined Phase 4. The ranges below allocate it; they are effort, not
dates.

| Phase                             | Delivers                                            | Effort        | Status          |
| --------------------------------- | --------------------------------------------------- | ------------- | --------------- |
| **0 — Foundation**                | Monorepo, schema, auth, one running stack           | 2–3 wks       | **Done**        |
| **Spike — geofenced clock-in**    | Whether battery cost kills auto-detection           | 3–5 days      | Not started     |
| **1 — Offline clock in/out**      | The sync core, joining, and **the pilot goes live** | 4–8 wks       | **In progress** |
| **2 — Jobs, roster, materials**   | Self-service setup, materials with photos           | 3–4 wks       | Not started     |
| **3 — Closeout & reconciliation** | Day lock, corrections, job cost to date             | 2–3 wks       | Not started     |
| **4 — Invoices & payment**        | Invoice from job data, PDF, sent, **paid online**   | 3–5 wks       | Not started     |
| **5 — Payouts & portal**          | Contractor payouts, customer login                  | Trigger-based | Unscheduled     |

---

## Phase 0 — Foundation

Repo, TypeScript monorepo (mobile + web + shared types), Drizzle schema for core tables, a
running Postgres, an identity at the HTTP edge, and both clients talking to one API.

**Done when** an admin can sign in on web and a worker on mobile against a **running stack**,
each provisioned into the database on first request, with the correct role.

**Needs:** nothing external — local Postgres and a development identity. Deploying that stack
to Vercel, Neon, Clerk and Sentry is a gate on **Phase 1's pilot**, where a real crew makes it
genuinely necessary. **Gates:** none outstanding.

Clerk is configured for **passkeys** here, not just phone. One consequence lands earlier than
expected: passkeys ship native code, so they work in neither Expo Go nor an Android emulator, and
the project needs a **development build on a physical device** from this phase rather than
whenever convenient.

## Spike — geofenced clock-in

Can arriving at a jobsite propose a clock-in, rather than the worker remembering to tap? Three
motivations in equal measure: convenience for the worker, evidence for the contractor, and
fewer corrections for the office.

**Advisory only.** Detection proposes; the worker confirms; the worker's tap writes the event.
That keeps the labor ledger human-initiated and costs nothing when detection is wrong — a bad
suggestion is dismissed and leaves no trace. See [DECISIONS.md](DECISIONS.md) for why an
authoritative version would collide with three settled constraints.

**The prompt _is_ the tap.** Confirmation is not a step added on top of the ordinary clock-in —
it is the same gesture, arriving unprompted. A worker who is offered the prompt taps it and
passes Face ID; a worker who is not opens the app and does exactly the same thing. This is why
advisory detection costs the worker nothing even when it fires wrongly, and it means the spike
does not need to design a confirmation UI of its own.

**What it tests.** Device-side region monitoring on both iOS and Android, at a real address,
over consecutive days. Not a server feature: neither platform lets a server ask where devices
are, so detection happens on the phone and reports upward.

**What it is not.** Throwaway code. No schema change, no server work, no production path. Three
to five days, then a decision.

**The exit rule: battery cost decides.** Detection reliability is probably solvable with enough
effort; a crew disabling background location to save their phones is not. If the drain is bad,
the idea is shelved regardless of how well it detects.

**A limitation to respect when reading the result.** Three days on two handsets cannot tell you
whether a crew would turn it off — only the pilot can, on phones their owners actually care
about. The evidence is asymmetric: a bad battery reading is strong evidence against, a clean one
is weak evidence for. Do not promote this to a feature on a clean reading alone.

Radius and whether the geofence is per-job or global are deliberately unset. The spike exists to
inform them rather than assume them.

## Phase 1 — Offline clock in/out — _and the pilot_

Local store on `expo-sqlite`, append-only event model, client UUIDs, derived-session
computation, the server-authoritative conflict handler, and **the sync layer itself** —
outbox push, pull, retry/backoff, visible per-record status, device-side migrations.

**One-tap attested clock-in ships here too:** tap → Face ID → clocked in. That means the
biometric gate on the mobile actions that become payroll, an attestation column on
`work_session_events`, and the recorded level flowing through sync. The check is local and
OS-mediated, so it needs no account and works with no signal. Rules are
[logic.md](logic.md) `ATTEST-1`–`ATTEST-4`; the web half waits for Phase 3.

**Joining ships here as well**, because a pilot crew needs accounts: an admin invites a worker by
phone number, the worker verifies once and enrols a passkey with Face ID, and every sign-in after
that is Face ID alone. The phone number stays as the recovery path, and the phone-OTP fallback for
pre-iOS-16 / pre-Android-9 handsets has to work from day one rather than being added when someone
turns up with an old phone. Rules are [logic.md](logic.md) `AUTH-1`–`AUTH-10`.

Sync services exist — PowerSync and ElectricSQL among them — and building rather than buying
is a deliberate choice recorded in [DECISIONS.md](DECISIONS.md). The consequence for
planning: estimate this as build, not wiring.

**Done when** a worker tracks a real day's hours across spotty connectivity and the office
sees correct, deduplicated hours per job.

This phase carries the most risk in the project. Everything later is additive on a working
sync core; if the core is wrong, everything above it inherits the fault.

| Gate                                              | Due                              | Why it blocks                                                                                                                                                                                |
| ------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy the stack: Neon · Clerk · Vercel · Sentry  | **At start**                     | Phase 0 runs locally by design. A pilot crew needs a reachable backend and real accounts, and Neon's tier reasoning in [ACCOUNTS.md](ACCOUNTS.md) must be re-read here rather than defaulted |
| Data retention policy                             | **Before the policy is drafted** | The privacy policy cannot be written without it, and statute largely dictates the answer                                                                                                     |
| Account deletion flow                             | By pilot launch                  | A store requirement, not a nicety — see the compliance note below                                                                                                                            |
| ToS and Privacy Policy                            | By pilot launch                  | Real users, real payroll data                                                                                                                                                                |
| Apple App Privacy details · Play Data Safety form | By pilot launch                  | Separate mandatory forms, one per store. Both must declare location and what Sentry collects                                                                                                 |
| Sentry PII scrubbing configured                   | By pilot launch                  | Crash breadcrumbs capture phone numbers and location unless told not to                                                                                                                      |
| Pilot success criteria                            | By pilot launch                  | You cannot judge a pilot you never defined success for                                                                                                                                       |

**Needs:** Neon · Clerk · Vercel · Sentry — all deferred out of Phase 0 and due here — plus
Apple Developer · Google Play · domain. **Neon Launch billing begins here.**
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

**Gates:** closeout actor — foreman-only vs worker-own-day · a documented alternative for an
admin with no phone, since web approval assumes one ([logic.md](logic.md) `ATTEST-10`).

### Web approval: the office half of one-tap

Corrections arrive in this phase, so this is where the web app gets attestation. The web has no
biometric of its own, so a high-consequence web action **pushes an approval to the actor's
enrolled phone** — the prompt names the correction in plain terms, the admin passes Face ID, and
the web action completes. Single-use, short-lived, and **fails closed**: if the push is not
answered, the correction does not happen. Rules are [logic.md](logic.md) `ATTEST-5`–`ATTEST-10`.

This phase is also the upgrade point for attestation strength. Web approval requires
server-issued challenges regardless, which is most of a device-key design already — so the phone
starts signing challenges with a Secure Enclave key here, and mobile clock-ins inherit it. Phase
1 deliberately ships the weaker local check; [DECISIONS.md](DECISIONS.md) records why.

Expo push moves onto the critical path here. It is already in the stack for worker
notifications, but an approval that silently fails to deliver is a stuck admin rather than a
missed notification — so delivery failure needs a visible, honest state.

## Phase 4 — Invoices & payment

Invoice and line-item CRUD with labor and material costs pulled from the job, PDF generation to
object storage, delivery by email, and **payment capture through the contractor's own processor
account**. The `payments` table arrives here.

**Done when** an admin issues an invoice from a completed job's data, the customer receives it,
pays it online, and the invoice reflects that without anyone ticking a box.

Two things change shape rather than being added:

- **`invoice_status` cannot express a partly-paid invoice.** The built enum is
  `draft | sent | paid | void`, which suited an admin marking a cheque as cleared. Once customers
  pay online, part-payments and overpayments are ordinary, so status becomes **derived from the
  payments attached** ([logic.md](logic.md) `INVOICE-4`). This is a migration, not a new column.
- **`invoice_number` moves to allocation at send.** Numbering drafts leaves gaps whenever one is
  abandoned, and unexplained gaps in an invoice sequence are what an auditor asks about first
  (`INVOICE-1`).

**What TRADER deliberately does not do:** hold customer money, or see a card number. Customers pay
the contractor directly through a processor-hosted page, and refunds and disputes stay in the
contractor's own dashboard. [DECISIONS.md](DECISIONS.md) records what staying out of the money
flow avoids.

**Gates:** processor confirmed (Stripe assumed) · invoice number format and starting value · what
happens when invoice email fails to deliver.

**Needs:** Stripe · Resend · the file-storage provider, whose Phase 2 gate becomes v1-critical
here since PDFs need somewhere to live.

## Phase 5 — Payouts & customer portal

Contractor payouts and a customer login. **A trigger, not a date:** a contractor base that needs
disbursement, or customers who want an account rather than a link. Not before — v1 takes payment
without either, since a hosted payment link needs no customer account and direct-to-contractor
payment needs no payout. The schema is already shaped for both, so this adds tables rather than
restructuring existing ones.

---

## Beyond v1

Unscheduled and trigger-based. Listed so the shape is visible, not to commit to it.

- **First public Play listing** — the milestone Google's 12/14 rule actually gates. Post-pilot.
- **Second company onboarding** — the trigger for Postgres RLS. `company_id` is already the
  seam on every tenant-scoped table.
- **Marketplace** and **AI estimator** — recorded in DECISIONS as later phases, explicitly not
  the wedge.
