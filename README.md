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
database. The screens are the MVP's, in `docs/TASKS.md`.

- `apps/mobile`: the phone app (Expo, React Native), over a local SQLite store and its
  outbox. `.maestro/` holds the phone flows.
- `apps/web`: the office (Next.js). It also serves the API at `/api/trpc` and the readiness
  check at `/api/ready`. `e2e/` holds the browser suites, one config each: the demo
  data's, the staging smoke test, and those `scripts/staging.sh` runs against Clerk's
  development instance.
- `packages/api`: the tRPC API, one folder per domain. `src/demo/` builds the demo company.
- `packages/db`: the schema, its migrations, the seed and the onboarding script.
- `.github/workflows`: `ci.yml` runs `check`, then `deploy`. `audit.yml` reads the lockfile
  for advisories and every commit for a leaked secret. `preview-phone.yml` builds a preview
  of the phone app for a commit, when started by hand. `release-phone.yml` builds and
  submits the phone app on a release.
- `scripts/`: `check-ci.sh` is CI's `check` for a machine that is not CI; `staging.sh`
  uses staging's keys for one command; `release-facts.sh` lists what a release would ship;
  `trader-ws` runs the check and the Android flows on a second machine, named by
  `TRADER_WS_HOST` (an ssh name, with `TRADER_WS_ADMIN` for `trader-ws audit`) and never in
  this repository. The skills and hooks call it as `trader-ws`, a shim on the owner's PATH
  that runs this copy.
- `.githooks/pre-push`, and under `.claude/` the hooks, skills and agents Claude Code works
  with here.
- `.env.example`: the environment variables and what reads them.

## Run it on a new machine

Needs Node 24 (`.nvmrc`), pnpm and Docker. Nothing here reaches a deployed service: the
database is a container and sign-in is the development sign-in.

```sh
git clone https://github.com/juan-pablo-vallejo/TRADER.git && cd TRADER
cp .env.example .env          # then set POSTGRES_PASSWORD to anything
pnpm install
pnpm db:up                    # Postgres 18 in Docker
pnpm db:migrate
pnpm db:seed
pnpm check                    # typecheck, lint, format, tests
pnpm demo                     # a demo company in its own database
git config core.hooksPath .githooks   # the pre-push hook
```

The pre-push hook needs gitleaks, a signed-in `gh` (it refuses when GitHub does not answer),
and, for a push to `main`, a green recorded by `scripts/trader-ws check` for that tree.

It checks on Linux x86_64 as on a Mac: Node 24, pnpm through corepack, Docker Engine for
the database or any Postgres 18 on loopback with the three `POSTGRES_*` names in `.env`.
The Android flows there need JDK 17, Maestro, Postgres' client (`psql`) and the SDK and NDK
versions react-native's `gradle/libs.versions.toml` pins: run
`pnpm exec expo prebuild -p android` in `apps/mobile` first and install what the generated
project asks for.

The office, against the demo data:

```sh
POSTGRES_DB=trader_demo DATABASE_URL= TRADER_DEV_IDENTITY=enabled pnpm --filter @trader/web dev
```

Then open `http://localhost:3000/dev-signin` and sign in as `office@demo.invalid`.

