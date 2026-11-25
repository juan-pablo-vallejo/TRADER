# TRADER: architecture

How TRADER is built and released. It is one of the four documents that decide. It describes
the target: where the code differs, the code is wrong.

## People and roles

- Two roles: **worker** (phone) and **admin** (office web; on the phone, their own clock
  when they work a shift, and the Crew tab).
- One login per person, by office invitation, on their mobile number, their email, or both.
  Sign-in is a texted or emailed code; or Google, for a person whose invitation carries
  that address, and Apple on an iPhone; after a code, a passkey in the office and Face ID
  or fingerprint in the phone app, and a lost one falls back to a code. No passwords and no
  sign-up: a login exists only because the office made it. An admin changes a worker's
  email and sign-in number; the person is then signed out and starts clean, their Face ID
  or fingerprint key stops working, and the change is kept on record. An admin's own are
  the owner's to change. No passkeys in the phone app.
- A login belongs to exactly one company. New people start as workers; making an admin is a
  deliberate act.
- Worker can: see own week, clock in / switch / out on own shift, see own hours, edit own
  name and phone.
- Worker cannot: see anyone else's hours or schedule, or change a recorded entry.
- Admin can: everything in the office, for their company only; on the phone, see today's
  crew, message them on WhatsApp, add a shift for today, move someone to another job, set a
  jobsite's location.
- Nobody, admin included, rewrites a recorded entry or an issued invoice. A fix is a new
  correcting entry; a wrong invoice is voided and reissued.

## System

