---
name: verify
description: Prove the working tree is green before a commit by running CI's whole check on this exact tree and recording the result. Use right before every commit that changes anything but Markdown, and whenever asked whether the tree is green.
allowed-tools: Bash(trader-ws *)
---

# Verify this tree

A push to `main` is refused unless a green check is recorded for the exact tree being pushed
(`.githooks/pre-push`). This is how the record is made. `trader-ws` is `scripts/trader-ws`,
run through the owner's shim of that name, which says which machine; it sends the tree to
the workstation and runs `scripts/check-ci.sh` there, which is CI's `check` step for step.

1. **Check.** `trader-ws check`. It sends the working tree as it stands (tracked changes and
   untracked files, nothing git ignores), runs the check, prints one line when green and
   records that tree. Never pipe the check into another command: a pipe's exit status hides
   a red run.
2. **Red.** It prints the last lines of the log, which name the step and say why. More:
   `trader-ws logs check 200`. Fix it and check again. Never write `.git/trader/green` by
   hand.
3. **What the change touches.** Before a commit, the tests and flows of what changed: the
   unit tests of the files; for an office screen its browser tests, from `apps/web`:
   `pnpm exec playwright test -c e2e/local.config.ts -g <name>`; for a phone screen its
   flows (`.maestro/run.sh`). The office's sign-in (`apps/web/src/app/(auth)/`,
   `clerk-*.tsx`, `server/clerk-*.ts`, `server/directory.ts`, `e2e/clerk*`): also
   `scripts/staging.sh local`, real Clerk on this Mac only, which records the `clerk` line
   the pre-push hook asks for.
4. **Full suites: once, before a release's merge.** Never for a commit or a push. The
   `release` skill runs them on the tree it ships: `trader-ws e2e` for the office
   (`pnpm e2e:local` here, with port 3000 free); `apps/mobile/.maestro/suite.sh ios <udid>`
   here and `trader-ws android`, then `trader-ws wait android`, for the phone.
5. **Workstation off.** The session's first lines say so. `trader-ws check --local` runs the
   same steps here and records the same line. Android waits for the workstation.
6. **Commit what was checked.** `git add -A`, then `git write-tree` prints the tree the
   check named. A different tree has no green: check again.
7. **Markdown alone.** A commit that differs from a checked tree only in `.md` files, the
   commit that finishes a batch for one, needs no check: the hook runs the format check on
   those files itself.
