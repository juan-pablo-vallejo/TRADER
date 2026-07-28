# Working in this repository

## Start here

TRADER is phone-first daily closeout and job costing for painting contractors.

[docs/OVERVIEW.md](docs/OVERVIEW.md) has the system diagram and a reading path.
[docs/ROADMAP.md](docs/ROADMAP.md) has current status and what is next — **it is the only
place that does.** Do not restate status here; it has rotted twice already.

The invariants that constrain every change — append-only labor, integer money, the tenancy
seam — are listed with their enforcement in [docs/OVERVIEW.md](docs/OVERVIEW.md), their
reasoning in [docs/DECISIONS.md](docs/DECISIONS.md). **Name them and link; never restate one
in other words** — a second wording becomes a second authority, and then they disagree.

## One fact, one home

Every fact has exactly one home. Everything else links to it. Restating a fact elsewhere —
even accurately — creates a second copy that will drift.

| Fact                                                                 | Home                                                |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| Orientation for a new reader: system diagram, reading path, repo map | `docs/OVERVIEW.md`                                  |
| What the system **is**: architecture, stack, data model, flows       | `docs/SPEC.md`                                      |
| The build path: phases, status, gates, distribution                  | `docs/ROADMAP.md`                                   |
| **Why** it is that way, and when it changed                          | `docs/DECISIONS.md`                                 |
| Developing across machines                                           | `docs/WORKFLOW.md`                                  |
| Running the database                                                 | `packages/db/README.md`                             |
| Why one line of code exists                                          | the comment beside it                               |
| Environment variable contract                                        | `.env.example`                                      |
| Real machine addresses, hostnames, users                             | `~/.ssh/config` — **never this repo, it is public** |

`README.md` links; it never restates.

## Before adding a file

Say which fact it owns that no existing file owns. If the answer is "it explains X more
fully," extend X's home instead — summaries, status sections and architecture overviews are
how duplication usually enters. Prefer extending a file to adding one, and a comment beside
the code to a document about the code.

## When a decision changes

Update the fact in its home so it is simply correct. Do **not** append a "superseded" notice
to a document whose body still says the old thing — that leaves two truths in one file.
Record the change and its reasoning in `docs/DECISIONS.md`; if the fact lives in `SPEC.md`,
add a line to its Revisions section.

## Root directory

Root is for files their tooling requires to be there. Anything else belongs in `docs/`,
`.github/`, or beside the code it concerns.

## How we work

**Verify before asserting.** Versions, prices, platform policy — check, do not recall. Action
pins were two majors stale (`6edb1be`); Google's testing-track policy was misread in a way that
would have distorted the schedule (`af445bb`); a package quarantine window was misjudged by a
day (`750adcf`). All caught by looking.

**A test you have not watched fail proves nothing.** Remove the guard, confirm the suite goes
red, restore it. This caught a money-column test that could not fail (`75ba82e`) and a
regression test that passed for the wrong reason (`a309f46`).

**Reviews are input, not instruction.** Check their premises. Reviews here have claimed files
were missing that existed, prescribed a fix that would have broken three files, and repeated a
refuted claim four times — and one caught a bug that would have demoted the admin on every
login (`a309f46`). Both arrive in the same tone; only checking tells them apart.

**Plan first, and put the plan up for review rather than the code.** Say what you did not do —
an honest gap is worth more than a claim that does not hold.

## Traps

Each has cost real time. One line and a pointer; the detail lives at the code.

- **`seed.ts` writes `role` in its upsert.** Legitimate there; copied into a request path it
  rewrites `role` and `active` on every sign-in. See `packages/api/src/context.ts`.
- **`id` comes from Drizzle's `$defaultFn`, not a database default.** Raw SQL inserts hit a
  NOT NULL violation; insert fixtures through Drizzle. See `packages/db/src/schema/_shared.ts`.
- **You cannot bulk-delete users or companies**, in tests or anywhere — `work_session_events`
  references them and is append-only by trigger. See `packages/api/test/helpers.ts` for the
  empty-schema probe used instead.
- **pnpm quarantines packages published within the last 24 hours.** A brand-new dependency
  fails `--frozen-lockfile` with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`. A supply-chain
  defence working as intended — wait it out, do not disable it.
- **`@types/node` tracks the Node runtime, not the newest release.** Change `node-version` and
  `engines` first. See `.github/dependabot.yml`.
- **The `gh` token has no `workflow` scope**, so pull requests touching `.github/workflows/`
  cannot be merged through the API. Push over SSH, or
  `gh auth refresh -h github.com -s workflow`.
- **The Neon driver cannot reach local Postgres.** `USE_LOCAL_POSTGRES=true` routes to
  `node-postgres`; tests need `pnpm db:up && pnpm db:migrate` — [packages/db/README.md](packages/db/README.md).

## Conventions for this file

Keep it under 100 lines — read in full every session, so accretion is the failure mode.
Changes here go through the same review pass as a plan: this is the only file whose errors
compound, a wrong sentence propagating invisibly into every plan written afterwards.