```
Phone app (Expo)                Office (browser)
SQLite + outbox                       |
      \  push entries,                |
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

**Thirteen tables**

`companies` · `users` · `customers` · `jobs` · `shifts` · `entries` · `invoices` ·
`invoice_line_items` · `invoice_counters` · `invoice_payments` · `invoice_sends` ·
`invitation_sends` · `address_changes`

**Six invariants**

1. An entry is never edited or deleted; the database refuses it. A fix is a new entry
   pointing at the old one.
2. The phone creates each entry's id. Sending it twice changes nothing.
3. The phone's time is the entry's time. The server flags a suspicious time and never
   rewrites it.
4. Hours are computed from entries, never stored.
5. Every row belongs to one company, and Postgres enforces it. Production has two: D'Sierra
   and Demo. The server checks its database role before it first serves and refuses to
   serve if that role could get around the wall.
6. Money is whole cents. An issued invoice never changes, and invoice numbers have no gaps.

**Sync in three lines**

- A tap writes to the phone's own database first. No network on that path.
- Push: oldest first. The server answers each record accepted, duplicate or rejected.
- Pull: the worker's own entries, shifts and jobs.

**The phone's contract.** A released build is used for weeks, so what it sends and reads
only grows. On a procedure the phone calls (`PHONE_PROCEDURES`): never remove, rename or
retype a field, add a required input, narrow an input or change a default; a new output
field is fine, a new enum value only where every supported build ignores it. A sync payload
version is frozen once shipped; a change is a new version beside it, upcast on the server.
Anything else waits until `TRADER_MIN_BUILD_*` has passed every build that relied on the
old shape. `packages/api/test/contract` holds the snapshot and each released build's calls.

**Measured.** Every call writes one timing line (`trader_call`: path, milliseconds,
statements) to the server's log, and answers it as `Server-Timing` with an `x-request-id`
everywhere but production. Each phone procedure and hot office read has an exact statement
budget (`packages/api/test/core/budgets.test.ts`).

**Names left as they are.** Where a stored or sent name differs from the word on screen, it
is mapped here and nowhere else.

| Screen word                            | Wire                                                   | Database                                                |
| -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| entry                                  | record kind `labor_event`                              | `entries`                                               |
| a person; the worker on an entry       | `people.*`; `workerId`                                 | `users`; `entries.worker_id`                            |
| Hours                                  | router `labor`                                         | none: worked out from `entries`                         |
| Today (office), Crew (phone)           | `overview.today`                                       | none                                                    |
| sign-in address: email, sign-in number | `setEmail`, `setSignInPhone`                           | `users.email`, `users.sign_in_phone`, `address_changes` |
| a shift's start; its person            | `expectedStart`; `userId`                              | `shifts.expected_start`; `shifts.user_id`               |
| a shift that will not move             | refusal `schedule` (its issues: an overlap among them) | none                                                    |
| started                                | `shifts[].locked`; refusal `started`                   | `locked_at`, `locked_by_event_id`                       |
| an invoice's line                      | `lines`                                                | `invoice_line_items`                                    |
| Break started, Break ended             | `paused`, `resumed`                                    | the same                                                |
| entered by hand                        | `timeSetByUser`, flag `user_timed`                     | `time_set_by_user`                                      |
| the Demo company's refusal             | `company_closed`                                       | `companies.demo`                                        |

**Schema rule.** Free to change. Once production's database exists, a migration that drops or
rewrites data needs the owner's OK (`CLAUDE.md`, Stop and ask).

**Migrating a live database** (once production's database exists). A migration runs before
the new code serves, and installed phones stay for weeks: a migration only adds, and a
removal waits for a later release. All pending migrations run in one transaction, so each
starts `SET LOCAL lock_timeout = '3s'`, an index is never built CONCURRENTLY, and a new
CHECK or foreign key is added NOT VALID in one release and validated in the next. A trigger
on an append-only or invoice table is never disabled. Squawk reads every new migration.

**Pool.** An instance's pool holds at least twice the batch limit. On Vercel it is attached
with `attachDatabasePool`, and idle clients close after 5 s.

**In place of a rate limiter in the database:** one rate-limit rule in Vercel's firewall on
`/api`, set in the dashboard, no code. Its numbers are in `README.md`, "Make production
exist".

## Environments

Three, sharing nothing but two things. Sentry has one project per app (`trader-web`,
`trader-phone`), shared by staging and production and told apart by environment. The
office's sign-in suite runs on this Mac against Clerk's development instance, which staging
also uses.

**Local: writing and testing code**

- The working copy, Postgres in Docker, the dev sign-in (no Clerk), a simulator build of the
  phone app.
- Tests, seed and demo run here and nowhere else. Local never connects to a deployed
  database.
- Two machines. The Mac writes the code and is the only machine that commits and pushes.
  The Ubuntu workstation is compute: it gets the working tree from the Mac over SSH and
  runs what the Mac sends, which is the checks, Postgres in Docker, Android debug builds
  and the Android phone flows.
- Android's builds and phone flows run on the workstation alone; when it does not answer,
  the Mac does the work and Android waits.
- The workstation holds no credential: no GitHub sign-in, no signing key, no staging key,
  no vendor sign-in, no Expo token, and no keystore but Android's debug one. Everything it
  serves listens on its own loopback, and the Mac reaches it through SSH.
- What the Mac sends runs there as an account with neither sudo nor Docker, and reaches
  that Postgres over loopback.
- Claude Code runs on the Mac alone and sends the workstation commands.

**Staging: proving a change before release**

- Runs `main`. A green push deploys by itself: migrate, deploy, ready check, smoke test. A
  push of only `apps/mobile/` and Markdown deploys nothing.
- Vercel project `trader-staging`, Neon project `Trader-staging`, Clerk development
  instance, a preview build of the phone app.
- Fictional data only. It is Claude's: reset, reseed or break it without asking.
- The owner signs in there as himself, an admin of staging's company, by texted code; the
  machine signs in by single-use ticket.

**Production: the crew**

- Runs `production`. Every release the owner merges deploys by itself, through the same job.
- Vercel project `trader-production`, at the addresses the MVP names ("Addresses",
  `docs/TASKS.md`).
- A Neon project of its own, Clerk production instance, TestFlight and Play internal
  builds.
- Two companies: D'Sierra and Demo. The owner's alone.

**Keys**

- Staging keys: a git-ignored `.env.staging` on the Mac, plus GitHub's `staging`
  environment. Claude uses them through `scripts/staging.sh` and does not read them.
- Production keys: the vendor's dashboard, plus GitHub's `production` environment, which
  hands its secrets only to runs on the `production` branch. Never kept in a file on the
  Mac.
- The vendor sign-ins on the Mac are the owner's and reach the whole account (`CLAUDE.md`,
  The owner's sign-ins).
- The workstation: none. Its `.env` holds the password of its own local Postgres, made
  there, and nothing else.

## Branches and release

Two permanent branches: `main` is Claude's, `production` is the owner's. Any other branch is
temporary.

**`main`**

- Work lands on it by a direct push.
- `check` runs on every push. Staging deploys only a green commit. A red `main` is fixed
  before anything else.
- GitHub blocks force-push and deletion.

**`production`** (GitHub rulesets)

- Cannot be deleted. Cannot be force-pushed. Nobody is exempt, the owner included.
- Changes only through a pull request, and only a commit whose `check` passed.
- An ordinary merge is refused. Only the repository admin's bypass on the pull request gets
  through.

**A release** is a pull request from `main` into `production`. Only the owner merges it,
with the admin bypass, in the browser: that is the approval and the migration gate. The
merge deploys by itself. The steps, and how to undo one, are in `README.md`.

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
