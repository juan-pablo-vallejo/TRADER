# TRADER: working in this repository

What TRADER is: the MVP's one sentence, at the top of `docs/TASKS.md`. One owner, Juan Pablo,
with Claude Code doing the building. Four documents decide, and a decision counts once it is
written in one of them: `docs/TASKS.md` (the MVP and the open work), `docs/ARCHITECTURE.md`
(how it is built and released), `README.md` (how it is run) and this file. Where the code
disagrees with them, the code is wrong: fix it, or stop and ask.

## The loop

1. Read `docs/TASKS.md`. Take the top open item.
2. Build it. Run `pnpm check:fast` until green, never piped.
3. Commit locally, each tree green as rule 3 says. A finding rides along as rule 8 says.
4. Push a batch: the related items together, once, straight to `main`, its tip checked as
   rule 3 says. Never push to find out: a defect seen on staging is first reproduced as a
   failing local test.
5. Watch `check` and the staging deploy in the background
   (`gh run watch <id> --exit-status`) and carry on locally with the next item; read the
   result before the next push. Red: fix it before anything else, and push nothing else
   while `main` is red. A batch of only `apps/mobile/` and Markdown deploys nothing, and
   staging then serves an older commit than `main`, by design.
6. See it working: on staging in a browser for the office; for the phone, the flows of what
   changed (`apps/mobile/.maestro/affected.sh`) on the simulator, and on the emulator when
   it says Android. Collect everything wrong; one follow-up push at most.
7. Finish the batch with one commit of Markdown alone, pushed alone. It deletes the batch's
   items from `docs/TASKS.md`; its message says what was seen, where and at which commit,
   each on a line that begins "Seen", and the reviewers' running total. Next batch.

Done means `check` green on `main`, deployed to staging where the batch deploys, seen working.

## Stop and ask the owner only for

- money or a new service
- a key you don't hold
- a change to the MVP (top of `docs/TASKS.md`) or to the six invariants
  (`docs/ARCHITECTURE.md`)
- anything on Apple, Google or legal text, except the Android SDK's licences
  (`sdkmanager --licenses`), which you accept
- a migration that drops or rewrites data, once production's database exists

Everything else, decide, and say why in the commit message.

## Never

- merge into `production`, push to it, or use an admin bypass (`--admin`)
- push to `main` while a pull request into `production` is open
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
through them. Change staging only with staging's own keys (Staging is yours). Sentry is
read-only for you.

## Rules

1. Scope is the MVP. Nothing outside it is built without the owner's word.
2. The six invariants are never weakened.
3. `main` stays green. Before every push one command is green on the exact tree of the
   pushed tip: `scripts/trader-ws check`, `--local` on this Mac; the pre-push hook refuses a
   tip without it. Each commit before it runs `pnpm check:fast`, which checks what changed
   since `origin/main`. A commit that changes Markdown alone needs neither. A green run on
   the workstation counts when the tree pushed is exactly the tree it checked. A change to
   the office's sign-in also needs its suite against Clerk's development instance green on
   that tree, on this Mac. A batch runs the tests and flows of what changed: the phone's are
   the ones `apps/mobile/.maestro/affected.sh` names, on the iPhone, and on Android only
   when it says the change touches Android's code. The office's browser suite, both phone
   suites and the whole layout sweep run once, before a release's merge, on the tree it
   ships. A batch that changes the sync path is simplified once and reviewed once by agents
   that did not write it; the rest of the server is, once a release, over the release's
   diff (the `backend-change` skill names the path). A batch that changes what a person sees is
   seen rendered in both languages (the `interface-change` skill); the screens a release
   changes are reviewed once, on Fable, by an agent that did not build them, before its
   merge (the `release` skill). A batch that changes comments alone runs neither: a check
   that no code token changed, the files compared with their comments stripped, is pasted
   in its commit message.
4. The clock and sync path gets failure tests: a dropped response, a duplicate send, a wrong
   clock. Everything else gets ordinary tests.
5. Every screen exists in English and Spanish. Spanish addresses the reader as tú. An
   invoice to a customer is in English.
6. Versions, prices and platform rules are looked up, never recalled. Next's own, for the
   installed version, are in `apps/web/node_modules/next/dist/docs/`. A looked-up fact keeps
   its source and the day it was read, as in "(Apple's page, read 2026-11-18)": the only
   date in a document or a comment.
7. Commits are as large as the work needs; the message says what changed and why. Signed, no
   trailers. A decision's date and reason, whose word it was and what it replaced live in
   the message alone; documents and comments say what is, and why where it explains a rule.
8. In `docs/TASKS.md`: the commit that finishes an item deletes it. A finding becomes an
   item at the end of Claude's part, a comment beside its code, or nothing, in the same
   push. An item is known by its bold title; nothing cites a number. Never reorder, never
   add scope.
9. Four documents and no more: `README.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`,
   `docs/TASKS.md`. A gotcha that will bite again is a comment beside the code it concerns.
   One test in `pnpm check` holds that `.env.example` lists exactly the variables the code
   reads, that README's opening sentence is the MVP's, that no date sits outside rule 6's
   form, and that code cites no plan or item number.

## Working without waiting

- Independent reads, searches and workstation runs start together, in one message.
- A sweep, a suite or a CI watch runs in the background while the next step is prepared.
- A search across many files goes to an Explore agent.
- Files are read, searched and edited with Read, Grep and Edit: an inline `python3`,
  `cat >` or `sed -i` waits on a permission prompt.

## Staging is yours

Fictional data only. Reset, reseed or break it without asking. Its keys are in
`.env.staging`, which git ignores. `scripts/staging.sh` uses them without showing them; its
header lists what it does. Local development never connects to a deployed database.