The phone app, as a development build on a booted simulator (needs Xcode with CocoaPods, or
Android Studio; the flows need Maestro and Postgres' client, `psql`). Android's builds and
flows run on the workstation (`trader-ws android`); this Mac's emulator serves a diagnosis:

```sh
EXPO_PUBLIC_DEV_IDENTITY=enabled pnpm --filter @trader/mobile ios      # or: android
apps/mobile/.maestro/suite.sh ios <simulator udid>      # or: android <emulator serial>
```

The first line builds the app, installs it and leaves its bundler running. With the office
still up, sign in as a demo worker, `luis.herrera@demo.invalid`. The second line is the
phone flows: stop the office first, because the suite starts its own on port 3000 and builds
its own database.

## Everyday commands

- `pnpm check`: typecheck, lint, format check and every test. The quick loop. Never piped:
  a pipe's exit status hides a red run.
- `scripts/trader-ws check`: CI's `check` step for step, the build and the migration
  included (`scripts/check-ci.sh`), on the workstation; `--local` runs it on this Mac. Before
  every commit. It records a green for the exact tree, and the pre-push hook lets a tree
  onto `main` only when one was recorded for it, or when it differs from such a tree in
  Markdown alone.
- `pnpm test`: the tests alone. They need the local database and refuse a deployed one. One
  file: `pnpm exec vitest run <file>`, from its package's folder.
- `pnpm build`: builds the office. CI's `check` and `scripts/trader-ws check` run it;
  `pnpm check` does not.
- `pnpm e2e:local`: the office in a real browser on the demo data (`apps/web/e2e`,
  `office.local.ts`). It rebuilds the database `trader_demo_browser` and starts its own
  office on port 3000. Playwright's browser comes first, once, from `apps/web`:
  `pnpm exec playwright install chromium`. Not in CI.
- `pnpm format`, `pnpm lint:fix`: rewrite formatting, apply lint fixes.
- `pnpm db:generate`: a new migration from a schema change.
- `pnpm demo --reset`: rebuild the demo database. A plain `pnpm demo` refuses one that
  exists.
- `pnpm db:down`: stop the local Postgres. Its data stays.

## Ship to staging

Land the commit on `main`. `check` runs on every push. When it is green, the deploy job
migrates staging's database, deploys, waits until `/api/ready` answers on that commit, and
runs the browser smoke test. A push of only `apps/mobile/` and Markdown deploys nothing.

```sh
gh run list --branch main --limit 3
gh run watch <run-id> --exit-status
scripts/staging.sh ready             # what staging serves, beside main's commit
scripts/staging.sh look /schedule    # that screen as the suite's admin, as screenshots
```

`scripts/staging.sh` loads the git-ignored `.env.staging` for the one command asked of it
and prints none of it; its header lists what it does.

## Production: the owner's runbook

Production does not exist yet: there is no `production` branch. "Make production exist"
comes first, once, in one go. After it, a release is a pull request from `main` into
`production`, and only the owner merges it.

### Make production exist

Once, in this order. Before the first step, Claude's vendor sign-ins are scoped so that none
reaches production: Neon's connector pinned to `Trader-staging` and read-only, Sentry's to
its inspect tools, Vercel's plugin off. The Expo CLI on this Mac reaches the whole account
too.

A step run by hand from this working copy starts with this line, which prints
`at production` or tells you to stop:

```sh
git fetch -q origin && test "$(git rev-parse HEAD)" = "$(git rev-parse origin/production)" && git diff --quiet HEAD && echo "at production" || echo "STOP: run git switch --detach origin/production first"
```

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

2. **Neon.** A new project for production, Postgres 18, Launch plan, `public` empty.
   - Two connection strings. The direct endpoint, as the database's owner: migrations and
     onboarding. The pooled endpoint (its host has `-pooler`), as `trader_app`: the
     deployment.
   - The migration creates `trader_app` itself. Never create it, or any role the application
     uses, in Neon's console, CLI or API: a role made there can bypass row-level security.
   - With `DATABASE_URL` set, a migration refuses to run unless `TRADER_MIGRATE_PURPOSE`
     says who is asking: `owner` (this runbook) or `deploy` (the deploy job).

   Migrate once by hand, then give `trader_app` its password. After the check line, the
   first line waits in silence: paste the production owner connection string (direct
   endpoint), then Return. No comment follows a command there: a zsh that takes no comments
   at the prompt would fail the `read`, and the string pasted next would land in the
   shell's history.

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
   phone app cannot reach Clerk; the iOS and Android app `app.jpteq.trader`; and the
   mobile SSO redirect `app.jpteq.trader://sso-callback`, without which a Google or Apple
   sign-in never returns to the app. Under User & authentication, User model, User
   permissions, all three switches are off: nobody deletes their own login, or changes its
   email address or its phone number, from their own side. Left on, anyone signed in, a
   holder of the Demo code included, could have Clerk text a code to a number of their
   choosing, or delete a login the office gave. The dashboard and the server's key still
   change them. Test mode is off. Under User & authentication, Phone, a number is not
   required at sign-up: the office invites by number, by email, or by both. Under User &
   authentication, Passkeys, sign-in with passkey is on; under Mobile biometrics, sign-in
   with biometrics is on. Under SSO connections, Google is on for all users with
   credentials of its own, which a production instance must have: in Google Cloud, an OAuth
   client of type Web application whose authorized redirect URI is the one Clerk shows for
   the connection, with the consent screen's publishing status In production; its client
   ID and secret go into Clerk and nowhere else. Sign-in asks Google for a name and an email
   only, which needs none of Google's app verification; showing the app's own name and logo
   on Google's screen needs its brand verification (Google's pages, read 2026-11-23). Apple
   is on too, for the iPhone app alone: its native sign-in needs the app's App ID Prefix and
   Bundle ID on Native applications and no hosted Apple credentials (Clerk's Sign in with
   Apple guide, read 2026-11-24).
