# TRADER — Technical Specification

Canonical as of 2026-07-03. Supersedes all prior spec documents. Settled and open decisions are tracked in [DECISIONS.md](DECISIONS.md).

> **Superseded in part, 2026-07-27 (Phase 0).** Three choices below have been revised;
> [DECISIONS.md](DECISIONS.md) is the canon where the two disagree.
>
> - **Offline layer:** WatermelonDB → **Drizzle + `expo-sqlite`** (§2, §8). WatermelonDB is
>   dormant. Consequence: it was also the _sync engine_, so §3's queue is now **ours to build**.
> - **Backend hosting:** Railway/Render → **tRPC inside Next.js on Vercel** (§1, §2). One
>   deploy target rather than two.
> - **Job assignment:** §4 gains **`jobs.crew_id`**, which §5 and §6 assumed but never defined.

## 1. Architecture

Four pieces: a mobile app for the field, a web app for the office, one backend API, one Postgres database. Single backend, single database, single deploy target — a **modular monolith**: one codebase, one process, clean internal module boundaries, no microservices. For a solo-maintained system, every additional moving part is something one person must monitor, debug, and pay for; at pilot scale (~30 users), stability comes from having fewer things that can break.

- **Mobile (field):** React Native + Expo. Fully offline-capable; owns a local database and treats the network as optional.
- **Web (office):** Next.js — roster, dashboards, invoices, customer records. Online-first; the office has real connectivity.
- **Backend:** Node.js + TypeScript, one typed API (tRPC) shared by both clients. The server is the single source of truth: it accepts append-only events from clients, orders them, and resolves conflicts. Clients never argue with the server; they snap to its truth.
- **Database:** PostgreSQL, managed (Neon).
- **Hosting:** a single managed app platform (Railway or Render — decided at Phase 0).

Deliberate maintainability-over-scale choices: monolith over services; managed Postgres over self-hosted; one API layer over per-client endpoints; hosted background jobs over self-run queue/Redis. None of these bottleneck at 30 users, and each removes an ops responsibility.

## 2. Tech Stack

| Layer                  | Choice                                                                      | Why                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Mobile                 | React Native + Expo (EAS)                                                   | One codebase for iOS+Android; OTA updates, managed builds, push without touching Xcode/Gradle internals              |
| Local mobile DB + sync | WatermelonDB on SQLite                                                      | A library owned and run for free — no paid sync service, no sync server to keep alive                                |
| Web                    | Next.js on Vercel                                                           | Admin panel, marketing page, and future public pages in one framework; deploys on git push                           |
| Backend                | Node.js + TypeScript + tRPC                                                 | End-to-end type safety from DB to both clients, no schema-generation step, zero client/server drift                  |
| ORM                    | Drizzle                                                                     | Thin, SQL-shaped, TypeScript-native; first-class migrations, no heavy runtime                                        |
| Database               | PostgreSQL on Neon                                                          | Serverless, branching for safe migration testing, automatic backups                                                  |
| Auth                   | Clerk, phone-based                                                          | Never hand-build auth solo. Phone login fits field workers; email magic links are explicitly not the primary channel |
| Backend hosting        | Railway or Render                                                           | "Git push and it runs," managed logs/metrics/rollbacks; decided at Phase 0                                           |
| Background jobs        | Inngest                                                                     | Hosted; no Redis to run or monitor; handles retries/scheduling                                                       |
| File storage           | S3 + CloudFront                                                             | Material/receipt photos, invoice PDFs                                                                                |
| Observability          | Sentry (errors), PostHog (product analytics)                                | Hosted, free-tier-friendly                                                                                           |
| Secrets                | Doppler                                                                     | Hosted secret management                                                                                             |
| Notifications          | Twilio SMS (workflow-critical), Expo push, Resend email (non-critical only) | Wired in Phase 2+, never as the auth channel of record                                                               |

## 3. Offline & Sync

Governing principle: **the field client is offline-first and the server is authoritative.** A foreman in a basement with no signal must be able to clock in, switch jobs, log materials, and close out — and have all of it sync correctly hours later without loss or duplication.

