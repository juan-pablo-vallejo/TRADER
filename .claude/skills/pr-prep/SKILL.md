---
name: pr-prep
description: Prepare a TRADER branch for review — run the full check unpiped, commit by the repository's rules, push the feature branch and open or update its pull request with the standard description. Use before every commit and whenever a batch of work is ready for the owner.
---

# Prepare a pull request

1. **Check, unpiped.** Run `pnpm check` on its own and read its exit status; a pipe reports
   the pipe's. Read the output for an "Unhandled" line as well as the counts. If
   `seed.test.ts` is red after a manual check, see MEMORY.md's Notes before anything else.
2. **Commit.** By the commit rule in [RULES.md](../../../docs/RULES.md), Git and CI. Commits
   are SSH-signed by configuration: confirm with `git log --show-signature -1`.
3. **Record.** Tick the TASKS.md line only when its done-criterion holds. Append the
   session's MEMORY.md entry (Did, Decided, Next) and delete any Note whose cause is gone.
4. **Push and open.** `git push -u origin <branch>`; never `main`, never `production`.
   `gh pr create` (or `gh pr edit`) with this description:

   ```markdown
   ## What changed

   ## Why

   ## Decisions

   ## Tests

   <!-- what was run, what was watched red, what was seen in a browser or on a device -->

   ## Not done, risks, follow-up
   ```

5. **Wait on the run by commit.** `gh run list --commit <full sha>`, then
   `gh run watch <id>`. Once it is green on the newest commit, merge as RULES.md, Git and
   CI, says; never a pull request into `production`.
