# TRADER

A painter sees their week and clocks in and out on their phone, with or without signal; the
office schedules the crew, exports payroll hours and invoices the customer from the same
record. Built by JPTEQ LLC for painting contractors.

What it is and what is left to build: [docs/TASKS.md](docs/TASKS.md). How it is built and
released: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). How Claude Code works here:
[CLAUDE.md](CLAUDE.md).

## Run it on a new machine (needs Node 24, pnpm, Docker)

```sh
git clone https://github.com/juan-pablo-vallejo/TRADER.git && cd TRADER
cp .env.example .env          # then set POSTGRES_PASSWORD to anything
pnpm install
pnpm db:up                    # Postgres 18 in Docker
pnpm db:migrate
pnpm db:seed
pnpm check                    # typecheck, lint, format, tests
pnpm demo                     # a demo company in its own database
```

Office, against the demo data (sign in at `/dev-signin` as `office@demo.invalid`):

```sh
POSTGRES_DB=trader_demo DATABASE_URL= TRADER_DEV_IDENTITY=enabled pnpm --filter @trader/web dev
```

Phone, as a development build on a simulator:

```sh
pnpm --filter @trader/mobile ios      # or: android
apps/mobile/.maestro/suite.sh         # the phone flows
```

## Ship to staging

Land the commit on `main`. The deploy job migrates, deploys, checks
ready and runs the smoke test.

```sh
gh run list --branch main --limit 3
gh run watch <run-id> --exit-status
```

## Release to production (the owner)

1. Open `https://github.com/juan-pablo-vallejo/TRADER/compare/production...main`, or ask
   Claude to open the pull request.
2. Read the commits and anything under `packages/db/migrations/`. Try staging.
3. Merge with the admin bypass. The deploy job does the rest.
4. Check `https://app.jpteq.app/api/ready` and one office screen.

## Undo a release (the owner)

- Code: Vercel → production project → Deployments → put the previous one back.
- Data: Neon → production project → restore the branch to a time before the fault. This
  discards every write after that time, in both companies. Then check `/api/ready`.
- Phone: ship the fix, or the previous code, as a new build.

## Make production exist (the owner, once, in this order)

1. GitHub. Create the `production` branch from a green `main` commit. Then three rulesets:
   - `main`: Restrict deletions, Block force pushes.
   - `production` floor, no bypass list: Restrict deletions, Block force pushes, Require a
     pull request (0 approvals), Require status check `check` without "require branches to
     be up to date".
   - `production` lock: Restrict updates; bypass list: Repository admin, "For pull requests
     only".
     Then the environment `production`, deployment branches limited to `production`.
2. Neon. Project "production", Postgres 18, Launch plan. `public` empty. Migrate once by
   hand, then give the application role its password:

   ```sh
   read -rs OWNER_URL     # paste the production owner connection string (direct endpoint)
   TRADER_MIGRATE_PURPOSE=owner DATABASE_URL="$OWNER_URL" pnpm db:migrate
   ```

   ```sql
   alter role trader_app password '<openssl rand -base64 32>';
   ```

3. Clerk. Production instance on `jpteq.app`, its DNS records in Cloudflare, the development
   instance's settings copied.
4. Vercel. Production project: domains `app.jpteq.app`, `jpteq.app` and `www`; its
   Production variables (the pooled `DATABASE_URL` as `trader_app`, Clerk's production
   keys, the Resend key, the Sentry DSN); a deploy hook for `production`; one firewall
   rate-limit rule on `/api`.
5. GitHub `production` environment secrets: `PRODUCTION_MIGRATOR_URL`,
   `PRODUCTION_DEPLOY_HOOK`, `PRODUCTION_URL`. Later: the Expo token and the store
   credentials.
6. Apple: the app record, a TestFlight external group, a public link capped at the crew's
   size, beta review notes with the Demo sign-in. Google: the app record, the internal
   testing track, the tester list.
7. Onboard the two companies. Each command is a dry run until `--apply` is added:

   ```sh
   DATABASE_URL="$OWNER_URL" pnpm --filter @trader/db onboard \
     --company 'D Sierra Painting' --timezone America/New_York --next-invoice <n> \
     --admin-name '<name>' --admin-phone +1XXXXXXXXXX
   DATABASE_URL="$OWNER_URL" pnpm --filter @trader/db onboard \
     --company 'Demo' --timezone America/New_York --next-invoice 1 \
     --admin-name 'Demo Admin' --admin-phone +1XXXXXXXXXX
   unset OWNER_URL
   ```

   Create each admin in Clerk with the same number; their first sign-in binds the two. Turn
   schedule enforcement on for D Sierra, as the database's owner:

   ```sql
   update companies set schedule_enforced = true where name = 'D Sierra Painting';
   ```

## Day-one support

- A worker's number changed: change it on their Clerk user and on their row in People.
- "Where are my hours?": an entry lives on the phone until it syncs, and the phone shows
  what needs attention.

## License

© 2026 Juan Pablo Vallejo. All rights reserved. Public for transparency; no license to use,
copy or redistribute is granted. See [LICENSE](LICENSE).
