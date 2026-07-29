# External Accounts

Which third-party services TRADER depends on, when each is first needed, what it costs at
pilot scale (~30 users), and whether we have it.

_Why_ each service was chosen → [SPEC.md §2](SPEC.md). _Variable names_ → `.env.example`.
This file owns only account and provisioning state.

Costs verified 2026-07-29 against vendor pricing pages, not summaries. Providers change pricing;
re-check anything load-bearing before relying on it.

## Have now

| Service | Used for                           |
| ------- | ---------------------------------- |
| GitHub  | Repository, and CI when it arrives |

## Phase 0 — blocking the current phase

| Service        | Used for               | Cost at pilot scale                                                                                                                                                                                  | Have it |
| -------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Neon**       | Postgres               | Free to start; **Launch from Phase 1** — usage-based, no monthly minimum. See below                                                                                                                  | ☐       |
| **Clerk**      | Auth (phone-based)     | **Pro, $25/mo, from pilot** — the free plan lists "SMS codes: No", so phone sign-in is not available on it. Plus $0.01/SMS. Free development instances do support phone auth, capped at 20 SMS/month | ☐       |
| **Vercel**     | Web app + the tRPC API | **$20/mo (Pro).** Hobby forbids commercial use, which includes pre-revenue company work                                                                                                              | ☐       |
| **Sentry**     | Error tracking         | Free tier; confirm limits at signup                                                                                                                                                                  | ☐       |
| **Expo / EAS** | Mobile builds          | Free = **15 iOS + 15 Android builds/month**, lower-priority queue, 45-minute timeout. **Local CLI builds are unlimited** — the relief valve                                                          | ☐       |

### Why Neon Launch rather than Free

Free gives 100 CU-hours per project per month — roughly 400 hours of a 0.25 CU compute.
Thirty phones syncing across a 10–12 hour workday can approach that in an active month, and
**when CU-hours run out the compute is suspended until the next billing period**: open
connections drop, new ones fail, and the crew loses the app mid-workday.

Free also keeps only a 6-hour restore window, against 1 day on paid. For payroll and invoice
data that is too thin.

Launch has had **no monthly minimum since December 2025** — it bills purely on usage, roughly
$0.106 per CU-hour plus $0.35 per GB-month. Expect single-digit to low-teens dollars per month
at pilot scale; there is no fixed plan fee to commit to.

## Phase 1 — the pilot goes live

The pilot lands at the end of Phase 1 (see [ROADMAP.md](ROADMAP.md)), so these are Phase 1
dependencies, not late ones.

| Service                     | Used for                                                             | Cost             | Have it |
| --------------------------- | -------------------------------------------------------------------- | ---------------- | ------- |
| **Apple Developer Program** | TestFlight; running on a real iPhone                                 | **$99/year**     | ☐       |
| **Google Play Console**     | Android distribution                                                 | **$25 one-time** | ☐       |
| **Domain name**             | Production web origin; likely needed for a Clerk production instance | ~$15/year        | ☐       |

Both store accounts are **individual**, not under JPTEQ LLC. No D-U-N-S number is required,
so enrollment is quick — with one consequence.

### What the store accounts do and do not gate

The crew is mixed, so both distribution tracks are needed. **Neither gates the pilot.**

**iOS — TestFlight external testing.** The public-link path. Each version's first build goes
through Beta App Review, roughly a day: latency on every hotfix, not a gate. Internal testing
is instant but requires testers to be App Store Connect users on your team, which is the wrong
shape for a field crew.

**Android — a Play closed-testing track**, which distributes to testers immediately.

Personal Play accounts created after 13 November 2023 must run a closed test with **12 testers
opted in for 14 continuous days** — but that gates **production access**, meaning a public Play
listing, not getting builds to your testers. A pilot _is_ a closed test, so the clock can run
during it. With 12+ Android crew continuously opted in, the pilot clears the gate as a side
effect; with fewer, the window rebuilds and you pad with outside testers before wanting a
public listing. Organization accounts are exempt entirely — that is the trade against the
D-U-N-S lead time.

## Later phases

| Service                          | First needed  | Used for                                                                                                    |
| -------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| **File storage**                 | Phase 2       | Material and receipt photos; invoice PDFs in Phase 4. **Provider undecided** — [DECISIONS.md](DECISIONS.md) |
| **Geocoding** — Mapbox or Google | Phase 2       | Job addresses → coordinates. **Undecided**                                                                  |
| **Inngest**                      | Phase 2+      | Background jobs                                                                                             |
| **PostHog**                      | Phase 2+      | Product analytics                                                                                           |
| **Resend**                       | Phase 2+      | Non-critical email. Never the auth channel                                                                  |
| **Twilio**                       | **Not in v1** | Customer-facing SMS only. Workers are reached by Expo push, which is free and needs no registration         |

### If customer SMS ever enters scope

US application-to-person SMS requires A2P 10DLC registration: **$44 one-time brand
registration plus $15 per campaign**, then **$1.50–$10 per month per campaign**, plus carrier
surcharges of roughly $0.003–0.005 per message. Brand approval is fast; **campaign review
runs 10–15 days.** Start a month before it is needed. TCPA opt-out compliance would also have
to be settled at that point — it is not currently tracked as an open decision, because
customer SMS left v1.

## Running cost

**$20/month** while building — Vercel Pro, the only subscription Phase 0 requires. Clerk's free
development instance covers phone auth until real workers sign in.

**~$45/month fixed from pilot** — Vercel Pro $20 plus Clerk Pro $25, since phone sign-in is not
available on Clerk's free plan. Neon Launch adds usage-based cost with no minimum, expected in
the single-digit to low-teens dollars, and SMS runs $0.01 a message.

First-year one-offs total **~$139**: Apple $99, Google Play $25, domain ~$15. Everything else
sits inside a free tier at this scale.
[SPEC.md](SPEC.md) §8 tracks cost creep as a standing risk.

## Dropped

**Doppler** was previously listed for secrets management. Vercel environment variables, EAS
secrets and GitHub Actions secrets cover Phases 0–4, so it would be one more service to
monitor and pay for — against SPEC §1's principle that every moving part is something one
person must maintain. Removed rather than deferred; revisit if a real need appears.
