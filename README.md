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
  also serves the API at `/api/trpc` and the readiness check at `/api/ready`. `e2e/` holds
  the staging smoke test and the browser suite on the demo data.
- `packages/api`: the tRPC API, one folder per domain. `src/demo/` builds the demo company.
- `packages/db`: the schema (eleven tables), its migrations, the seed and the onboarding
  script.
- `.github/workflows`: `ci.yml` runs `check`, then `deploy`. `audit.yml` reads the lockfile
  for advisories and every commit for a leaked secret. `preview-phone.yml` builds a preview
  of the phone app for a commit, when started by hand. `release-phone.yml` builds and
  submits the phone app on a release.
- `scripts/`: `check-ci.sh` is CI's `check` for a machine that is not CI; `staging.sh`
  uses staging's keys for one command; `release-facts.sh` lists what a release would ship;
  `trader-ws` runs the check and the Android flows on a second machine, named by
  `TRADER_WS_HOST` (an ssh name) and never in this repository.
- `.githooks/pre-push`, and under `.claude/` the hooks, skills and one agent Claude Code
  works with here.
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
git config core.hooksPath .githooks   # the pre-push hook; it needs gitleaks
```

It checks on Linux x86_64 as on a Mac: Node 24, pnpm through corepack, Docker Engine for
the database or any Postgres 18 on loopback with the three `POSTGRES_*` names in `.env`.
The Android flows there need JDK 17, Maestro, Postgres' client (`psql`) and the SDK and NDK
versions react-native's `gradle/libs.versions.toml` pins: run `expo prebuild -p android`
first and install what the generated project asks for.

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

- `pnpm check`: typecheck, lint, format check and every test. The quick loop.
- `pnpm check:ci`: CI's `check` step for step, the build and the migration included
  (`scripts/check-ci.sh`). Before every commit; the pre-push hook lets a tree onto `main`
  only when this was green on it, or when it differs from such a tree in Markdown alone.
- `pnpm test`: the tests alone. They need the local database and refuse a deployed one. One
  file: `pnpm exec vitest run <file>`, from its package's folder.
- `pnpm build`: builds the office. CI's `check` and `pnpm check:ci` run it; `pnpm check`
  does not.
- `pnpm e2e:local`: the office in a real browser on the demo data (`apps/web/e2e`,
  `office.local.ts`). It rebuilds the database `trader_demo_browser` and starts its own
  office on port 3000. Playwright's browser comes first, once, from `apps/web`:
  `pnpm exec playwright install chromium`. Not in CI yet.
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
scripts/staging.sh ready             # what staging serves, beside main's commit
scripts/staging.sh look /schedule    # that screen as the suite's admin, as screenshots
```

`scripts/staging.sh` loads the git-ignored `.env.staging` for the one command asked of it
and prints none of it. `smoke` and `look` sign in with single-use tickets and need the
suite's two numbers there, as `E2E_ADMIN_PHONE` and `E2E_WORKER_PHONE`.

## Production: the owner's runbook

Production does not exist yet: there is no `production` branch. "Make production exist"
comes first, once. After it, a release is a pull request from `main` into `production`, and
only the owner merges it.

### Release to production

1. Open `https://github.com/juan-pablo-vallejo/TRADER/compare/production...main`, or ask
   Claude to open the pull request.
2. Read the commits and anything under `packages/db/migrations/`. Try staging.
3. Merge with the admin bypass. The deploy job migrates production's database, then deploys
   the office and the API. The same merge starts "Release the phone app"
   (`.github/workflows/release-phone.yml`), which builds the phone app with the production
   profile and sends it to TestFlight and to Play's internal track.
4. Check `https://app.jpteq.app/api/ready`, one office screen, and D Sierra's homepage at
   `https://dsierrapainting.jpteq.app`.

### Undo a release

- Code: Vercel → production project → Deployments → put the previous one back.
- Data: Neon → production project → restore the branch to a time before the fault. This
  discards every write after that time, in both companies. Then check `/api/ready`.
- Phone: ship the fix, or the previous code, as a new build.

### Make production exist

Once, in this order.

