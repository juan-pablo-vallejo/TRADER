---
name: staging-status
description: Report what TRADER's staging environment is actually running — the deployed commit, the last promotion run, the migration count against the repository's journal, and recent errors. Use before relying on staging, after a merge, or when a promotion run is red.
---

# Staging status

Read only. Nothing here changes staging, and nothing here reads production.

1. **Repository.** `git ls-remote --heads origin main` and the number of entries in
   `packages/db/migrations/meta/_journal.json`.
2. **Promotion.** `gh run list --workflow promote-staging.yml --limit 5`, then
   `gh run view <id>` for the newest. A red run names its stage in the job summary; a
   withheld run is red by design and prints what the owner must dispatch. Never run
   `gh workflow run` on it.
3. **Deployment.** The staging host's `/api/ready` answers `{ ready, commit }`: the host is
   read from Vercel's connector (the staging project's domains), never written in the
   repository. Compare `commit` with `main`.
4. **Database.** Through Neon's read-only connector on the staging project:
   `select count(*) from drizzle.__drizzle_migrations`. Compare with the journal.
5. **Errors.** Vercel's connector for the staging project's runtime errors in the last
   hour; Sentry's connector for unresolved issues in the `preview` environment.

Answer in five lines: main's commit, the deployed commit, migrations applied of the
journal's count, the last promotion's result and stage, and any new error.
