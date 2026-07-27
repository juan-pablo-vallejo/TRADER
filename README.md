# TRADER

Phone-first daily closeout and job costing for painting contractors, by JPTEQ LLC.

Small painting contractors lose margin because field activity — labor, materials, job progress — lives in texts, calls, and memory until someone reconstructs it days later. TRADER captures it at the end of each workday, on the phone, offline if necessary, so the office always has a usable record for payroll, job costing, and billing.

## Status

Pre-build. The technical specification is complete and the first pilot is committed with a painting contractor in RI/MA. Build phases are defined in the spec.

## Documentation

| Document | Purpose |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | Canonical technical specification: architecture, stack, offline sync, data model, flows, build phases |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Settled decisions and the open list |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Development workflow: machine roles, connecting, where work happens |

## Stack at a glance

React Native + Expo (mobile, offline-first) · Next.js (web admin) · Node.js + TypeScript + tRPC · PostgreSQL on Neon · Drizzle · WatermelonDB · Clerk (phone auth) · S3 + CloudFront.

## License

© 2026 JPTEQ LLC. All rights reserved. This repository is public for transparency; no license to use, copy, or redistribute its contents is granted. See [LICENSE](LICENSE).
