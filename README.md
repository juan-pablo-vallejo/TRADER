# TRADER

Phone-first daily closeout and job costing for painting contractors, by JPTEQ LLC.

Small painting contractors lose margin because field activity — labor, materials, job progress — lives in texts, calls, and memory until someone reconstructs it days later. TRADER captures it at the end of each workday, on the phone, offline if necessary, so the office always has a usable record for payroll, job costing, and billing.

In build. The first pilot is committed with a painting contractor in RI/MA. Current status,
phases and their done-criteria are in [ROADMAP.md](docs/ROADMAP.md).

## Documentation

Each fact has one home. This README links; it does not restate.
**New here? Start with [docs/OVERVIEW.md](docs/OVERVIEW.md).**

| Document                                       | Owns                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [docs/OVERVIEW.md](docs/OVERVIEW.md)           | Orientation — system diagram, reading path, repository map                                                       |
| [docs/SPEC.md](docs/SPEC.md)                   | What the system **is** — architecture, stack, offline sync, data model, flows                                    |
| [docs/logic.md](docs/LOGIC.md)                 | The numbered rules it must obey — joining, sessions, derivations, conflicts, permissions, attestation, invoicing |
| [docs/ROADMAP.md](docs/ROADMAP.md)             | The build path — phases, current status, decision gates, distribution                                            |
| [docs/DECISIONS.md](docs/DECISIONS.md)         | **Why**, and when it changed. Settled decisions and the open list                                                |
| [docs/WORKFLOW.md](docs/WORKFLOW.md)           | Developing across machines                                                                                       |
| [docs/ACCOUNTS.md](docs/ACCOUNTS.md)           | External services: which, when needed, what they cost, whether we have them                                      |
| [docs/WORKLOG.md](docs/WORKLOG.md)             | What happened, including work that produced no commit. Historical only — current state lives in ROADMAP          |
| [packages/db/README.md](packages/db/README.md) | Running the database: migrations, seeding, local Postgres                                                        |

## License

© 2026 JPTEQ LLC. All rights reserved. This repository is public for transparency; no license to use, copy, or redistribute its contents is granted. See [LICENSE](LICENSE).