4. **Vercel.** Project `trader-production`: domains `app.jpteq.app` and
   `dsierrapainting.jpteq.app`, each with its DNS record in Cloudflare, and `jpteq.app`
   and `www` redirecting to `app.jpteq.app`; a deploy hook for `production`; one firewall
   rate-limit rule on `/api`, as staging's: path prefix `/api`, a fixed window of 60 s, 300
   requests per IP, then deny. The project's Production environment tracks the `production`
   branch (Settings, Environments, Production, Branch Tracking). Left on `main`, the hook's
   deployment is a preview, the domains never serve it, and the deploy job waits out its
   fifteen minutes. Resend: the domain `jpteq.app` added and verified, its DNS records in
   Cloudflare. Its Production variables, as `.env.example` describes them:
   - `TRADER_ENVIRONMENT=production`
   - `DATABASE_URL`: the pooled endpoint, logged in as `trader_app`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: Clerk's production keys
   - `CLERK_AUTHORIZED_PARTIES=https://app.jpteq.app,https://dsierrapainting.jpteq.app`,
     `app.jpteq.app` first: a page asked for on any other host is sent to the same path
     on the first origin listed
   - `SENTRY_DSN`: `trader-web`'s
   - `TRADER_HOME_HOST=dsierrapainting.jpteq.app`, so `/` there is D'Sierra's homepage
     and `/` on `app.jpteq.app` opens the office
   - `RESEND_API_KEY` and `MAIL_FROM`, both or neither. `MAIL_FROM` is
     `TRADER <an address at jpteq.app>`. Leave `MAIL_ALLOWLIST` blank: in
     production that means any customer may be emailed, except by the Demo company, which
     then emails nobody.
   - `DEMO_SIGN_IN_CODE` and `DEMO_COMPANY_ID`, both or neither, after step 7: a code of
     your own (`openssl rand -base64 24`) and the Demo company's id as onboarding printed
     it. With them a Demo person signs in on the phone with their number and that code,
     and no text message. Never D'Sierra's id. From then the Demo company can invite nobody.
   - `TRADER_GET_IOS_URL`, `TRADER_GET_ANDROID_URL`, `TRADER_MIN_BUILD_IOS` and
     `TRADER_MIN_BUILD_ANDROID` come with the release.

   The server refuses to start, naming the variable, when one of the first five lines is
   missing or malformed, or the mail pair or the Demo pair is half set. `/api/ready` answers
   200 only when the deployment is logged in as `trader_app` and every company table has
   row-level security forced; pointed at the owner's connection string it answers 503.

5. **GitHub.** The `production` environment's secrets: `MIGRATOR_URL` (the direct
   endpoint, as the owner), `DEPLOY_HOOK`, `APP_URL`
   (`https://app.jpteq.app`). And the phone's five, which the release workflow
   (`.github/workflows/release-phone.yml`) reads and nothing else does. No store credential
   is kept at Expo, so no token of staging's can submit.
   - `EXPO_TOKEN`: an Expo access token, which starts the production build and the
     submission.
   - `ASC_API_KEY_ID`: the id of the App Store Connect API key that uploads to TestFlight.
   - `ASC_API_KEY_ISSUER_ID`: that key's issuer id, from the same page of App Store Connect.
   - `ASC_API_KEY_P8`: the key itself, the `.p8` file Apple lets you download once.
   - `GOOGLE_SERVICE_ACCOUNT_KEY`: the JSON key of the Google service account that uploads
     to Play's internal track.

   A key file is never kept on the Mac: download it, hand it to GitHub and delete it, in one
   line each:

   ```sh
   gh secret set ASC_API_KEY_P8 --env production < ~/Downloads/<the .p8 file> && rm ~/Downloads/<the .p8 file>
   gh secret set GOOGLE_SERVICE_ACCOUNT_KEY --env production < ~/Downloads/<the .json file> && rm ~/Downloads/<the .json file>
   ```

6. **Apple and Google.** Apple: the app record for `app.jpteq.trader`, a TestFlight
   external group, a public link capped at the crew's size, beta review notes with the Demo
   sign-in: a Demo person's number and the demo code, entered under "I have a demo code".
   Tell Claude the number App Store Connect shows as the app's Apple ID: it goes into
   `apps/mobile/eas.json` as `submit.production.ios.ascAppId`, without which EAS refuses a
   submission run by a machine. Google: the app record, the internal testing track, the
   tester list. Then the first build of the production profile for each platform, by hand
   from `apps/mobile`, once
   (`npx --yes eas-cli@27.10.0 build --platform ios --profile production`, and the same with
   `android`): it makes the iOS distribution certificate with its App Store
   profile and the Android upload keystore, which Expo keeps and a build run by a machine
   cannot make.