1. **GitHub.** Create the `production` branch from a green `main` commit. Creating the
   branch starts a deploy run that stops at "Migrate the environment's database" for want
   of its secret, and deploys nothing. After step 5, run that job again (Actions, the run,
   Re-run failed jobs): it migrates, calls the hook and waits, and production then serves
   the branch's commit. That is the office the next steps sign in to; the release brings
   what `main` has gained since. `main` has its ruleset already (deletions restricted,
   force pushes blocked). Add two for `production`:
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

   Migrate once by hand, then give `trader_app` its password. The first line waits in
   silence: paste the production owner connection string (direct endpoint), then Return. No
   comment follows a command there: a zsh that takes no comments at the prompt would fail
   the `read`, and the string pasted next would land in the shell's history.

   ```sh
   read -rs OWNER_URL
   TRADER_MIGRATE_PURPOSE=owner DATABASE_URL="$OWNER_URL" pnpm db:migrate
   ```

   ```sql
   alter role trader_app password '<openssl rand -hex 32>';
   ```

   Hex, not base64: the password goes into a connection string, where a `/` would end the
   address early.

3. **Clerk.** Production instance on `jpteq.app`, its DNS records in Cloudflare, the
   development instance's settings copied. That includes the four session-token claims
   `.env.example` lists: without them every signed-in call answers 401. Under Allowed
   Subdomains add `app` and `dsierrapainting`: a session is issued to one of those two
   origins and to no other. On Native applications the Native API is on: without it the
   phone app cannot reach Clerk. Under User & authentication, User model, User permissions,
   all three switches are off: nobody deletes their own login, or changes its email address
   or its phone number, from their own side. Left on, anyone signed in, a holder of the
   Demo code included, could have Clerk text a code to a number of their choosing, or
   delete a login the office gave. The dashboard and the server's key still change them.
   Test mode is off.
4. **Vercel.** Production project: domains `app.jpteq.app` and
   `dsierrapainting.jpteq.app`, each with its DNS record in Cloudflare, and `jpteq.app`
   and `www` redirecting to `app.jpteq.app`; a deploy hook for `production`; one firewall
   rate-limit rule on `/api`. The project's Production environment tracks the `production`
   branch (Settings, Environments, Production, Branch Tracking). Left on `main`, the hook's
   deployment is a preview, the domains never serve it, and the deploy job waits out its
   fifteen minutes. Its Production variables, as `.env.example` describes them:
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
   (`https://app.jpteq.app`). And the phone's five, which the release workflow
   (`.github/workflows/release-phone.yml`) reads and nothing else does. No store credential
   is kept at Expo, so no token of staging's can submit.
   - `EXPO_TOKEN`: an Expo access token, which starts the production build and the
     submission.
   - `ASC_API_KEY_ID`: the id of the App Store Connect API key that uploads to TestFlight.
   - `ASC_API_KEY_ISSUER_ID`: that key's issuer id, from the same page of App Store Connect.
   - `ASC_API_KEY_P8`: the key itself, the whole text of the `.p8` file Apple lets you
     download once.
   - `GOOGLE_SERVICE_ACCOUNT_KEY`: the whole JSON key of the Google service account that
     uploads to Play's internal track.
6. **Apple and Google.** Apple: the app record, a TestFlight external group, a public link
   capped at the crew's size, beta review notes with the Demo sign-in: a Demo person's
   number and the demo code, entered under "I have a demo code". Google: the app
   record, the internal testing track, the tester list.
7. **Onboard the two companies.** Each command is a dry run until `--apply` is added: every
   statement runs and is rolled back, and it prints the database it reached and the ids it
   would have written. With `$OWNER_URL` empty (a new terminal since step 2) the shell
   refuses to run the command, so the local database is never onboarded by mistake. Read
   the name, then run each again with `--apply`.

   ```sh
   DATABASE_URL="${OWNER_URL:?paste it again, as in step 2}" pnpm --filter @trader/db onboard \
     --company "D'Sierra Painting LLC" --timezone America/New_York --next-invoice <n> \
     --admin-name '<name>' --admin-phone +1XXXXXXXXXX
   DATABASE_URL="${OWNER_URL:?paste it again, as in step 2}" pnpm --filter @trader/db onboard \
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

- A worker's number or email changed: an admin changes it in People, in the person's
  panel. They are signed out everywhere and sign in again with the new one. An admin's own
  addresses are the owner's to change, on their Clerk user.
- "Where are my hours?": an entry lives on the phone until it syncs, and the phone shows
  what needs attention.

## License

© 2026 Juan Pablo Vallejo. All rights reserved. Public for transparency; no license to use,
copy or redistribute is granted. See [LICENSE](LICENSE).
