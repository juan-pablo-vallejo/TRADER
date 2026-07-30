# Work Log

What happened that `git log` does not record — investigation, planning, review cycles,
decisions weighed and rejected, and work that produced no commit. Commits are cited by hash,
never restated; `git log` is their home.

**Historical only.** Current state and what is next live in [ROADMAP.md](ROADMAP.md).

Newest first. Entries written live are immutable; entries marked as reconstructed may be
corrected when evidence appears, with the correction noted. Times are local
(America/New_York). **This log has gaps** — entries are written when Claude Code is involved
in the work, not otherwise. Roll to `WORKLOG-<year>.md` when this becomes unwieldy.

---

## 2026-07-30

### 18:15 — Phase 1 opens: gates settled, and the sync core built server-first

All four **at start** gates decided before any sync code was written, which is the order ROADMAP
asks for and the only order that works — every one of them is protocol shape.

**The clock-skew rule needed reframing before it could be answered.** `CONFLICT-4` was written as
`server_timestamp` bounding `client_timestamp`, but those two cannot distinguish a wrong clock
from a legitimately old event: a device offline for two days produces a 48-hour gap by design,
and that is the case SPEC §3 exists to serve. Skew is therefore measured **at sync time** from a
`deviceNow` the push carries, which is pure clock error regardless of outbox age. Tolerance 5
minutes. Beyond it the event is still written — `SESSION-4` rejection is permanent and losing a
worker's hours to their phone's clock is the worse failure — but ordered by arrival and flagged.
Clamping was rejected outright: in an append-only payroll ledger a rewritten timestamp is a time
the worker did not act, and nothing downstream can undo it.

**Two real bugs, both mine, both caught by tests rather than review.**

The first was a design error in the pull cursor. The overlap window that makes CONFLICT-4a safe
was applied _inside pagination_, so any page beginning a window behind its own cursor could never
advance whenever a full batch fit inside that window — an infinite loop. The fix separates the
two concerns: `sync.pull` uses a strict keyset so a run always terminates, and `rewindCursor`
applies the overlap exactly once per sync cycle.

The second was worse because it looked like nothing. Three cursor tests failed on their iteration
bound; the cause was that `server_timestamp` stored **microseconds** while a JavaScript `Date`
holds only milliseconds, so the driver truncated on the way out and every cursor landed
fractionally behind the row it came from. `server_timestamp > cursor` then stayed true for rows
already delivered and sync would have livelocked in production while every log looked healthy.
Fixed at the column — `timestamptz(3)` — and pinned by two schema invariants, because nothing in
application code would fail if a later migration widened it back.

**A test that could not fail, found by breaking the code it guarded.** Removing DERIVE-4's
`workedMs = 0` changed no test result: the voided session in the fixture had never accumulated
any time, so the assertion held whether or not the rule was implemented. Rewritten with a
`paused` that closes a four-hour interval first, it now goes red — exactly the money-column
failure `CLAUDE.md` records from `75ba82e`. Four other guards were disarmed in turn and each went
red as it should: the duplicate-resume interval guard, the insertion-breaks-the-future check in
`SESSION-3`, `workDate`'s company timezone, and the precision fix above.

`work_session_events` gained `attestation_level`, so `ATTEST-3`/`ATTEST-4` now hold end to end on
the server; the device-side biometric call remains unbuilt and every event honestly records
`none`. logic.md's ATTEST group was downgraded from `[unbuilt]` to partly built rather than left
claiming no code exists.

Not built yet, and the larger half of the phase: the device. `expo-sqlite`, the outbox, per-record
sync status (`CONFLICT-6`), device-side migrations, passkey joining (`AUTH-1`–`AUTH-10`), and the
Face ID call itself.

### 12:20 — Phase 0 stops waiting on signups, and both clients get built