7. **Onboard the two companies.** Each command is a dry run until `--apply` is added: every
   statement runs and is rolled back, and it prints the database it reached and the ids it
   would have written. With `$OWNER_URL` empty (a new terminal since step 2) the shell
   refuses to run the command, so the local database is never onboarded by mistake. Run the
   check line first, read the name, then run each again with `--apply`.

   ```sh
   DATABASE_URL="${OWNER_URL:?paste it again, as in step 2}" pnpm --filter @trader/db onboard \
     --company "D'Sierra Painting LLC" --timezone America/New_York --next-invoice <n> \
     --admin-name '<name>' --admin-phone +1XXXXXXXXXX
   DATABASE_URL="${OWNER_URL:?paste it again, as in step 2}" pnpm --filter @trader/db onboard \
     --company 'Demo Painting Co.' --timezone America/New_York --next-invoice 1 \
     --admin-name 'Demo Admin' --admin-phone +1XXXXXXXXXX --demo
   ```

   `--demo` flags the Demo company in the database: the Demo sign-in admits people of a
   flagged company only, so without it the door refuses everyone. `/api/ready` answers
   `"demo": true` once the Demo pair points at it.

   `--next-invoice` is where the contractor's own number series continues. Onboarding tells
   Clerk nothing: create each admin in Clerk with the same number, and their first sign-in
   binds the two. Schedule enforcement is a switch: D'Sierra's admin turns it on in
   Settings, under Time clock, where the company's details for its invoices are typed too.

   Then, before the Demo pair is set: sign in as the Demo admin by texted code and invite
   Demo's workers.

   Last, `unset OWNER_URL`.

### Release to production

1. In Claude Code type `/release`. Claude opens the pull request from `main` into
   `production` with the `release-auditor`'s findings and what was seen working, as
   `scripts/release-facts.sh` gathers it.
2. Read the findings, the commits and anything under `packages/db/migrations/`. Try staging.
3. Merge in the browser with the admin bypass. The deploy job migrates production's
   database, then deploys the office and the API. The same merge starts "Release the phone
   app" (`.github/workflows/release-phone.yml`), which builds the phone app with the
   production profile and sends it to TestFlight and to Play's internal track. Watch it:

   ```sh
   gh run list --branch production --limit 3
   gh run watch <run-id> --exit-status
   curl -s https://app.jpteq.app/api/ready
   ```

4. Check one office screen, and D'Sierra's homepage at `https://dsierrapainting.jpteq.app`.
5. TestFlight, once the build has processed: Test Information with the reviewer's sign-in
   (step 6 of "Make production exist"), add the build to the external group, submit. After
   Apple approves: the group's Public Link, capped at the crew's size. Play: Internal
   testing shows the release; copy the testers' link.
6. Vercel, `trader-production`: `TRADER_GET_IOS_URL` and `TRADER_GET_ANDROID_URL`
   to those two links, which `https://dsierrapainting.jpteq.app/get` hands to the phone that
   asks (blank, that page says to ask the office); `TRADER_MIN_BUILD_IOS` and
   `TRADER_MIN_BUILD_ANDROID` to the two build numbers. Redeploy. Every older build, the
   preview builds included, is then asked to update, so only one generation of the phone
   ever reaches production ("The phone's contract", `docs/ARCHITECTURE.md`). Raise them
   later only when a release needs it, and remove that build's folder under
   `packages/api/test/contract/builds/` in the same change.
7. The first release only: D'Sierra's admin invites each person from People, and week one's
   schedule is in before the crew starts.
8. A reminder in your calendar 80 days after the upload, "TRADER: a new TestFlight build":
   a TestFlight build stops working 90 days after its upload.

### Undo a release

- Code: Vercel → `trader-production` → Deployments → put the previous one back.
- Data: Neon → production's project → restore the branch to a time before the fault. This
  discards every write after that time, in both companies. Then check `/api/ready`.
- Phone: ship the fix, or the previous code, as a new build.

### Day-one support

- A worker's number or email changed, or their phone was lost: an admin changes it in
  People, in the person's panel. They are signed out everywhere, the Face ID or fingerprint
  key on the old phone stops working, and they sign in again with the new address. An
  admin's own addresses are the owner's to change, on their Clerk user.
- "Where are my hours?": an entry lives on the phone until it syncs, and the phone shows
  what needs attention.

## License

See [LICENSE](LICENSE).
