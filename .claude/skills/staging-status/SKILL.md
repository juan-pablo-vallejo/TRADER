---
name: staging-status
description: Report what TRADER's staging environment is actually running — the deployed commit, the last deploy run, the migration count against the repository's journal, and recent errors. Use before relying on staging, after a push to main, or when a deploy run is red.
---

# Staging status

Read only. Nothing here changes staging, and nothing here reads production.

1. **Repository.** `git ls-remote --heads origin main` and the number of entries in
   `packages/db/migrations/meta/_journal.json`.
2. **Deploy job.** `gh run list --workflow ci.yml --branch main --limit 5`, then
   `gh run view <id>` for the newest: `check`, then `deploy` (migrate, deploy hook, ready
   wait, browser smoke test). A run whose commit `main` has moved past ends green with
   "not deployed" in its summary; read the newest run instead. Never `gh workflow run`.
3. **Deployment.** `STAGING_URL` from `.env.staging`, `/api/ready` answers
   `{ ready, commit }`. Compare `commit` with `main`.
4. **Database.** Through Neon's read-only connector on the staging project:
   `select count(*) from drizzle.__drizzle_migrations`. Compare with the journal.
5. **Errors.** Vercel's connector for the staging project's runtime errors in the last
   hour; Sentry's connector for unresolved issues in the `staging` environment.

Answer in five lines: main's commit, the deployed commit, migrations applied of the
journal's count, the last deploy run's result, and any new error.
