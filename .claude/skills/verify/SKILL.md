---
name: verify
description: Prove the tree is green before a push by running CI's whole check on this exact tree and recording the result, and check each commit before it on what it changed. Use right before every push that changes anything but Markdown, before each commit (`pnpm check:fast`), and whenever asked whether the tree is green.
allowed-tools: Bash(trader-ws *), Bash(pnpm check:fast), Bash(apps/mobile/.maestro/affected.sh*)
---

# Verify this tree

A push to `main` is refused unless a green check is recorded for the exact tree of the
pushed tip (`.githooks/pre-push`). This is how the record is made. `trader-ws` is
`scripts/trader-ws`, run through the owner's shim of that name, which says which machine; it
sends the tree to the workstation and runs `scripts/check-ci.sh` there, CI's three jobs as
three lanes.

1. **Each commit.** `pnpm check:fast`: what changed since `origin/main`, and the whole
   `pnpm check` when the change reaches every package. Never piped: a pipe's exit status
   hides a red run.
2. **Before the push.** `trader-ws check`, once, on the tip. It sends the working tree as it
   stands (tracked changes and untracked files, nothing git ignores), runs the check, prints
   one line when green and records that tree. Never piped.
3. **Red.** It prints the red lane's last lines, which name the step and say why. More:
   `trader-ws logs check 200`. Fix it and check again. Never write `.git/trader/green` by
   hand.
4. **What the change touches.** In the batch, the tests and flows of what changed: the unit
   tests of the files (`pnpm check:fast` runs them); for an office screen its browser
   tests, from `apps/web`: `pnpm exec playwright test -c e2e/local.config.ts -g <name>`; for
   the phone, `apps/mobile/.maestro/affected.sh` names the flows, the sweep steps and
   whether Android is touched. The flows run on the iPhone simulator
   (`SUITE_FLOWS="<flows>" apps/mobile/.maestro/suite.sh ios <udid>`), and on the emulator
   (`trader-ws android`) only when it says `android: yes`. Sweep steps it names run on the
   iPhone SE at the largest text, in both languages
   (`MATRIX_STEPS="<steps>" MATRIX_TEXT=largest apps/mobile/.maestro/matrix.sh ios <udid>`).
   The office's sign-in (`apps/web/src/app/(auth)/`, `clerk-*.tsx`, `server/clerk-*.ts`,
   `server/directory.ts`, `e2e/clerk*`): also `scripts/staging.sh local`, real Clerk on this
   Mac only, which records the `clerk` line the pre-push hook asks for.
5. **Full suites and the whole sweep: once, before a release's merge.** Never for a commit
   or a push. The `release` skill runs them on the tree it ships.
6. **Workstation off.** The session's first lines say so. `trader-ws check --local` runs the
   same lanes here and records the same line. Android waits for the workstation.
7. **Push what was checked.** The check names a tree; `git rev-parse HEAD^{tree}` must print
   it before the push. A different tree has no green: check again.
8. **Markdown alone.** A push whose tip differs from a checked tree only in `.md` files, the
   commit that finishes a batch for one, needs no check: the hook runs the format check on
   those files itself.