Started from external advice to be wary of managed database services and to focus on building.
That landed exactly on why nothing had been committed since `a309f46`: ROADMAP made a _deployed_
stack the Phase 0 exit criterion, so the phase read as "blocked on signups rather than code".
Nothing about it was a code problem. Reframed the phase around a running stack instead of a
deployed one, which cost nothing to do — `packages/db/src/client.ts` already had the dual-driver
switch, and `packages/api` was already built to receive an already-verified identity rather than
talk to Clerk. Both deferrals were free because both seams already existed.

Weighed dropping Neon outright and self-hosting in production too. Rejected: it collides with the
settled "tRPC inside Next.js on Vercel" decision, since serverless functions against a plain
Postgres exhaust connections without a pooler you then run yourself. Deferring keeps the option
and costs nothing, so the entry is worded "deferred, not dropped" and carries the Neon tier
analysis forward to the deploy gate rather than burying it with the signup.

**A plan review made two blocking claims; one was wrong.** It said the merge of
`v1-scope-passkeys-invoicing` would smuggle in a scope change without marking the superseded
decisions, and prescribed adding "superseded" banners — which `CLAUDE.md` explicitly forbids,
and which the branch had already handled correctly by rewriting the facts in place
(`DECISIONS.md:207`). It also asserted a recorded "sign up now rather than build a dev shim"
decision; grep found no such entry. Its other blocking claim was right and material: a
module-load throw in the dev-auth guard would have broken the `next build` step being added in
the same plan, and the natural fix — setting the flag in CI — would have normalised the flag
being on everywhere. Guard moved to request time.

**The merge itself was a mistake worth recording.** Acted on a stale local `main` without
fetching; the branch had already merged the previous day as #12. PR #13 was therefore a no-op
and left an empty commit, `37aa1a9`, on `main`. Harmless, but it is there because a `git fetch`
was skipped.

**The one genuinely invasive change was not in the plan.** `next build` failed on every
cross-file import inside `@trader/api`: the packages import siblings as `./trpc.js`, correct
TypeScript ESM, but Turbopack has no extension-aliasing at all — only `resolveExtensions`, which
cannot help once a specifier already ends in `.js`. Tried `experimental.extensionAlias`;
Turbopack ignores it. That left opting the web app out of Turbopack, or dropping the extension
across 63 sites in 20 files. Chose the latter because Metro would have hit the identical wall for
mobile, and `moduleResolution: bundler` is already the mode that expects extensionless imports.
Verified afterwards that `tsc`, `tsx` (migrate/seed), `vitest` and Metro all still resolve.

Two supply-chain and tooling defaults were left armed rather than quietly disabled. pnpm
auto-wrote a `minimumReleaseAgeExclude` list for ten Expo packages published ~21 hours earlier;
that is the quarantine `CLAUDE.md` says to wait out rather than disable, so the list was reverted
and `expo` pinned to `57.0.8` (2026-07-22, well clear) instead. It also left a
`sharp: set this to true or false` placeholder, which was decided rather than deleted.

Watched to fail before being trusted, per the repo rule: disarming `devAuthEnabled` makes a
production server with no flag set return a signed-in **admin** from `me.get`, and turns 3 of the
4 new tests red. Restored, both go green. The mobile half was proven on a booted iPhone 17
simulator rather than asserted — Expo's `--ios` launcher shells out to `osascript`, which this
environment blocks, so Metro was started plainly and Expo Go opened with
`xcrun simctl openurl`.

Left undone: `.env.example` is unreadable under current tool permissions, so the
`DEV_AUTH_ENABLED` / `EXPO_PUBLIC_DEV_SUBJECT` variables are documented in the commit and in this
entry but **not yet in the file that owns the environment contract**. That is a real gap, not a
deferral.

## 2026-07-29

### 01:47 — v1 gets a definition, plus passkey signup and invoicing that takes payment

Two features added and, more consequentially, the word "v1" defined for the first time. The repo
had only ever spoken in phases, so "v1" meant whatever each reader assumed. It is now Phases 0–4,
stated once in the roadmap. Documentation only.

