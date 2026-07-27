# Decisions

As of 2026-07-27. Full reasoning lives in [SPEC.md](SPEC.md).

This file is the **single canon** for decisions. Where it and SPEC.md disagree, this file wins
and SPEC.md is stale.

## Settled

- MVP is the daily-closeout operating system; the marketplace and AI estimator are later phases, not the wedge.
- Modular monolith: one backend, one Postgres, one deploy target. No microservices.
- Stack: React Native + Expo · Next.js on Vercel · Node.js + TypeScript + tRPC · Drizzle · PostgreSQL on Neon.

### Settled at Phase 0 (2026-07-27)

- **Backend host: the tRPC API runs inside Next.js on Vercel.** No separate backend host —
  this closes the former "Railway vs Render" question by removing it. Mobile calls the same
  route handler as web, so there is one deploy target, one bill, one log stream. Reasoning is
  SPEC §1's own: every additional moving part is something one person must monitor, debug and
  pay for. Revisit only if a workload genuinely needs a long-lived process, and note that
  Inngest already absorbs background jobs.
- **Offline layer: Drizzle + `expo-sqlite`, replacing WatermelonDB.** WatermelonDB has had no
  npm release since 2025-07-24 and no repository commit since 2025-08-11, with ~300 open
  issues. It is slow-moving with a bus factor near one rather than abandoned — Nozbe still
  ships it — but that is not a foundation for the subsystem SPEC §8 calls the one genuinely
  hard piece. Drizzle supports `expo-sqlite` as a first-class target, so device and server use
  one ORM and one migration tool.
- **We now own the sync protocol outright.** Recorded separately because the line above hides
  it: WatermelonDB was not merely a device database, it was the _sync engine_ — `synchronize()`,
  change tracking, pull/push bookkeeping. Drizzle + expo-sqlite provides storage and migrations
  and **no sync**. Phase 1 must therefore scope, build and test: the outbox push, the pull,
  retry/backoff, and device-side migrations. This is defensible — an append-only outbox of
  immutable UUIDv7 events with idempotent server upserts is a narrower problem than generic
  bidirectional sync, and Watermelon's model would have been fought to get these event
  semantics — but it must not be estimated as if a library still did the work.
- **Job assignment: `jobs.crew_id`.** SPEC §5 and §6 promise a worker "sees today's assigned
  jobs" and a foreman closes out "their crew's jobs", but §4 linked jobs to nobody. Assignment
  is at crew level, reusing `crews`/`crew_members`; nullable, since a job may be created before
  it is staffed.
- **Package manager: pnpm**, with `node-linker=hoisted` for Metro compatibility.
- **TypeScript pinned to 5.9.3.** Not 7.x: typescript-eslint does not support TypeScript 7 and
  has deferred it pending the new compiler API. 5.9 is also the best-tested version across the
  Expo/Metro/Next toolchain.
- **User provisioning is just-in-time**, in the tRPC context: a user's first authenticated
  request creates their row, defaulting to `worker`. Admins are promoted deliberately via
  `pnpm db:seed`, never self-service. Clerk webhooks are the eventual path — deferred because
  they need a deployed endpoint plus svix signature verification, which is more moving parts
  than Phase 0 warrants.
- **Append-only is enforced by database trigger**, not convention. The application owns these
  tables, so `REVOKE` cannot bind it; a `BEFORE UPDATE OR DELETE OR TRUNCATE` trigger fires
  regardless of who is asking. TRUNCATE needs its own guard because it bypasses the others.
- Auth: Clerk, phone-based. Email magic links are not a primary auth channel.
- Tenancy: single company in v1 with `company_id NOT NULL` on every tenant-scoped table (one seeded row). No RLS until tenant #2 onboards.
- Worker is an app user (roles: admin, foreman, worker) — supersedes the earlier "no crew accounts" position.
- Invoices (tracking-only, manually marked paid) are in v1; signed PDF estimates are deferred.
- Labor is an append-only event log; conflicts resolved at the API boundary, server-authoritative, latest action by `client_timestamp` wins with server receipt as tiebreaker. Not a DB constraint.
- Corrections are events only — no separate corrections table; no role, including admin, mutates a submitted record.
- Photos in v1 are material/receipt photos via S3 + CloudFront only.
- SMS (Twilio) and push (Expo) are Phase 2+, never week-1.
- Money is integer cents + currency code everywhere; schema is money-capable now, money-moving later.
- Plan against 13–20 weeks solo build, not the nominal 10.

## Open

| Decision                                                       | Decide                       |
| -------------------------------------------------------------- | ---------------------------- |
| Offline auth grace policy (Clerk expiry in a dead zone)        | before Phase 1               |
| Sync protocol shape: pull cursor, batch size, backoff curve    | before Phase 1               |
| Pay-rate history: effective-dated rates vs snapshot-at-session | before Phase 2               |
| Geocoding: Mapbox vs Google (accuracy test on local addresses) | Phase 2                      |
| Closeout actor: foreman-only vs worker-own-day                 | before Phase 3               |
| Language: English-first (i18n from day 1) vs Spanish-first     | before pilot                 |
| Pricing model and unit (per-company / per-user / per-crew)     | before first paying customer |
| Pilot success criteria (single canonical set)                  | before pilot                 |
| ToS, Privacy Policy, TCPA opt-out for SMS                      | before pilot                 |
