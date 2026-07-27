# TRADER — Technical Specification

Canonical as of 2026-07-27. This document states what the system **is**; _why_ each choice was made, and when it changed, lives in [DECISIONS.md](DECISIONS.md). Revisions are listed at the end.

## 1. Architecture

Four pieces: a mobile app for the field, a web app for the office, one backend API, one Postgres database. Single backend, single database, single deploy target — a **modular monolith**: one codebase, one process, clean internal module boundaries, no microservices. For a solo-maintained system, every additional moving part is something one person must monitor, debug, and pay for; at pilot scale (~30 users), stability comes from having fewer things that can break.

- **Mobile (field):** React Native + Expo. Fully offline-capable; owns a local database and treats the network as optional.
- **Web (office):** Next.js — roster, dashboards, invoices, customer records. Online-first; the office has real connectivity.
- **Backend:** Node.js + TypeScript, one typed API (tRPC) shared by both clients. The server is the single source of truth: it accepts append-only events from clients, orders them, and resolves conflicts. Clients never argue with the server; they snap to its truth.
- **Database:** PostgreSQL, managed (Neon).
- **Hosting:** Vercel. The Next.js deployment serves the office web app _and_ hosts the tRPC API that both clients call — one deploy target, not two.

Deliberate maintainability-over-scale choices: monolith over services; managed Postgres over self-hosted; one API layer over per-client endpoints; hosted background jobs over self-run queue/Redis. None of these bottleneck at 30 users, and each removes an ops responsibility.

## 2. Tech Stack

| Layer             | Choice                                                            | Why                                                                                                                     |
| ----------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Mobile            | React Native + Expo (EAS)                                         | One codebase for iOS+Android; OTA updates, managed builds, push without touching Xcode/Gradle internals                 |
| Local mobile DB   | Drizzle on `expo-sqlite`                                          | Same ORM and migration tool as the server; actively maintained. Provides storage only — **the sync layer is ours** (§3) |
| Web + API hosting | Next.js on Vercel                                                 | Admin panel and the tRPC API in one deployment; one bill, one log stream; deploys on git push                           |
| Backend           | Node.js + TypeScript + tRPC                                       | End-to-end type safety from DB to both clients, no schema-generation step, zero client/server drift                     |
| ORM               | Drizzle                                                           | Thin, SQL-shaped, TypeScript-native; first-class migrations, no heavy runtime                                           |
| Database          | PostgreSQL on Neon                                                | Serverless, branching for safe migration testing, automatic backups                                                     |
| Auth              | Clerk, phone-based                                                | Never hand-build auth solo. Phone login fits field workers; email magic links are explicitly not the primary channel    |
| Background jobs   | Inngest                                                           | Hosted; no Redis to run or monitor; handles retries/scheduling                                                          |
| File storage      | Undecided — S3+CloudFront, Vercel Blob or Cloudflare R2           | Material/receipt photos, invoice PDFs. Decided at Phase 2, when the real access pattern is known                        |
| Observability     | Sentry (errors), PostHog (product analytics)                      | Hosted, free-tier-friendly                                                                                              |
| Secrets           | Vercel environment variables, EAS secrets, GitHub Actions secrets | Each platform holds the secrets it needs; no separate secret-management service                                         |
| Notifications     | Expo push (workers), Resend email (non-critical only)             | Wired in Phase 2+, never as the auth channel of record. Customer-facing SMS is out of v1                                |

## 3. Offline & Sync

Governing principle: **the field client is offline-first and the server is authoritative.** A foreman in a basement with no signal must be able to clock in, switch jobs, log materials, and close out — and have all of it sync correctly hours later without loss or duplication.

- **Local-first writes.** Every field action writes immediately to on-device SQLite (`expo-sqlite`, via Drizzle); the UI updates from local state. The network is never on the critical path of a user action.
- **Client-generated UUIDs + idempotency.** Every client-created record gets a UUIDv7 (time-sortable) generated on the device. The server upserts by that UUID: a duplicate insert is a no-op returning success. A flaky connection can retry the same write ten times; the server records it once.
- **Append-only event log for labor.** Time tracking is an immutable stream of events — `started`, `paused`, `resumed`, `ended`, `voided` — each stamped with a client timestamp (when it happened on the device) and a server timestamp (when it arrived). A worker's current session is a derived view computed by folding the events, never a mutable row. Events can arrive late, out of order, and in batches; the server still reconstructs the correct timeline.
- **`work_date` is derived, not entered.** Computed server-side from the clock-in timestamp in the company timezone (`companies.timezone`). Never user-editable.
- **Device location is best-effort and never blocks.** Each event may carry the device's position, captured on a short timeout. If no fix arrives — and in the basement above, none will — the fields stay null and the event is written regardless. Location is evidence when present, never a precondition for recording work.
- **Sync queue with explicit states.** Each local record carries `pending → syncing → synced` (or `failed → retry`). The UI shows this honestly — a worker can see whether the day's closeout reached the office or is still on the phone. Sync runs on reconnect, on app foreground, and on a timer, oldest-first.
- **Conflict resolution: server-authoritative, latest action wins.** Because labor is append-only, true conflicts are rare by construction. When they occur (e.g., two devices both end the same session), the latest legitimate action wins, **ordered by client event time (`client_timestamp`), with server receipt order as tiebreaker and sanity bound** — an offline 3pm clock-out that syncs at 6pm beats a 2pm event. The losing device snaps to server truth on next sync. Conflict policy lives at the API boundary in one readable handler — deliberately not a database constraint and not a multi-layer locking scheme. This is the one piece of logic worth hand-writing and testing hard.
- **Immutability on submit.** A submitted day closeout is locked. Corrections are new correcting events, never edits — the historical record is always an accurate account of what was recorded when.

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
- **invoices** — `company_id`, `customer_id`, `job_id`, `invoice_number` (unique per company), `status` (`draft | sent | paid | void` — `paid` set manually in v1), `issued_at`, `due_at`, `subtotal_cents`, `tax_cents`, `total_cents`, `currency`, `pdf_s3_key`. A tracking record in v1, already shaped for real payments.
- **invoice_line_items** — `invoice_id`, `description`, `quantity`, `unit_price_cents`, `line_total_cents`, optional `job_id`/`material_id` source links. Invoices are structured data, not a blob.
- **audit_log** — append-only record of significant writes (who, what, when).

