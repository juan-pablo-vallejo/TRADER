# TRADER: working in this repository

Phone-first time tracking, scheduling and invoicing for a painting contractor. One owner,
Juan Pablo, with Claude Code doing the building. The owner's notebook decides; its typed copy
is `docs/TASKS.md` (the MVP and the list) and `docs/ARCHITECTURE.md` (how it is built and
released). Where the code disagrees with them, the code is wrong: fix it, or stop and ask.

## The loop

1. Read `docs/TASKS.md`. Take the top open item.
2. Build it. Run `pnpm check` until green.
3. Commit locally, each tree green as rule 3 says. Notes in `docs/TASKS.md` ride along.
4. Push a batch: the related items together, once, straight to `main`. Never push to find
   out: a defect seen on staging is first reproduced as a failing local test.
5. Watch `check` and the staging deploy (`gh run watch`). Red: fix it before anything else.
   A batch of only `apps/mobile/` and Markdown deploys nothing, and staging then serves an
   older commit than `main`, by design.
6. See it working: on staging in a browser for the office; on the simulator and the
   emulator for the phone. Collect everything wrong; one follow-up push at most.
7. Tick the items. Next batch.

Done means `check` green on `main`, deployed to staging where the batch deploys, seen working.

## Stop and ask the owner only for

- money or a new service
- a key you don't hold
- a change to the MVP (top of `docs/TASKS.md`) or to the six invariants
  (`docs/ARCHITECTURE.md`)
- anything on Apple, Google or legal text, except the Android SDK's licences
  (`sdkmanager --licenses`), which you accept
- a migration that drops or rewrites data, once production exists

Everything else, decide, and say why in the commit message. While a pull request into
`production` is open, don't push to `main`.

## Never

- merge into `production`, push to it, or use an admin bypass (`--admin`)
- touch a production key, dashboard, resource or store account
- route around a block in `.claude/settings.json`: if a blocked tool is the only way to do
  the task, stop and ask
- read the owner's mail, drive or calendar
- put a credential on the workstation (no sign-in, token, key or `.env` of this Mac's),
  or run there through SSH what `.claude/settings.json` blocks here
- commit a secret: this repository is public

## The owner's sign-ins

The vendor CLIs and plugins on this Mac (Vercel, Neon, Clerk, Expo, Sentry) are signed in as
the owner and reach the whole account, production included once it exists. Read and inspect
through them. Change staging only with staging's own keys in `.env.staging`. Sentry is
read-only for you.

## Rules

1. Scope is the MVP. Nothing outside it is built without the owner's word.
2. The six invariants are never weakened.
3. `main` stays green: `pnpm check` while building, and before every commit CI's own steps
   (`pnpm check:ci`, run by the `verify` skill) green on the exact tree. A green run on the
   workstation counts when the tree committed is exactly the tree it checked. A change to
   the office's sign-in also needs `scripts/staging.sh local` green on that tree, on this
   Mac; a change to the phone, its Maestro suite on the iPhone simulator and
   `trader-ws android`.
4. The clock and sync path gets failure tests: a dropped response, a duplicate send, a wrong
   clock. Everything else gets ordinary tests.
5. Every screen exists in English and Spanish. An invoice to a customer is in English.
6. Versions, prices and platform rules are looked up, never recalled. Next's own, for the
   installed version, are in `apps/web/node_modules/next/dist/docs/`.
7. Commits are as large as the work needs; the message says what changed and why. Signed, no
   trailers.
8. In `docs/TASKS.md`: tick items, add what you find at the bottom, never reorder, never add
   scope.
9. Four documents and no more: `README.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`,
   `docs/TASKS.md`. A gotcha that will bite again is a comment beside the code it concerns.

## Staging is yours

Fictional data only. Reset, reseed or break it without asking. Its keys are in
`.env.staging`, which git ignores. `scripts/staging.sh` uses them without showing them: its
address, its readiness, the smoke test, screenshots of the office to look at, and the
office's sign-in run on this Mac against Clerk's development instance (`local`). Local
development never connects to a deployed database.
