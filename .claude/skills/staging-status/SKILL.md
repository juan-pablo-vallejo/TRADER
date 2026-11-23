---
name: staging-status
description: Report what TRADER's staging environment is actually running — the deployed commit, the last deploy run, the migration count against the repository's journal, and recent errors. Use before relying on staging, after a push to main, or when a deploy run is red.
context: fork
---

# Staging status

Read only. Nothing here changes staging, and nothing here reads production.

1. **Repository.** `git ls-remote --heads origin main` and the number of entries in
   `packages/db/migrations/meta/_journal.json`.
2. **Deploy job.** `gh run list --workflow ci.yml --branch main --limit 5`, then
   `gh run view <id>` for the newest: `check`, then `deploy` (migrate, deploy hook, ready
   wait, browser smoke test). A run whose commit `main` has moved past ends green with
   "not deployed" in its summary; read the newest run instead. So does a run whose commit
   adds only `apps/mobile/` and Markdown to what staging serves: staging then serves an
   older commit than `main`, by design, and that is not a fault. Never `gh workflow run`.
   A red run: `gh run view <id> --log-failed`, and report the first failing step with the
   lines that say why. The log itself stays here.
3. **Deployment.** `scripts/staging.sh ready` prints what `/api/ready` answers,
   `{ ready, commit }`, beside `main`'s commit. Compare the two. The script loads
   `.env.staging` for that one request; nothing here reads the file.
4. **Database.** Through Neon's read-only connector on the staging project:
   `select count(*) from drizzle.__drizzle_migrations`. Compare with the journal.
5. **Errors.** Vercel's connector for the staging project's runtime errors in the last
   hour; Sentry's connector for unresolved issues in the `staging` environment.

Answer in five lines: main's commit, the deployed commit, migrations applied of the
journal's count, the last deploy run's result, and any new error.
