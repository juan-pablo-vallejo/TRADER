# Work Log

What happened that `git log` does not record — investigation, planning, review cycles,
decisions weighed and rejected, and work that produced no commit. Commits are cited by hash,
never restated; `git log` is their home.

**Historical only.** Current state and what is next live in [ROADMAP.md](ROADMAP.md).

Newest first; entries are immutable once written. Times are local (America/New_York). **This
log has gaps** — entries are written when Claude Code is involved in the work, not otherwise.
Roll to `WORKLOG-<year>.md` when this becomes unwieldy.

---

## 2026-07-27

_Reconstructed at the end of the day from commit timestamps and session history, not written
live. Entries after this date are written as the work happens._

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

### ~09:00 — Machine setup, outside the repository

No commit here — the work touched shell and SSH configuration rather than the project. The
toolchain was missing four tools, and installing them exposed a real bug: PATH entries had been
added to `.zshrc`, which only interactive shells read, so scripts and hooks could not resolve
Node at all. Moved to `.zshenv`.

A second machine was rediscovered by mDNS after its recorded address went stale.

### ~08:00 — The project is TRADER, not Sierra-Painting-v1

The largest finding of the day, and it produced no commit. The session opened on a request to
work on "the Sierra Painting application" against a repository that turned out to be a dead
Flutter and Firebase codebase on a different account, untouched since November.

The live project is a full rewrite on a different stack under a different owner. Nothing in
either repository states the relationship — the connection existed only in the maintainer's
head. Following the name literally would have meant a day of work in the wrong codebase.
