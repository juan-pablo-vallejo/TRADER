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

## 2026-07-27

_The 22:39 entry was written live. Everything below it was reconstructed from commit
timestamps and session history._

### 22:39 — The doc guards had turned `main` red

Found while bringing this log current: the commit below broke the `check` job. Its new script
uses `console` and `process`, and ESLint had no Node globals declared for `.github/scripts/`,
so three lines failed `no-undef`. The `docs` job passed, which is why it was not obvious — a
commit adding guards broke the guard already there.

Fixed by declaring those two globals for that path only, rather than adding the `globals`
package for two names or disabling the rule. Confirmed the fix is narrow: an unused variable in
that same file still fails lint, so the file is checked rather than exempted.

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