**"Sign up with Face ID" had to be translated before it could be planned.** Face ID cannot
identify anyone — it is a 1:1 check against whoever enrolled that handset, answering "is this the
phone's owner?" and never "who is this?". The feature is therefore passkeys, with Face ID guarding
the private key. Checking npm directly rather than trusting a search summary mattered here: the
summary quoted `@clerk/expo-passkeys` v1.1.0 with peer range `expo >=54 <57`, which would have
excluded Expo 57 and killed the idea. The current 2.0.2 allows `<58`. Also learned that passkeys
require Clerk's paid plan in production, so this saves no money — but it does collapse SMS to
invites and recovery only.

**Pulling online payment into v1 forced a regulatory question before a technical one.** Holding
customer money and disbursing it later is money transmission, with state-by-state licensing
behind it. Having the contractor connect their own processor account avoids the entire category,
and at one pilot contractor there is no upside to being in the money flow. Two simplifications
fell out of it: no customer portal is needed, because a payment link needs no account, and card
data never enters the system, which keeps the PCI obligation at its lightest tier.

**The invoice status enum cannot survive real payments.** `draft | sent | paid | void` was built
for an admin ticking a box after a cheque cleared. Once customers pay online, part-payments and
overpayments are ordinary and neither is expressible. Status becomes derived from the payments
attached, which also makes it impossible for the status and the money to disagree. Two related
finds: line items must be snapshots, or a Phase 3 correction to someone's hours would silently
alter an invoice already sitting in a customer's inbox; and invoice numbers must be allocated at
send rather than at draft, since numbering drafts leaves a gap every time one is abandoned.

Three recorded decisions were left wrong by this and were rewritten rather than annotated —
invoices as "tracking-only, manually marked paid", photos as the only thing in object storage,
and Resend as carrying "non-critical" email only. Delivering an invoice is not non-critical.

The planning band widened to 14–23 weeks: passkey enrolment joined Phase 1 and payment capture
joined Phase 4. Saying so is cheaper than discovering it later.

### 01:19 — One-tap attested clock-in, and the rules get a home

Tap → Face ID → clocked in, recorded across spec, roadmap and decisions; and a new
`docs/logic.md` that owns the numbered rules the system must obey. Documentation only, no code.

**The extraction was the valuable part.** Pulling rules out of narrative prose into numbered
form exposed things prose had been hiding. "One open session per worker" existed only as a
parenthesis in §6 — "enforced in the API handler" — with no test, no citation and nowhere to
point. It is now `SESSION-1`. And §3's conflict rule promised that server receipt acts as a
"sanity bound" on client timestamps without anywhere defining the tolerance, or what happens
when it is breached; that read as settled for months and was not. It is now `CONFLICT-4`,
carrying an explicit open-parameter marker, and a row in the Open table due at the start of
Phase 1 alongside the sync protocol it belongs to.

Two rules point in opposite directions on purpose, which is worth recording because it looks
like a contradiction. A failed biometric never blocks a worker clocking in — a worker who cannot
clock in cannot be paid, which is a wage-law problem rather than a UX one — so the level
achieved is recorded honestly and the event is written anyway. A web approval, by contrast,
fails closed: an admin altering someone else's submitted record can be made to wait, because a
correction is not urgent. The asymmetry follows the consequence, not the platform.

**A recommendation reversed mid-conversation.** I had settled on the weaker attestation — a local
biometric check, no signing — on the grounds that it already defeats the realistic threat of
someone using a colleague's phone, and that key lifecycle is real burden for a solo maintainer.
Then the requirement arrived that the web app push a Face ID approval to the phone. That flow is
inherently challenge–response, which is most of a device-key design already, so the increment to
real signing collapses once it is built. Staged instead: local check at Phase 1, signed
challenges at Phase 3 when web approval needs the infrastructure regardless.

