# TRADER — Technical Specification

Canonical as of 2026-07-30. This document states what the system **is**; _why_ each choice was made, and when it changed, lives in [DECISIONS.md](DECISIONS.md). The **numbered rules** the system must obey — joining, session state machine, derivations, conflict resolution, permissions, attestation, invoicing — live in [logic.md](logic.md) and are cited here rather than restated. Revisions are listed at the end.

## 1. Architecture

Four pieces: a mobile app for the field, a web app for the office, one backend API, one Postgres database. Single backend, single database, single deploy target — a **modular monolith**: one codebase, one process, clean internal module boundaries, no microservices. For a solo-maintained system, every additional moving part is something one person must monitor, debug, and pay for; at pilot scale (~30 users), stability comes from having fewer things that can break.

- **Mobile (field):** React Native + Expo. Fully offline-capable; owns a local database and treats the network as optional.
- **Web (office):** Next.js — roster, dashboards, invoices, customer records. Online-first; the office has real connectivity.
- **Backend:** Node.js + TypeScript, one typed API (tRPC) shared by both clients. The server is the single source of truth: it accepts append-only events from clients, orders them, and resolves conflicts. Clients never argue with the server; they snap to its truth.
- **Database:** PostgreSQL. Local (Docker) through Phase 0; managed (Neon) from the pilot.
- **Hosting:** Vercel. The Next.js deployment serves the office web app _and_ hosts the tRPC API that both clients call — one deploy target, not two.

Deliberate maintainability-over-scale choices: monolith over services; managed Postgres over self-hosted once deployed; one API layer over per-client endpoints; hosted background jobs over self-run queue/Redis. None of these bottleneck at 30 users, and each removes an ops responsibility. They are adopted when they earn their keep, not before — development runs on a local Postgres so that building never waits on an account.

## 2. Tech Stack

| Layer             | Choice                                                            | Why                                                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile            | React Native + Expo (EAS)                                         | One codebase for iOS+Android; OTA updates, managed builds, push without touching Xcode/Gradle internals                                                                                                                     |
| Local mobile DB   | Drizzle on `expo-sqlite`                                          | Same ORM and migration tool as the server; actively maintained. Provides storage only — **the sync layer is ours** (§3)                                                                                                     |
| Web + API hosting | Next.js on Vercel                                                 | Admin panel and the tRPC API in one deployment; one bill, one log stream; deploys on git push                                                                                                                               |
| Backend           | Node.js + TypeScript + tRPC (superjson transformer)               | End-to-end type safety from DB to both clients, no schema-generation step, zero client/server drift. superjson keeps Dates intact across the wire                                                                           |
| Validation        | zod                                                               | Procedure inputs and, in Phase 1, sync payloads. Field-level errors are surfaced to clients rather than a bare BAD_REQUEST                                                                                                  |
| ORM               | Drizzle                                                           | Thin, SQL-shaped, TypeScript-native; first-class migrations, no heavy runtime                                                                                                                                               |
| Database          | PostgreSQL — Docker locally, Neon when deployed                   | One Drizzle API over two drivers, switched by `USE_LOCAL_POSTGRES`. Development needs no account; Neon is chosen for the deployed stack for serverless scaling, branching for safe migration testing, and automatic backups |
| Auth              | Clerk — passkeys primary, phone as recovery                       | Never hand-build auth solo. Sign-in is a passkey guarded by Face ID; the phone number invites the worker and recovers the account ([logic.md](logic.md) `AUTH-1`–`AUTH-10`)                                                 |
| Background jobs   | Inngest                                                           | Hosted; no Redis to run or monitor; handles retries/scheduling                                                                                                                                                              |
| File storage      | Undecided — S3+CloudFront, Vercel Blob or Cloudflare R2           | Material/receipt photos, invoice PDFs. Decided at Phase 2, when the real access pattern is known                                                                                                                            |
| Observability     | Sentry (errors), PostHog (product analytics)                      | Hosted, free-tier-friendly                                                                                                                                                                                                  |
| Secrets           | Vercel environment variables, EAS secrets, GitHub Actions secrets | Each platform holds the secrets it needs; no separate secret-management service                                                                                                                                             |
| Notifications     | Expo push (workers), Resend email (customers)                     | Push carries worker notifications and the Phase 3 approval prompt. Email delivers invoices, so it is load-bearing rather than incidental — but never the auth channel. Customer-facing SMS is out of v1                     |
| Payments          | Stripe, against the **contractor's own** connected account        | Customers pay the contractor directly. TRADER never holds funds and never sees a card number — hosted checkout only ([logic.md](logic.md) `INVOICE-6`, `INVOICE-7`)                                                         |

