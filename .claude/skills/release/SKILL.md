---
name: release
description: Prepare a release for the owner. Prove main is green and on staging, list what the release ships as facts, have it audited in a fresh context, and open the pull request into production.
disable-model-invocation: true
allowed-tools: Bash(scripts/release-facts.sh *), Bash(trader-ws *), Bash(gh pr list *), Bash(gh pr create *)
---

# Prepare a release

The owner merges a release; this only prepares it. Nothing here merges, pushes to
`production` or touches a production key.

1. **No release open.** `gh pr list --base production --state open`. One open: stop and say so.
2. **Main is what staging runs.** The `staging-status` skill: main's commit is the deployed
   commit, the last deploy run is green, migrations applied equal the journal's count.
   Anything else is fixed first.
3. **Full suites and the whole sweep, once.** On main's tree: the office in a browser
   (`trader-ws e2e`), `trader-ws android` then `trader-ws wait android`, and the iPhone
   flows here (`apps/mobile/.maestro/suite.sh ios <udid>`), all green; then the layout
   sweep on every device of the matrix (`trader-ws sweep` and `scripts/sweep/mac.sh`),
   clean by `scripts/sweep/verdict.mjs`. A flow or cell that was not run is named in the
   pull request, never left out.
4. **The server, simplified and reviewed once.** The `backend-change` skill's steps 5 to 8
   over `origin/production..origin/main`'s server diff, the sync path aside (its batches
   had theirs), pushed and green on staging before the pull request.
5. **The screens, reviewed once.** `visual-qa` on Fable over every screen the release
   changes (the finishing commits name them): the office at 390, 768 and 1280, the phone on
   both platforms, both languages, against the `interface-change` skill's standards. A
   Critical or High finding is fixed, and its fix seen, before the pull request.
6. **Facts.** `git fetch origin`, then `scripts/release-facts.sh origin/production origin/main`.
7. **Audit.** Hand the facts to the `release-auditor` agent. It reads
   `origin/production...origin/main` in a context that did not write the code, and returns
   findings ranked by what the owner must read himself.
8. **Pull request.** `gh pr create --base production --head main`, its body in this order:
   what a person using the product will see changed; what the owner must read (the
   auditor's findings, each with file and line); the facts, verbatim; what was seen working,
   as `scripts/release-facts.sh` gathers it from the finishing commits; what was not
   checked.
9. **Stop.** From here until the owner merges or closes it, nothing is pushed to `main`.
