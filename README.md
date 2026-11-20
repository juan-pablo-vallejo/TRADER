# TRADER

A painter sees their week and clocks in and out on their phone, with or without signal; the
office schedules the crew, exports payroll hours and invoices the customer from the same
record.

Not in production yet: `main` runs on staging. What it is and what is left to build:
[docs/TASKS.md](docs/TASKS.md). How it is built and released:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). How Claude Code works here:
[CLAUDE.md](CLAUDE.md).

## What is here

One TypeScript monorepo: a phone app and an office web app over one API and one Postgres
database.

- `apps/mobile`: the phone app (Expo, React Native). Sign-in, Today (the clock), Week, Crew
  for an admin and Me, in English and Spanish, over a local SQLite store and its outbox. `.maestro/`
  holds the phone flows.
- `apps/web`: the office (Next.js). People, Customers, Jobs, Schedule, Hours and Invoices. It
  also serves the API at `/api/trpc` and the readiness check at `/api/ready`. `e2e/` is the
  staging smoke test.
- `packages/api`: the tRPC API, one folder per domain. `src/demo/` builds the demo company.
- `packages/db`: the schema (eleven tables), its migrations, the seed and the onboarding
  script.
- `.github/workflows`: `ci.yml` runs `check`, then `deploy`. `audit.yml` reads the lockfile
  for advisories and every commit for a leaked secret.
- `.env.example`: every environment variable and what reads it.

## Run it on a new machine

Needs Node 24, pnpm and Docker. Nothing here reaches a deployed service: the database is a
container and sign-in is the development sign-in.

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

The office, against the demo data:

```sh
POSTGRES_DB=trader_demo DATABASE_URL= TRADER_DEV_IDENTITY=enabled pnpm --filter @trader/web dev
```

Then open `http://localhost:3000/dev-signin` and sign in as `office@demo.invalid`.

The phone app, as a development build on a simulator (needs Xcode or Android Studio; the
flows need Maestro):

```sh
EXPO_PUBLIC_DEV_IDENTITY=enabled pnpm --filter @trader/mobile ios      # or: android
apps/mobile/.maestro/suite.sh ios <simulator udid>      # or: android <emulator serial>
```

The first line builds the app and leaves its bundler running. With the office still up, sign
in as a demo worker, `luis.herrera@demo.invalid`. The second line is the phone flows: stop
the office first, because the suite starts its own on port 3000 and builds its own database.

## Everyday commands

- `pnpm check`: typecheck, lint, format check and every test. Before every commit.
- `pnpm test`: the tests alone. They need the local database and refuse a deployed one. One
  file: `pnpm exec vitest run <file>`, from its package's folder.
- `pnpm build`: builds the office. CI's `check` runs it; `pnpm check` does not.
- `pnpm format`, `pnpm lint:fix`: rewrite formatting, apply lint fixes.
- `pnpm db:generate`: a new migration from a schema change.
- `pnpm demo --reset`: rebuild the demo database. A plain `pnpm demo` refuses one that
  exists.
- `pnpm db:down`: stop the local Postgres. Its data stays.

## Ship to staging

Land the commit on `main`. `check` runs on every push. When it is green, the deploy job
migrates staging's database, deploys, waits until `/api/ready` answers on that commit, and
runs the browser smoke test.

```sh
gh run list --branch main --limit 3
gh run watch <run-id> --exit-status
```

## Production: the owner's runbook

Production does not exist yet: there is no `production` branch. "Make production exist"
comes first, once. After it, a release is a pull request from `main` into `production`, and
only the owner merges it.

### Release to production

1. Open `https://github.com/juan-pablo-vallejo/TRADER/compare/production...main`, or ask
   Claude to open the pull request.
