# Overview

Orientation for anyone evaluating this project — a collaborator, a reviewer, or a future
maintainer. **Start here, then follow the reading path.**

This file owns orientation only: how the pieces fit, where things live, and what to read in
what order. It points rather than restates.

## What TRADER is

Phone-first daily closeout and job costing for painting contractors. Field activity — labor,
materials, job progress — is captured on the phone at the end of each workday, offline if
necessary, so the office has a usable record for payroll, job costing and billing.

The governing constraint is that **the field client must work with no signal.** A foreman in
a basement clocks in, switches jobs, logs materials and closes out; it syncs hours later
without loss or duplication. Everything in the architecture follows from that.

## The system at a glance

```mermaid
flowchart LR
  subgraph field ["Field — offline-first"]
    M["Mobile<br/>React Native · Expo"]
    LS[("expo-sqlite<br/>local store + outbox")]
    M <--> LS
  end

  subgraph vercel ["Vercel — one deployment"]
    W["Web app<br/>Next.js"]
    API["tRPC API<br/>route handler"]
  end

  DB[("Postgres · Neon<br/>system of record")]
  AUTH["Clerk<br/>phone auth"]

  M -->|"sync: outbox push / pull<br/>client UUIDv7, idempotent"| API
  W --> API
  API --> DB
  AUTH -.-> M
  AUTH -.-> W
  AUTH -.-> API
```

[SPEC.md](SPEC.md) §1–§2 own this architecture; the diagram depicts it, and §2 is the
complete stack. Deliberately not drawn — peripheral to the request and sync paths shown
here — are observability, file storage, background jobs, secrets and notifications.

Four pieces, one deploy target. The web app and the API ship as a single Vercel deployment;
both clients call the same typed tRPC router, so a signature change breaks compilation on
both rather than failing at runtime.

The server is authoritative. Clients never argue with it — they send append-only events
stamped with client-generated UUIDv7s, the server upserts idempotently, and losing devices
snap to server truth on the next sync.

## What exists today

`packages/db` — the Postgres schema, migrations, the triggers enforcing append-only labor —
and `packages/api`, the tRPC router with just-in-time user provisioning and role gates. Both
applications and the sync layer are unwritten, and the sync layer is the largest single risk,
since `expo-sqlite` and Drizzle supply storage and migrations but no sync.

Current status and what each phase is gated on → [ROADMAP.md](ROADMAP.md). Open decisions →
[DECISIONS.md](DECISIONS.md).

## Repository map

| Path            | What it is                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/db/`  | Schema, migrations, seed, invariant tests. Has its own [README](../packages/db/README.md)                   |
| `packages/api/` | tRPC routers, request context, role gates. Exports `AppRouter` — the contract both clients import as a type |
| `docs/`         | The documents in the reading path below                                                                     |
| `CLAUDE.md`     | The one-fact-one-home rule this repository is maintained under                                              |

`apps/` appears as its phase lands; see [ROADMAP.md](ROADMAP.md).

## Reading path

1. **This file** — orientation.
2. **[SPEC.md](SPEC.md)** — what the system is. Read §3 (offline and sync) and §4 (data
   model) closely; they carry the design.
3. **[ROADMAP.md](ROADMAP.md)** — where it is going, what is done, and what each phase is
   gated on.
4. **[DECISIONS.md](DECISIONS.md)** — why. Read this before proposing a change; most obvious
   suggestions have already been considered and recorded, including the ones that were
   reversed.
5. **[packages/db/README.md](../packages/db/README.md)** — how to run it locally.

[WORKFLOW.md](WORKFLOW.md) and [ACCOUNTS.md](ACCOUNTS.md) are operational — machine setup and
external services. Skip them until you need to run or deploy something.

## Invariants you must not break

Three things are enforced mechanically rather than by convention. Each is tested; if a test
fails, the change is wrong, not the test.

| Invariant                                                                                                                                     | Enforced in                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Labor history is immutable.** `work_session_events` rejects UPDATE, DELETE and TRUNCATE — including for admins. Corrections are new events. | `packages/db/migrations/0001_append_only_guard.sql`, asserted in `packages/db/test/schema-invariants.test.ts` |
| **Money is integer cents, never floating point.**                                                                                             | `packages/db/test/schema-invariants.test.ts`                                                                  |
| **Every tenant-scoped table carries a non-nullable `company_id`** — the seam multi-tenancy attaches to later.                                 | `packages/db/test/schema-invariants.test.ts`                                                                  |

The reasoning for all three is in [DECISIONS.md](DECISIONS.md).