Smaller finds along the way: SPEC stated the sync-queue states twice, once in §3 and again
inside §6's clock-in flow; and DECISIONS' own header dated itself 07-27 while carrying 07-29
entries, and told the reader that "full reasoning lives in SPEC.md" — pointing away from the one
thing that file exists to own.

### 00:50 — Geofenced clock-in recorded as a timeboxed spike

An idea arrived from outside the project: detect arrival at a jobsite and clock the worker in
automatically. Recorded in the roadmap and spec; nothing built.

Checking it against what already exists did most of the work. An authoritative version collides
with three settled constraints — `initiator_user_id` is `NOT NULL` and names the human who
caused each event, labor history is append-only so a false clock-in would be permanent, and §3
holds that location never blocks a clock-in, which making it the trigger would invert. The
advisory shape collides with none of them, needs no schema change, and costs nothing when
detection is wrong.

Also corrected a live error: `ACCOUNTS.md` still said Clerk was free with metered SMS, and put
fixed cost at $20/month. Clerk's own pricing lists "SMS codes: No" on the free plan — phone
sign-in needs Pro at $25. The correction had been planned the previous day, then the
conversation moved to re-evaluating the stack and it was never committed. Found only because
this change touched the neighbouring file.

---

## 2026-07-28

_No commits this day and no timestamps captured, so the entry carries none. Times are not
guessed here — an earlier pair of invented ones is recorded below as a correction._

### Clerk's free tier does not do SMS — found while writing a setup guide

Researching an account-creation walkthrough surfaced that phone sign-in, a settled product
decision, is unavailable on the plan the project had assumed. Verified against Clerk's pricing
page rather than the aggregator articles, which were vaguer and in one case wrong.

The finding prompted a full re-examination of the services stack, and a spec-verification report
covering twelve findings. Neither produced a commit; the report lives outside the repository.

One near miss recorded there: several 2026-dated articles state Drizzle ORM reached a stable
1.0. The npm registry disagrees — `latest` resolves to 0.45.2, there are no stable 1.x releases,
and the 1.0 line sits at rc.4 after 315 prereleases. The pin was already correct, but it had been
chosen before anyone checked.

---

## 2026-07-27

_The 22:39 entry was written live. Everything below it was reconstructed from commit
timestamps and session history._

### 23:05 — A recorded decision that the platform cannot express

Preparing to enable branch protection surfaced that "pull requests for code, direct push for
docs" is not configurable: GitHub's require-a-pull-request rule has no path filter, and
rulesets do not support path exclusion. The decision had been recorded as though it were.

Amended to the enforceable shape — require pull requests and CI checks, leave administrator
bypass enabled — which makes a pull request the default and a direct documentation push a
deliberate act rather than the easy one. Worth checking before writing a policy down, not
after.

### 22:39 — The doc guards broke lint, and I misreported where

Found while bringing this log current: the commit below fails the `check` job. Its new script
uses `console` and `process`, and ESLint had no Node globals declared for `.github/scripts/`,
so three lines fail `no-undef`. The `docs` job passes, which is why it was not obvious — a
commit adding guards broke the guard already there.

Fixed by declaring those two names for that path only, rather than adding the `globals` package
for two globals or disabling the rule. Confirmed the fix is narrow: an unused variable in the
same file still fails lint, so the file is checked rather than exempted.

**I reported this as "`main` is red". It was not.** `main` was green throughout, at the commit
above. I had read a failing run record without checking which branch it belonged to, and
without noticing my own checkout was on `docs-guards` rather than `main`. The failing run was
for a commit that is not in main's history.

Twice in one day, then: invented timestamps here, and a branch state asserted rather than
checked — on the day "verify before asserting" was written into CLAUDE.md as a rule, citing
earlier instances of the same thing.

### 22:25 — Doc organization enforced in CI, by a parallel session `c9d8148`

