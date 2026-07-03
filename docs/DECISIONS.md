# Decisions

As of 2026-07-03. Full reasoning lives in [SPEC.md](SPEC.md).

## Settled

- MVP is the daily-closeout operating system; the marketplace and AI estimator are later phases, not the wedge.
- Modular monolith: one backend, one Postgres, one deploy target. No microservices.
- Stack: React Native + Expo · Next.js on Vercel · Node.js + TypeScript + tRPC · Drizzle · PostgreSQL on Neon.
- Offline layer: WatermelonDB on SQLite (over PowerSync/Replicache) — no paid sync service; revisit if sync glue outgrows one person or a second company onboards.
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

| Decision | Decide |
|---|---|
| Backend host: Railway vs Render | Phase 0, by deploy ergonomics |
| Offline auth grace policy (Clerk expiry in a dead zone) | before Phase 1 |
| WatermelonDB built-in pull/push sync vs own queue protocol | before Phase 1 |
| Pay-rate history: effective-dated rates vs snapshot-at-session | before Phase 2 |
| Geocoding: Mapbox vs Google (accuracy test on local addresses) | Phase 2 |
| Closeout actor: foreman-only vs worker-own-day | before Phase 3 |
| Language: English-first (i18n from day 1) vs Spanish-first | before pilot |
| Pricing model and unit (per-company / per-user / per-crew) | before first paying customer |
| Pilot success criteria (single canonical set) | before pilot |
| ToS, Privacy Policy, TCPA opt-out for SMS | before pilot |