- **Local-first writes.** Every field action writes immediately to on-device SQLite (WatermelonDB); the UI updates from local state. The network is never on the critical path of a user action.
- **Client-generated UUIDs + idempotency.** Every client-created record gets a UUIDv7 (time-sortable) generated on the device. The server upserts by that UUID: a duplicate insert is a no-op returning success. A flaky connection can retry the same write ten times; the server records it once.
- **Append-only event log for labor.** Time tracking is an immutable stream of events — `started`, `paused`, `resumed`, `ended`, `voided` — each stamped with a client timestamp (when it happened on the device) and a server timestamp (when it arrived). A worker's current session is a derived view computed by folding the events, never a mutable row. Events can arrive late, out of order, and in batches; the server still reconstructs the correct timeline.
- **`work_date` is derived, not entered.** Computed server-side from the clock-in timestamp in the company timezone (`companies.timezone`). Never user-editable.
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
- **jobs** — `company_id`, `customer_id`, `address`, `lat`, `lng`, `status` (`scheduled | active | closed | archived`), `scheduled_at`. Jobs are archived, never deleted.
- **work_session_events** — the append-only core. `id` (UUIDv7, client-generated), `company_id`, `worker_id`, `job_id`, `type` (`started | paused | resumed | ended | voided`), `client_timestamp`, `server_timestamp`, `initiator_user_id` (the worker, or an admin making a correction), `payload` (jsonb — includes correction reason where applicable). Never updated, never deleted. Admin corrections are themselves events referencing the original via payload; there is no separate corrections table.
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

**Materials.** Worker or foreman on a job → add material (description, quantity, unit, optional receipt photo) → written locally with a UUID; the record syncs first, the photo uploads to S3 when bandwidth allows — the record is never blocked on the upload. `unit_cost_cents` may be filled by admin later.

**Day closeout.** Foreman (or worker for their own day — final actor ruling due before Phase 3) reviews the day's sessions and materials for a job → sets job status/note → submits. On submit the closeout locks; any later change is an admin correcting event. The office dashboard reflects the closeout as received.

**Invoices.** Admin (web) → create invoice → attach customer + optional job → add line items manually or pulled from the job's labor and materials costs → totals computed in cents → draft → PDF to S3 → mark sent. When the customer pays by check/cash, admin marks it paid manually. When the payments phase arrives, a payment row attaches to this exact invoice and flips its status automatically.

**Reconciliation dashboard.** Admin sees a table of jobs/days with state — expected vs. received, still open on a phone, submitted, needs attention — with drill-down into each day's events. This is the office's window into the field, and where corrections are issued.

## 7. Build Phases

Each phase is independently shippable and usable on a real job. Ship phase N before building phase N+1. Planning horizon: 13–20 weeks solo (the nominal 10-week estimate did not survive adversarial review).

- **Phase 0 — Foundation.** Repo, TypeScript monorepo (mobile + web + shared types), Drizzle schema for core tables, Neon database, Clerk wired, one deployed backend, Sentry on. _Done when an admin can log in on web and a worker on mobile against the real deployed stack._
- **Phase 1 — Offline clock in/out.** WatermelonDB local store, append-only event model, client UUIDs, sync queue with visible status, the server-authoritative conflict handler, derived-session computation. _Done when a worker tracks a real day's hours across spotty connectivity and the office sees correct, deduplicated hours per job._ Everything else is additive on top of a working sync core.
- **Phase 2 — Jobs, roster, materials.** Roster management (invite/deactivate, pay rates), job CRUD with customers, material logging with photo upload. _Done when an admin can set up people and jobs and the field logs materials alongside hours._
- **Phase 3 — Closeout & reconciliation.** Day-close lock, admin correcting entries, reconciliation table with drill-down, job-cost-to-date (labor + materials cents per job). _Done when a foreman closes out a day, it locks, the office sees it, and a correction is issued without mutating history._
- **Phase 4 — Invoices.** Invoice + line-item CRUD, PDF generation to S3, manual sent/paid, pull labor/material costs into line items. _Done when an admin issues an invoice from a completed job's data and tracks it to paid._
- **Phase 5 — Payments (future).** Client portal, real payment capture, contractor payouts. Trigger: a customer asks to pay online, or a paying contractor base needs payouts. Not before.

## 8. Risks

- **The sync/conflict handler** is the one piece of genuinely hard logic in v1. Keep it small, at the API boundary, and test the nasty cases hard: duplicate ends, out-of-order arrival, a two-days-offline device flushing a backlog. Budget more time than feels reasonable.
- **WatermelonDB is a "you own it" choice.** The trade for avoiding a paid sync service is writing the sync glue yourself. Re-evaluate PowerSync if the sync logic outgrows one person's head or a second company onboards.
- **Offline auth.** A Clerk session expiring in a dead zone must not block clock-in; an offline grace policy is required before Phase 1.
- **Pay-rate history.** A mutable `pay_rate_cents` retroactively corrupts past job costs; effective-dated rates or a rate snapshot at session time must be decided by Phase 2.
- **Cost creep.** Neon, Clerk, Twilio, Inngest, Sentry, PostHog are free-tier at 30 users but not at scale. Revisit at the second company or the first breached tier.
- **Bus factor.** Solo developer; mitigation is a boring stack, clean modules, and documenting the sync handler and conflict policy as they're written — the one part not reconstructable from code alone.