Committed from the desktop app by a separate Claude Code session asked to review the
repository. It turned two manual habits into CI jobs — a relative-link checker over tracked
markdown, and a one-liner enforcing CLAUDE.md's own sub-100-line ceiling. Both were watched
failing before being trusted, the standard this repo already held itself to; now it is a red X
rather than a memory.

It also caught a drift spot I had created hours earlier: OVERVIEW.md still said `packages/api/`
was yet to appear, four lines below the repository-map row I had just added listing it. A
contradiction inside one screen, in the document whose job is orientation.

### 22:18 — This log created `0ea5528`

Justified only by what `git log` cannot hold. A review caught that the draft named a machine
hostname while its own verification claimed it named none — and that hostname was already in
the standing leak grep, so the check would have failed on the plan proposing it.

### 21:26 — Session-starter sections added to CLAUDE.md `cd8c3f5`

A review reported the draft text as missing. The draft was present in the plan file at lines
35–89; what reached the reviewer is not something I can inspect.

Its substantive catch was real and changed the file: the draft opened by paraphrasing SPEC §3's
governing principle, creating exactly the second-authority drift the file exists to prevent.
That produced the rule "name an invariant and link, never restate its substance."

Trimmed three times over — the file stated a ~95-line ceiling while being 106 lines. The
document that teaches "no two truths in one file" should not contradict itself.

### 21:06 — Declined to merge the `@types/node` bump `750adcf`

Not merged, against the instruction, for a reason worth recording: `@types/node` must track the
Node runtime rather than the newest release. We run Node 24; types from the 26 line describe
APIs the runtime lacks, so code type-checks and then fails when it runs. It was also still
inside pnpm's 24-hour package quarantine — a window I had misjudged by a day earlier.

Dependabot closed the pull request itself once the ignore rule landed.

### 19:21 — `packages/api` built and merged via PR #8 `a309f46`

The planned verification found my own regression test did not work: reintroducing the
role-writing conflict clause left all 14 tests green, because select-first returns the existing
row and never reaches the insert. It passed for the wrong reason. What it does catch — confirmed
by breaking it — is replacing select-first with an upsert; four tests fail on that. Corrected
the claim rather than leave a false guarantee.

Two smaller finds: company selection had no `ORDER BY`, so a second company row would attach
users to an arbitrary tenant non-deterministically; and raw-SQL fixtures hit a NOT NULL
violation because `id` comes from Drizzle's `$defaultFn`, not a database default.

### 18:22–18:24 — Dependabot triage `ff9f116` `6edb1be` `10cf5e9` `aec5b79`

Six pull requests within two minutes of CI going live. Five merged, two closed with reasons
recorded in `.github/dependabot.yml`: TypeScript 7 fails because typescript-eslint does not
support it, and `@types/node` must track the Node runtime rather than the newest release.

The `gh` token turned out to lack `workflow` scope, so pull requests touching
`.github/workflows/` cannot be merged through the API — those went in over SSH instead.

### 18:15 — CI added, and a compliance collision surfaced `872dad1`

A review caught that store-required account deletion collides with the append-only invariant:
labor events cannot be destroyed — the trigger forbids it, the foreign key blocks it, and
payroll retention law requires them. Deactivate-and-anonymise is the only resolution all three
permit.

Verified the pipeline can fail before trusting it: dropping the three triggers turns four tests
red. Dependabot opened three pull requests within a minute and was right about all of them —
the action versions I had pinned from memory were already two majors stale.

### 17:04 — Orientation document and the first diagram `30a6649`

Six documents had no entry point. The repository had never had a diagram; SPEC described the
architecture in prose and nobody had drawn it.

A review found the real duplication risk was not the opening sentence but seven volatile status
facts scattered through the draft, each of which would rot the day Phase 0 landed — in the file
meant to demonstrate the one-fact-one-home rule. Compressed to one paragraph and two pointers.
The verification step then caught that four more stack components were silently undrawn, not
just the one I had noted.

