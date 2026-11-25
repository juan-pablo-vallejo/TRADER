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
3. **Phone flows.** `trader-ws android`, then `trader-ws wait android`, green on main's
   tree, and the iPhone flows green here (`apps/mobile/.maestro/suite.sh ios <udid>`). A
   flow that was not run is named in the pull request, never left out.
4. **Facts.** `git fetch origin`, then `scripts/release-facts.sh origin/production origin/main`.
5. **Audit.** Hand the facts to the `release-auditor` agent. It reads
   `origin/production...origin/main` in a context that did not write the code, and returns
   findings ranked by what the owner must read himself.
6. **Pull request.** `gh pr create --base production --head main`, its body in this order:
   what a person using the product will see changed; what the owner must read (the
   auditor's findings, each with file and line); the facts, verbatim; what was seen working,
   as `scripts/release-facts.sh` gathers it from the finishing commits; what was not
   checked.
7. **Stop.** From here until the owner merges or closes it, nothing is pushed to `main`.