### Reserved for the payments phase (designed for, not built)

- **payments** — money in, linked to invoices: `amount_cents`, `method`, `processor_ref`, `status`, `paid_at`.
- **payouts** — contractor money out; labor and materials tables already hold the cost data.
- **client_portal_access** — customer login to view/pay invoices; `customers` and `invoices` are already shaped for it.

Adding payments later is new tables referencing existing ones — no restructuring of invoices, customers, jobs, or labor.

## 5. Roles & Permissions

Three roles, enforced server-side at the API layer (client UI also hides what a role can't do, but the server is the gate).

- **Worker** — clock self in/out, switch jobs, pause/resume, log materials on assigned jobs, view own sessions and assigned jobs. Cannot see others' pay, edit submitted records, or touch invoices/customers/roster.
- **Foreman** — everything a worker can do, plus: view and close out the day for their crew's jobs, see crew labor on their jobs, log materials on any of their jobs. Cannot manage roster, pay rates, invoices, or customers (read-only on their jobs' customers).
- **Admin** — full access: roster CRUD, pay rates, customers, jobs, invoices, the reconciliation dashboard, and correcting entries against submitted labor.

The boundary that matters most: **no role can mutate a submitted labor record — including admins.** Corrections are always new append-only events. This is what keeps payroll history trustworthy.

## 6. Core Flows

**Clock in/out & hours.** Worker opens app → sees today's assigned jobs (local DB, works offline) → taps clock-in → `started` event written locally with client UUID and timestamp; UI immediately shows "on session." Mid-day switch → `ended` on job A, `started` on job B (one open session per worker, enforced in the API handler). End of day → `ended`. Events queue locally as `pending`; on reconnect the queue flushes oldest-first, the server upserts idempotently, stamps server timestamps, orders events, and the device pulls back server truth. Derived sessions and hours are computed server-side from the event fold.

**Materials.** Worker or foreman on a job → add material (description, quantity, unit, optional receipt photo) → written locally with a UUID; the record syncs first, the photo uploads to object storage when bandwidth allows — the record is never blocked on the upload. `unit_cost_cents` may be filled by admin later.

**Day closeout.** Foreman (or worker for their own day — final actor ruling due before Phase 3) reviews the day's sessions and materials for a job → sets job status/note → submits. On submit the closeout locks; any later change is an admin correcting event. The office dashboard reflects the closeout as received.

**Invoices.** Admin (web) → create invoice → attach customer + optional job → add line items manually or pulled from the job's labor and materials costs → totals computed in cents → draft → PDF to object storage → mark sent. When the customer pays by check/cash, admin marks it paid manually. When the payments phase arrives, a payment row attaches to this exact invoice and flips its status automatically.

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
- **Cost creep.** Vercel Pro and Neon Launch are paid from the start; Clerk, Sentry, Inngest and PostHog sit inside free tiers at 30 users but not at scale, and Clerk meters SMS one-time-passcodes separately from its user allowance. Current costs and thresholds are tracked in [ACCOUNTS.md](ACCOUNTS.md). Revisit at the second company or the first breached tier.
- **Bus factor.** Solo developer; mitigation is a boring stack, clean modules, and documenting the sync handler and conflict policy as they're written — the one part not reconstructable from code alone.

## Revisions

The body above always states current truth. Rationale for each change is in [DECISIONS.md](DECISIONS.md).

- **2026-07-27 (Phase 0)** — Offline layer: WatermelonDB → Drizzle on `expo-sqlite`; the sync
  engine WatermelonDB would have provided is now ours to build (§2, §3, §7, §8). Hosting:
  Railway/Render → the tRPC API runs inside the Next.js deployment on Vercel, removing the
  separate backend host (§1, §2). Data model: `jobs.crew_id` added — §5 and §6 always assumed
  an assignment, and §4 never defined one.
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
