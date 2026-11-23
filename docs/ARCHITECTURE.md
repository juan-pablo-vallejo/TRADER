# TRADER: architecture

How TRADER is built and released. The owner's notebook decides; this is its typed copy. It
describes the target: where the code differs, the code is wrong.

## People and roles

- Two roles: **worker** (phone) and **admin** (office web; on the phone, their own clock
  when they work a shift, and the Crew tab).
- One login per person, by office invitation, on their mobile number, their email, or both.
  Sign-in is a texted or emailed code; or Google, for a person whose invitation carries
  that address, and Apple on an iPhone; after a code, a passkey in the office and Face ID
  or fingerprint in the phone app, and a lost one falls back to a code. No passwords and no
  sign-up: a login exists only because the office made it, and an admin changes a person's
  email and sign-in number. No passkeys in the phone app.
- A login belongs to exactly one company. New people start as workers; making an admin is a
  deliberate act.
- Worker can: see own week, clock in / switch / out on own shift, see own hours, edit own
  name and phone.
- Worker cannot: see anyone else's hours or schedule, or change a recorded entry.
- Admin can: everything in the office, for their company only; on the phone, see today's
  crew, call, add a shift for today, move someone to another job, set a jobsite's location.
- Nobody, admin included, rewrites a recorded clock event or an issued invoice. A fix is a
  new correcting entry; a wrong invoice is voided and reissued.

## System

```
Phone app (Expo)                Office (browser)
SQLite + outbox                       |
      \  push events,                 |
       \ pull snapshot                |
        +--> Next.js on Vercel <------+
             office screens + tRPC API
                     |
               Postgres (Neon)

Beside it:  Clerk (sign-in)
            Resend (invoice and invitation email)
            Sentry (errors: office, API, phone)
```

**Stack**

- TypeScript everywhere, one pnpm monorepo.
- Phone: Expo / React Native, local SQLite.
- Office and API: Next.js on Vercel. The API is tRPC, served by the web app.
- Database: Postgres. Docker locally, Neon deployed. Drizzle for schema and migrations.
- Clerk for sign-in, Resend for invoice and invitation email, Sentry for errors, EAS for
  phone builds.

**Four folders**

- `apps/mobile`: the phone app
- `apps/web`: the office and the API's host
- `packages/api`: the API, one folder per domain
- `packages/db`: schema, migrations, seed

**Twelve tables**

`companies` · `users` · `customers` · `jobs` · `job_assignments` (shifts) ·
`work_session_events` (clock log) · `invoices` · `invoice_line_items` · `invoice_counters` ·
`invoice_payments` · `invoice_sends` · `invitation_sends`

**Six invariants**

1. A clock event is never edited or deleted; the database refuses it. A fix is a new event
   pointing at the old one.
2. The phone creates each event's id. Sending it twice changes nothing.
3. The phone's time is the entry's time. The server flags a suspicious time and never
   rewrites it.
4. Hours are computed from events, never stored.
5. Every row belongs to one company, and Postgres enforces it. Production has two: D Sierra
   and Demo. The server checks its database role once when it starts and refuses to serve if
   that role could get around the wall.
6. Money is whole cents. An issued invoice never changes, and invoice numbers have no gaps.

**Sync in three lines**

- A tap writes to the phone's own database first. No network on that path.
- Push: oldest first. The server answers each record accepted, duplicate or rejected.
- Pull: the worker's own entries, shifts and jobs.

**Schema rule.** Free to change until the first production release. After it, a migration
that drops or rewrites data needs the owner's OK.

**In place of a rate limiter in the database:** one rate-limit rule in Vercel's firewall on
`/api`, set in the dashboard, no code.

## Environments

Three, sharing nothing.

**Local: writing and testing code**

- The working copy, Postgres in Docker, the dev sign-in (no Clerk), a simulator build of the
  phone app.
- Tests, seed and demo run here and nowhere else. Local never connects to a deployed
  database.
