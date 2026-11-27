---
name: backend-change
description: The lifecycle for a TRADER batch that changes the server or the phone's sync path (packages/api, packages/db, apps/web/src/server, apps/mobile/src/sync, store and api.ts) - test first, verify, then one simplifier pass and one independent review by agents that did not write it, per push for the sync path and once per release for the rest of the server. Use for every such batch, and from the release skill.
allowed-tools: Bash(git diff *), Bash(pnpm check), Bash(pnpm check:fast), Bash(pnpm --filter * exec vitest run *), Bash(trader-ws *)
paths:
  - packages/api/**
  - packages/db/**
  - apps/web/src/server/**
  - apps/mobile/src/sync/**
  - apps/mobile/src/store/**
  - apps/mobile/src/api.ts
---

# A server or sync batch

Runs inline: a forked skill cannot start agents. `docs/TASKS.md` and `CLAUDE.md` still
decide what is built and when to stop and ask.

The sync path is `apps/mobile/src/sync/`, `apps/mobile/src/store/`, `apps/mobile/src/api.ts`,
and the server's side of it, `packages/api/src/sync/` and `packages/api/src/labor/`. A batch
that changes it runs steps 5 to 8 before its push. A batch that changes only the rest of
the server stops at step 4 and is pushed; its simplifier and its review run once a release,
over the release's server diff, when the `release` skill calls for them, with
`origin/production` as the push base.

1. **What.** The list's item and its Done when. Note the push base:
   `git rev-parse origin/main`.
2. **A failing test first.** It fails for the reason the finding gives. The clock and sync
   path gets a dropped response, a duplicate send and a wrong clock (rule 4).
3. **Build.** Targeted tests (`pnpm --filter <pkg> exec vitest run <files>`), then
   `pnpm check:fast` until green.
4. **Commit A.** Commit the work (`pnpm check:fast` green); the `verify` skill's whole
   check runs on the tip before the push.
5. **Simplify, once per push or release.** Files:
   `git diff --name-only <push-base>..HEAD -- packages/api/src packages/db/src apps/web/src/server`,
   less the never-touch list in `simplifier-prompt.md`. None left: skip to 7. Start
   `code-simplifier:code-simplifier` with that prompt verbatim, `<FILES>` and the goal
   filled. Never on its own output. A file on the never-touch list is never given to the
   simplifier: the main session edits it and the reviewer reads it.
6. **Commit B.** Targeted tests, `pnpm check:fast`, commit the simplification alone, so
   it reverts alone. Anything it changed that you would not keep, undo before the commit and say so.
7. **Review.** Start `batch-reviewer` on `<push-base>..HEAD`, naming the files that changed
   and the questions to answer. Two rounds at most. An invariant objection that stands
   stops the work and goes to the owner; anything else is decided and explained in the
   commit message.
8. **Commit C.** The fixes, `pnpm check:fast`, commit, then the `verify` skill's whole check
   on the tip. Then push as `CLAUDE.md` says. What the review
   found and how long each agent took go in the message of the commit that finishes the
   item.
9. **Comments only.** A batch whose diff changes comments and no code token needs neither
   agent: compare the files with comments stripped and paste the result in the commit
   message.