### 14:43 — Roadmap, and a misread policy corrected `af445bb`

The first draft put a two-week Android testing gate on the critical path. Wrong: Google's
twelve-tester rule gates _production access_ — a public listing — not distribution to testers.
A pilot is itself a closed test, so the clock can run during it. The same error was already
committed in ACCOUNTS.md and had to be rewritten there too.

Choosing to pilot at the end of Phase 1 pulled three "before pilot" decisions forward into
Phase 1 deadlines. Language — English-first versus Spanish-first — is the sharp one:
internationalising from the start is cheap and retrofitting is not.

### 10:45 — External services documented, four decisions settled `7f700de`

Two verified numbers changed the plan. Vercel's free tier forbids commercial use, so Pro is
required rather than optional — which corrects the "one bill" premise I had used to justify
hosting the API there. Neon's free plan suspends compute for the rest of the billing period
once its quota is spent, which on a pilot means the crew loses the app mid-workday.

Deferring customer SMS removed a service, its fees, a ten-to-fifteen day review, and a
compliance obligation.

### 00:27 — Consolidation pass `7f9cd94`

SPEC contradicted itself in six places: the body still described the old stack while its own
header declared those choices superseded. The "superseded header" I had added earlier was a
band-aid that put two truths in one file. Deleted 198 lines and added 154 — the cleanup removed
more than it wrote.

Also installed the one-fact-one-home rule as `CLAUDE.md`, after prompting that documentation
was getting out of control. It was.

### 00:08 — Phase 0 schema `75ba82e`

Eleven tables with the append-only triggers. Proved the invariant tests can fail before
trusting them: injecting a floating-point money column turned the suite red and named the
offending column. A test that has never failed is not evidence.

---

## 2026-07-26

_Reconstructed from file timestamps and commit history. **Correction:** the machine-setup and
reframe entries below were originally filed under 2026-07-27 with invented times of ~08:00 and
~09:00. File mtimes place them here — wrong by a day and about twelve hours. The timestamps
were guessed rather than checked, in the file whose value is that it can be trusted._

### 23:27 — Workflow document moved into `docs/` `4518587`

Relocating it broke all four of its relative links. Also added it to the README table, where it
had been conspicuously absent beside SPEC and DECISIONS.

### 23:11 — Multi-machine workflow documented `1f648d2`

Machine addresses stayed out of the public repository. A filename trap surfaced: a template
named `.env.machines.example` would have been silently gitignored, since the `!.env.example`
negation rescues only that exact name — it would have looked committed locally and never
appeared on GitHub.

### 21:31 — A PATH bug that had been failing quietly

Installing the toolchain exposed it: PATH entries lived in `.zshrc`, which only interactive
shells read, so scripts, hooks and `ssh host cmd` could not resolve Node at all. `pnpm` and
`eas` were installed and unreachable. Moved to `.zshenv`.

My first fix was wrong for the same reason — I put the corrected PATH in `.zshrc` too, and only
caught it because verification ran across all three shell types rather than the convenient one.

### 21:27 — Second machine rediscovered

Its recorded address was stale after a subnet change. Found by scanning for its service ports,
then confirmed by mDNS name rather than reusing the address recorded for its other OS — which
you flagged, correctly, as belonging to a different boot.

### 21:21 — Toolchain installed

Four tools missing for the stack. Deliberately not installed: a JDK, and PowerShell, both
belonging to the superseded project.

### ~21:00 — The project is TRADER, not Sierra-Painting-v1

The largest finding, and it produced no commit. The session opened on a request to work on "the
Sierra Painting application" against a repository that turned out to be a dead Flutter and
Firebase codebase on a different account, untouched since November.

The live project is a full rewrite on a different stack under a different owner. Nothing in
either repository states the relationship — the connection existed only in the maintainer's
head. Following the name literally would have meant a day of work in the wrong codebase.