- Two machines. The Mac writes the code and is the only machine that commits and pushes.
  The Ubuntu workstation is compute: it gets the working tree from the Mac over SSH and
  runs what the Mac sends, which is the checks, Postgres in Docker, Android debug builds
  and the Android phone flows.
- The workstation holds no credential: no GitHub sign-in, no signing key, no staging key,
  no vendor sign-in, no Expo token, and no keystore but Android's debug one. Everything it
  serves listens on its own loopback, and the Mac reaches it through SSH.
- What the Mac sends runs there as an account with neither sudo nor Docker, and reaches
  that Postgres over loopback.
- For now Claude Code runs on the Mac alone and sends the workstation commands.

**Staging: proving a change before release**

- Runs `main`. Every green push deploys by itself: migrate, deploy, ready check, smoke test.
- Vercel project "staging", Neon project "staging", Clerk development instance, a preview
  build of the phone app.
- Fictional data only. It is Claude's: reset, reseed or break it without asking.

**Production: the crew**

- Runs `production`. Every release the owner merges deploys by itself, through the same job.
- Vercel project "production": the office at `app.jpteq.app`, everything of D Sierra's at
  `dsierrapainting.jpteq.app`, and `jpteq.app` with `www` redirecting to the office.
- Neon project "production", Clerk production instance, TestFlight and Play internal builds.
- Two companies: D Sierra and Demo. The owner's alone.

**Keys**

- Staging keys: a git-ignored `.env.staging` on the Mac, plus GitHub's `staging`
  environment. Claude uses them through `scripts/staging.sh` and does not read them.
- Production keys: the vendor's dashboard, plus GitHub's `production` environment, which
  hands its secrets only to runs on the `production` branch. Never in a file on the Mac.
- The vendor sign-ins on the Mac are the owner's and reach the whole account (`CLAUDE.md`, The owner's sign-ins).
- The workstation: none. Its `.env` holds the password of its own local Postgres, made
  there, and nothing else.

## Branches and release

Two permanent branches: `main` is Claude's, `production` is the owner's. Any other branch is
temporary.

**`main`**

- Claude lands work its own way: a direct push, or a branch and a pull request it merges
  itself.
- `check` runs on every push. Staging deploys only a green commit. A red `main` is fixed
  before anything else.
- GitHub blocks force-push and deletion.

**`production`** (GitHub rulesets)

- Cannot be deleted. Cannot be force-pushed. Nobody is exempt, the owner included.
- Changes only through a pull request, and only a commit whose `check` passed.
- An ordinary merge is refused. Only the repository admin's bypass on the pull request gets
  through.

**A release**

1. The pull request `main` → `production` is opened by the owner, or by Claude when asked.
2. The owner reads the commits and any migration files, and tries staging.
3. The owner merges it with the admin bypass, in the browser. That is the approval, and the
   migration gate.
4. The merge deploys by itself: migrate the production database, deploy office and API,
   build the phone app for TestFlight and Play internal.

**Undo** (the owner's, by hand)

- Code: put the previous deployment back in Vercel's dashboard.
- Data: Neon point-in-time restore.
- Phone: no instant undo. Ship the fix, or the previous code, as a new build.

**Claude and `production`**

- GitHub refuses it every ordinary road: push, force-push, deletion, a normal merge.
- The one door is the admin bypass, and it is the owner's. Claude signs in to GitHub as the
  owner, so that flag is also blocked in `.claude/settings.json`.
- Claude holds no production key in a file. The vendor sign-ins it works through are the
  owner's and reach production once it exists: what keeps Claude out there is the rules in
  `CLAUDE.md` and the blocks in `.claude/settings.json`, not the vendor.
- Two programs read a command before those rules have to. `.githooks/pre-push` refuses a
  push to `production`, a push to `main` of a tree with no recorded green check or while a
  release is open, and a push that holds a secret. `.claude/hooks/guard.mjs` refuses what
  `CLAUDE.md` says never to run, however the command is wrapped, and puts a change to a
  guard file to the owner: the scripts that check and record a green, the hooks, the
  agents, the skills and the workflows. Both read text and are tripwires; the lock is
  GitHub's ruleset and the owner's bypass.