## 3. Offline & Sync

Governing principle: **the field client is offline-first and the server is authoritative.** A foreman in a basement with no signal must be able to clock in, switch jobs, log materials, and close out — and have all of it sync correctly hours later without loss or duplication.

- **Local-first writes.** Every field action writes immediately to on-device SQLite (`expo-sqlite`, via Drizzle); the UI updates from local state. The network is never on the critical path of a user action.
- **Client-generated UUIDs + idempotency.** Every client-created record gets a UUIDv7 (time-sortable) generated on the device, and the server upserts by it — so a flaky connection can retry the same write ten times and the server records it once ([logic.md](logic.md) `CONFLICT-1`).
- **Append-only event log for labor.** Time tracking is an immutable stream of events — `started`, `paused`, `resumed`, `ended`, `voided` — each stamped with a client timestamp (when it happened on the device) and a server timestamp (when it arrived). A worker's current session is a derived view computed by folding the events, never a mutable row. Events can arrive late, out of order, and in batches; the server still reconstructs the correct timeline.
- **`work_date` is derived, not entered.** Computed server-side from the clock-in timestamp in the company timezone (`companies.timezone`). Never user-editable — [logic.md](logic.md) `DERIVE-1`, and `DERIVE-2` for shifts crossing midnight.
- **Device location is best-effort and never blocks.** Each event may carry the device's position, captured on a short timeout. If no fix arrives — and in the basement above, none will — the fields stay null and the event is written regardless. Location is evidence when present, never a precondition for recording work.
- **Automation may propose; only a person's action creates a record.** Any detection — a geofence, a schedule, anything else — may suggest a clock-in or clock-out, but the worker's confirmation is what writes the event. The labor ledger stays human-initiated, which is what keeps `initiator_user_id` meaningful and keeps a wrong guess from becoming payroll.
- **A person's action is attested, and attestation never blocks it.** Anything that becomes payroll or money — clocking in, switching jobs, submitting a closeout, an admin correction — is confirmed with the device's own biometrics, so the record carries evidence of who was present. The check is OS-mediated and the biometric template never reaches TRADER. Like location above, it is evidence when present rather than a precondition: a failed or unavailable check records a weaker attestation level and writes the event anyway, because a worker who cannot clock in cannot be paid. The web app has no biometric of its own and pushes an approval to the actor's phone instead. Rules in [logic.md](logic.md) `ATTEST-1`–`ATTEST-12`.
- **Sync queue with explicit states.** The UI shows delivery honestly — a worker can see whether the day's closeout reached the office or is still sitting on the phone. The states and the sync triggers are [logic.md](logic.md) `CONFLICT-6`.
- **Conflict resolution: server-authoritative, latest action wins.** Because labor is append-only, true conflicts are rare by construction. Conflict policy lives at the API boundary in one readable handler — deliberately not a database constraint and not a multi-layer locking scheme. This is the one piece of logic worth hand-writing and testing hard; its rules are [logic.md](logic.md) `CONFLICT-1`–`CONFLICT-7`.
- **Immutability on submit.** A submitted day closeout is locked. Corrections are new correcting events, never edits — the historical record is always an accurate account of what was recorded when ([logic.md](logic.md) `CONFLICT-7`).

## 4. Data Model

Design principles: **money-capable now, money-moving later** — amounts, line items, and statuses exist in v1 so the payments phase is additive, not a restructuring. All monetary values are integer minor units (cents) + currency code; never floats. Every tenant-scoped table carries a **`company_id NOT NULL`** (one seeded company row in v1 — the seam for multi-tenancy later; Postgres RLS is deferred until a second tenant onboards). All tables carry `created_at` / `updated_at`.

