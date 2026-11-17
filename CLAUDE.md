# Working in this repository

TRADER is phone-first daily closeout and job costing for painting contractors, built by one
person with Claude Code as the executing agent. This file loads every session; the two imports
below are the rules you work under and the memory you continue from.

@docs/RULES.md
@docs/MEMORY.md

## Authority

`docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md` and `docs/RULES.md` are decided.
`docs/TASKS.md` is the order. Code conforms to them; when code and a document disagree, say so
and stop — never edit the document to match the code.

## Every session

1. Start from MEMORY.md, then read TASKS.md. Work the named task or the next unchecked one.
2. Plan first, then wait, for anything touching schema, auth, sync, money or CI; a Release
   0.1 track line is planned in its pull request and worked (RULES, Session protocol).
3. `pnpm check` before every commit.
4. One change per commit; imperative subject ≤ 72 characters; no trailers. Push the feature
   branch, open or update its pull request, report it and stop — the owner merges; never push
   to `main`.
5. End by ticking TASKS.md and appending a MEMORY.md entry in its format.

## Never

- Commit a secret, a hostname or a machine address. This repository is public.
- Add a dependency, tool or version bump without a TASKS.md line naming its consumer.
- Force-push, delete a branch a merge did not retire, rewrite history, or touch
  `archive/pre-rebuild`.
- Merge a pull request, into `main` or `production`. Every merge is the owner's.
- Send an approval code to the promotion workflow. Migrations it withholds are the owner's.
- Touch production: its branch, credentials, variables, deployments, migrations, data,
  store releases or permissions are the owner's. A release is a pull request you may
  prepare and never merge. Staging is yours within RULES.md, Toolbox; a destructive
  step there, a fixture's cleanup included, is approved one at a time.
- Add a document. The set is fixed in RULES.md; extend the owner instead.
- State a version, price or platform policy from memory. Look it up.

## This file

Short, read in full every session. Changes here go through the same plan-and-review as code.
