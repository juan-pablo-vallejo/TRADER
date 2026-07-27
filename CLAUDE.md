# Working in this repository

## One fact, one home

Every fact has exactly one home. Everything else links to it. Restating a fact elsewhere —
even accurately — creates a second copy that will drift.

| Fact                                                           | Home                                                |
| -------------------------------------------------------------- | --------------------------------------------------- |
| What the system **is**: architecture, stack, data model, flows | `docs/SPEC.md`                                      |
| The build path: phases, status, gates, distribution            | `docs/ROADMAP.md`                                   |
| **Why** it is that way, and when it changed                    | `docs/DECISIONS.md`                                 |
| Developing across machines                                     | `docs/WORKFLOW.md`                                  |
| Running the database                                           | `packages/db/README.md`                             |
| Why one line of code exists                                    | the comment beside it                               |
| Environment variable contract                                  | `.env.example`                                      |
| Real machine addresses, hostnames, users                       | `~/.ssh/config` — **never this repo, it is public** |

`README.md` links; it never restates.

## Before adding a file

Say which fact it owns that no existing file owns. If the answer is "it explains X more
fully," extend X's home instead. This applies to summaries, status sections, and
architecture overviews — those are how duplication usually enters.

Prefer extending a file to adding one. Prefer a comment beside the code to a document
about the code.

## When a decision changes

Update the fact in its home so it is simply correct. Do **not** append a "superseded"
notice to a document whose body still says the old thing — that leaves two truths in one
file. Record the change and its reasoning in `docs/DECISIONS.md`; if the fact lives in
`SPEC.md`, add a line to its Revisions section.

## Root directory

Root is for files their tooling requires to be there. Anything else belongs in `docs/`,
`.github/`, or beside the code it concerns.