### v1 tables

- **companies** — one seeded row. Includes `timezone` (drives `work_date` derivation).
- **users** — `company_id`, `clerk_user_id`, `role` (`admin | foreman | worker`), `name`, `phone`, `pay_rate_cents` (nullable, admin-only), `active`.
- **crews**, **crew_members** — group workers under a foreman; kept relational so a worker's crew can change without rewriting history.
- **customers** — `company_id`, `name`, `address`, `phone`, `email`, `notes`. The future client-portal login attaches here.
- **jobs** — `company_id`, `customer_id`, `crew_id` (nullable — the assignment: a worker's "assigned jobs" in §5/§6 are the jobs of the crew they belong to), `address`, `lat`, `lng`, `status` (`scheduled | active | closed | archived`), `scheduled_at`. Jobs are archived, never deleted.
- **work_session_events** — the append-only core. `id` (UUIDv7, client-generated), `company_id`, `worker_id`, `job_id`, `type` (`started | paused | resumed | ended | voided`), `client_timestamp`, `server_timestamp`, `initiator_user_id` (the worker, or an admin making a correction), `device_lat` / `device_lng` / `device_accuracy_m` (all nullable — where the _worker_ was, best-effort; see §3), `payload` (jsonb — includes correction reason where applicable). Never updated, never deleted. Admin corrections are themselves events referencing the original via payload; there is no separate corrections table.
- **materials** — `company_id`, `job_id`, `logged_by_user_id`, `description`, `quantity`, `unit`, `unit_cost_cents` (nullable — field capture is never blocked on cost; admin fills later), `photo_s3_key` (nullable receipt photo), `logged_at`.
- **invoices** — `company_id`, `customer_id`, `job_id`, `invoice_number` (unique per company), `status` (`draft | sent | paid | void`), `issued_at`, `due_at`, `subtotal_cents`, `tax_cents`, `total_cents`, `currency`, `pdf_s3_key`. **The status enum as built cannot express a partly-paid invoice**, which becomes ordinary once customers pay online; Phase 4 replaces the set field with one derived from attached payments ([logic.md](logic.md) `INVOICE-4`). `invoice_number` is likewise allocated at send rather than at draft (`INVOICE-1`) — neither change is made yet.
- **invoice_line_items** — `invoice_id`, `description`, `quantity`, `unit_price_cents`, `line_total_cents`, optional `job_id`/`material_id` source links. Invoices are structured data, not a blob.
- **audit_log** — append-only record of significant writes (who, what, when).

### Arriving with invoicing (designed for, not built)

- **payments** — money in, linked to invoices: `amount_cents`, `method`, `processor_ref`, `status`, `paid_at`. Covers cash and cheque as well as card, so manual and online settlement reconcile through one mechanism ([logic.md](logic.md) `INVOICE-5`).

### Reserved for later (designed for, not built)

- **payouts** — contractor money out; labor and materials tables already hold the cost data. Not in v1: customers pay the contractor directly, so there is nothing for TRADER to disburse.
- **client_portal_access** — a customer login. **Not needed to take payment**: the invoice email carries a processor-hosted payment link, so a customer never needs an account.

Adding these later is new tables referencing existing ones — no restructuring of invoices, customers, jobs, or labor.

## 5. Roles & Permissions

Three roles, enforced server-side at the API layer (client UI also hides what a role can't do, but the server is the gate).

- **Worker** — the field. Records their own labor and materials, sees their own history and the jobs their crew is assigned.
- **Foreman** — a worker who also runs a crew's day: crew labor on their own jobs, and the closeout.
- **Admin** — the office. Roster, pay, customers, jobs, invoices, reconciliation, and corrections.

**The capability matrix is [logic.md](logic.md) `PERM-1`**, which is the enforceable statement of the above.

The boundary that matters most: **no role can mutate a submitted labor record — including admins.** Corrections are always new append-only events ([logic.md](logic.md) `PERM-2`). This is what keeps payroll history trustworthy.

## 6. Core Flows

**Joining.** Admin adds a worker's phone number → the worker gets a single-use invite → opens the app → verifies the number once → **enrols a passkey with Face ID**. From then on, signing in is Face ID and nothing else; the phone number's remaining job is to recover the account when the handset is lost, broken or replaced. A phone too old to hold a passkey signs in by code instead, which is a supported path rather than a failure ([logic.md](logic.md) `AUTH-1`–`AUTH-10`).

**Clock in/out & hours.** Worker opens app → sees today's assigned jobs (local DB, works offline) → taps clock-in → **Face ID** → `started` event written locally with client UUID, timestamp and attestation level; UI immediately shows "on session." Three steps, no typing, and the biometric runs on-device so it works with no signal. Mid-day switch → `ended` on job A, `started` on job B ([logic.md](logic.md) `SESSION-1`, `SESSION-5`). End of day → `ended`. Events queue locally and flush on reconnect ([logic.md](logic.md) `CONFLICT-6`); the server stamps its own timestamps, orders what arrives, and the device pulls back server truth. Sessions and hours are then derived from the event fold — never stored as editable numbers ([logic.md](logic.md) `DERIVE-3`–`DERIVE-6`).

Where arrival detection is running, the geofence prompt **is** this tap rather than a step before it: the notification the worker acts on is the clock-in button, so a proposed clock-in costs the same single gesture as an unprompted one.

**Materials.** Worker or foreman on a job → add material (description, quantity, unit, optional receipt photo) → written locally with a UUID; the record syncs first, the photo uploads to object storage when bandwidth allows — the record is never blocked on the upload. `unit_cost_cents` may be filled by admin later.

**Day closeout.** Foreman (or worker for their own day — final actor ruling due before Phase 3) reviews the day's sessions and materials for a job → sets job status/note → **Face ID** → submits. On submit the closeout locks; any later change is an admin correcting event. The office dashboard reflects the closeout as received.

**Invoices.** Admin (web) → create invoice → attach customer + optional job → line items pulled from that job's labor and materials, copied in as fixed amounts rather than live references → admin enters the tax → totals computed in cents → send. Sending is what allocates the invoice number, renders the PDF to object storage, and emails it to the customer with a payment link.

**Getting paid.** The customer opens the link and pays on the processor's own hosted page, into **the contractor's** account — TRADER never touches the money and never sees a card number. The resulting payment attaches to that invoice; cash and cheque are recorded the same way by the admin. The invoice's state follows the payments attached to it, so a half-paid invoice reads as half-paid rather than as unpaid or settled. Refunds and disputes are handled by the contractor in their processor's dashboard; TRADER shows the outcome ([logic.md](logic.md) `INVOICE-1`–`INVOICE-11`).

**Reconciliation dashboard.** Admin sees a table of jobs/days with state — expected vs. received, still open on a phone, submitted, needs attention — with drill-down into each day's events. This is the office's window into the field, and where corrections are issued.

## 7. Build Phases

Moved to [ROADMAP.md](ROADMAP.md), which owns the build path: phase definitions and
done-criteria, current status, decision gates and their deadlines, and distribution. This
document describes what the system is; the schedule for getting there belongs elsewhere.

The heading is kept so §8 below and the references to it from other files stay valid.

## 8. Risks

- **The sync/conflict handler** is the one piece of genuinely hard logic in v1. Keep it small, at the API boundary, and test the nasty cases hard: duplicate ends, out-of-order arrival, a two-days-offline device flushing a backlog. Budget more time than feels reasonable.
- **The sync layer is entirely ours.** `expo-sqlite` provides storage and Drizzle provides migrations; neither provides sync. The outbox, the pull, retry/backoff and device migrations are all hand-written and hand-tested — the largest single body of work in Phase 1. Re-evaluate PowerSync if it outgrows one person's head or a second company onboards.
- **Offline auth.** A Clerk session expiring in a dead zone must not block clock-in; an offline grace policy is required before Phase 1.
- **Pay-rate history.** A mutable `pay_rate_cents` retroactively corrupts past job costs; effective-dated rates or a rate snapshot at session time must be decided by Phase 2.
- **Cost creep.** Nothing is paid while the stack runs locally; Vercel Pro, Clerk Pro and Neon Launch all begin at the pilot, and Sentry, Inngest and PostHog sit inside free tiers at 30 users but not at scale. Clerk meters SMS one-time-passcodes separately from its user allowance. Current costs and thresholds are tracked in [ACCOUNTS.md](ACCOUNTS.md). Revisit at the second company or the first breached tier.
- **Sales tax is a correctness risk we deliberately do not own.** RI and MA treat painting labor and materials differently, and a wrong rate on a real invoice is the contractor's liability. The admin enters tax per invoice and TRADER only does the arithmetic. Revisit if a contractor asks the app to decide, which is a different product promise.
- **Invoice delivery now depends on email.** An invoice that silently fails to send is worse than one that never went, so delivery state must be visible and the PDF and payment link independently retrievable.
- **Passkeys need real hardware to develop against.** No Expo Go, no Android emulator, iOS 16+ / Android 9+ only. The dev-build requirement lands earlier than it otherwise would, and the phone-OTP fallback must stay working for older handsets rather than rotting untested.
- **Bus factor.** Solo developer; mitigation is a boring stack, clean modules, and documenting the sync handler and conflict policy as they're written — the one part not reconstructable from code alone.

## Revisions

The body above always states current truth. Rationale for each change is in [DECISIONS.md](DECISIONS.md).

- **2026-07-30 (Phase 0 unblocking pass)** — §1 and §2: the database is stated as local Postgres
  through Phase 0 and Neon from the pilot, over one Drizzle API and two drivers. Managed services
  are now described as adopted when they earn their keep rather than up front, so that building
  never waits on a signup.
- **2026-07-29 (v1 scope pass)** — §2: auth becomes passkey-primary with phone recovery; Resend
  moves from "non-critical only" to delivering invoices; Stripe added against the contractor's own
  connected account. §4: `payments` moves from the reserved set to arriving with invoicing, while
  `payouts` and `client_portal_access` stay reserved — a hosted payment link means customers never
  need accounts. The built `invoice_status` enum is noted as unable to express a partly-paid
  invoice. §6 gains the invite-and-enrol flow and an invoicing flow that takes payment. §8 gains
  tax, delivery and passkey-hardware risks. Rules in [logic.md](logic.md) `AUTH-*`, `INVOICE-*`.
- **2026-07-29 (logic pass)** — The numbered rules move to [logic.md](logic.md), which now owns
  them; §3, §5 and §6 cite rather than restate. §3 gains the attestation principle and §6 the
  Face ID step in the clock-in and closeout flows. §5's role bullets shrink to what each role
  _is_, with the capability matrix now `PERM-1`.
- **2026-07-27 (Phase 0)** — Offline layer: WatermelonDB → Drizzle on `expo-sqlite`; the sync
  engine WatermelonDB would have provided is now ours to build (§2, §3, §7, §8). Hosting:
  Railway/Render → the tRPC API runs inside the Next.js deployment on Vercel, removing the
  separate backend host (§1, §2). Data model: `jobs.crew_id` added — §5 and §6 always assumed
  an assignment, and §4 never defined one.
- **2026-07-27 (API pass)** — §2 gains zod as the validation layer and notes superjson on the
  backend row. Both arrived with `packages/api`; see [DECISIONS.md](DECISIONS.md).
- **2026-07-27 (compliance pass)** — §3 and §4: `work_session_events` gains nullable device
  location, captured best-effort and never blocking a clock-in. Account deletion is defined as
  deactivate-and-anonymize rather than erasure, since labor history survives by trigger and by
  statute; see [DECISIONS.md](DECISIONS.md).
- **2026-07-27 (roadmap pass)** — §7's contents moved to [ROADMAP.md](ROADMAP.md), which now
  owns phases, status and gates. The heading remains so §8 keeps its number and existing
  references stay valid.
- **2026-07-27 (accounts pass)** — §2: Doppler dropped, secrets held by each platform;
  file storage returned to undecided; notifications narrowed to Expo push for workers, with
  customer SMS (Twilio) out of v1. §8: cost risk rewritten — Vercel and Neon are paid from
  the start. External services and their costs are now tracked in [ACCOUNTS.md](ACCOUNTS.md).
- **2026-07-03** — Initial canonical specification.