2. Read the commits and anything under `packages/db/migrations/`. Try staging.
3. Merge with the admin bypass. The deploy job migrates production's database, then deploys
   the office and the API. It does not build the phone app yet ("Preview builds" and "The
   release job builds the phone app" in `docs/TASKS.md`).
4. Check `https://app.jpteq.app/api/ready` and one office screen.

### Undo a release

- Code: Vercel → production project → Deployments → put the previous one back.
- Data: Neon → production project → restore the branch to a time before the fault. This
  discards every write after that time, in both companies. Then check `/api/ready`.
- Phone: ship the fix, or the previous code, as a new build.

### Make production exist

Once, in this order.

1. **GitHub.** Create the `production` branch from a green `main` commit. `main` has its
   ruleset already (deletions restricted, force pushes blocked). Add two for `production`:
   - floor, no bypass list: Restrict deletions, Block force pushes, Require a pull request
     (0 approvals), Require status check `check` without "require branches to be up to
     date".
   - lock: Restrict updates; bypass list: Repository admin, "For pull requests only".

   Then the environment `production`, deployment branches limited to `production`.

2. **Neon.** Project "production", Postgres 18, Launch plan, `public` empty.
   - Two connection strings. The direct endpoint, as the database's owner: migrations and
     onboarding. The pooled endpoint (its host has `-pooler`), as `trader_app`: the
     deployment.
   - The migration creates `trader_app` itself. Never create it, or any role the application
     uses, in Neon's console, CLI or API: a role made there can bypass row-level security.
   - With `DATABASE_URL` set, a migration refuses to run unless `TRADER_MIGRATE_PURPOSE`
     says who is asking: `owner` (this runbook) or `deploy` (the deploy job).

   Migrate once by hand, then give `trader_app` its password:

   ```sh
   read -rs OWNER_URL     # paste the production owner connection string (direct endpoint)
   TRADER_MIGRATE_PURPOSE=owner DATABASE_URL="$OWNER_URL" pnpm db:migrate
   ```

   ```sql
   alter role trader_app password '<openssl rand -base64 32>';
   ```

3. **Clerk.** Production instance on `jpteq.app`, its DNS records in Cloudflare, the
   development instance's settings copied. That includes the four session-token claims
   `.env.example` lists: without them every signed-in call answers 401. Under Allowed
   Subdomains add `app` and `dsierrapainting`: a session is issued to one of those two
   origins and to no other.
4. **Vercel.** Production project: domains `app.jpteq.app` and
   `dsierrapainting.jpteq.app`, each with its DNS record in Cloudflare, and `jpteq.app`
   and `www` redirecting to `app.jpteq.app`; a deploy hook for `production`; one firewall
   rate-limit rule on `/api`. Its Production variables, as `.env.example` describes them:
   - `TRADER_ENVIRONMENT=production`
   - `DATABASE_URL`: the pooled endpoint, logged in as `trader_app`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: Clerk's production keys
   - `CLERK_AUTHORIZED_PARTIES=https://app.jpteq.app,https://dsierrapainting.jpteq.app`,
     `app.jpteq.app` first: a page asked for on any other host is sent to the same path
     on the first origin listed
   - `SENTRY_DSN`
   - `TRADER_HOME_HOST=dsierrapainting.jpteq.app`, so `/` there is D Sierra's homepage
     and `/` on `app.jpteq.app` opens the office
   - `NEXT_PUBLIC_GET_IOS_URL` and `NEXT_PUBLIC_GET_ANDROID_URL`, after step 6: the
     TestFlight public link and the Play testing link, which
     `https://dsierrapainting.jpteq.app/get` hands to the phone that asks. Blank, that
     page says to ask the office.
   - `RESEND_API_KEY` and `MAIL_FROM`, both or neither. Leave `INVOICE_EMAIL_ALLOWLIST`
     blank: in production that means any customer may be emailed, except by the Demo
     company, which then emails nobody.
   - `DEMO_SIGN_IN_CODE` and `DEMO_COMPANY_ID`, both or neither, after step 7: a code of
     your own (`openssl rand -base64 24`) and the Demo company's id as onboarding printed
     it. With them a Demo person signs in on the phone with their number and that code,
     and no text message. Never D Sierra's id. From then the Demo company can invite nobody.

   The server refuses to start, naming the variable, when one of the first five lines is
   missing or malformed, or the mail pair or the Demo pair is half set. `/api/ready` answers
   200 only when the deployment is logged in as `trader_app` and every company table has
   row-level security forced; pointed at the owner's connection string it answers 503.

5. **GitHub.** The `production` environment's secrets: `PRODUCTION_MIGRATOR_URL` (the direct
   endpoint, as the owner), `PRODUCTION_DEPLOY_HOOK`, `PRODUCTION_URL`
   (`https://app.jpteq.app`). Later: the Expo token and the store credentials.
6. **Apple and Google.** Apple: the app record, a TestFlight external group, a public link
   capped at the crew's size, beta review notes with the Demo sign-in: a Demo person's
   number and the demo code, entered under "I have a demo code". Google: the app
   record, the internal testing track, the tester list.
7. **Onboard the two companies.** Each command is a dry run until `--apply` is added: every
   statement runs and is rolled back, and it prints the database it reached and the ids it
   would have written. An empty `$OWNER_URL` (a new terminal since step 2) reaches the local
   database instead, so read the name, then run each again with `--apply`.

   ```sh
   DATABASE_URL="$OWNER_URL" pnpm --filter @trader/db onboard \
     --company 'D Sierra Painting' --timezone America/New_York --next-invoice <n> \
     --admin-name '<name>' --admin-phone +1XXXXXXXXXX
   DATABASE_URL="$OWNER_URL" pnpm --filter @trader/db onboard \
     --company 'Demo' --timezone America/New_York --next-invoice 1 \
     --admin-name 'Demo Admin' --admin-phone +1XXXXXXXXXX
   ```

   `--next-invoice` is where the contractor's own number series continues. Onboarding tells
   Clerk nothing: create each admin in Clerk with the same number, and their first sign-in
   binds the two. Schedule enforcement is a switch: D Sierra's admin turns it on in
   Settings, under Time clock, where the company's details for its invoices are typed too.

   Then, before the Demo pair is set: sign in as the Demo admin by texted code and invite
   Demo's workers.

   Last, `unset OWNER_URL`.

### Day-one support

- A worker's number changed. If they have signed in before, change it on their Clerk user:
  they keep working, and People goes on showing the old number, because the office cannot
  edit a sign-in number yet ("Change a worker's sign-in number from the office", after MVP
  in `docs/TASKS.md`). If they have never signed in, deactivate them in People and invite
  them again with the new number.
- "Where are my hours?": an entry lives on the phone until it syncs, and the phone shows
  what needs attention.

## License

© 2026 Juan Pablo Vallejo. All rights reserved. Public for transparency; no license to use,
copy or redistribute is granted. See [LICENSE](LICENSE).
