# External Accounts

Which third-party services TRADER depends on, when each is first needed, what it costs at
pilot scale (~30 users), and whether we have it.

_Why_ each service was chosen → [SPEC.md §2](SPEC.md). _Variable names_ → `.env.example`.
This file owns only account and provisioning state.

Costs verified 2026-07-27. Providers change pricing; re-check anything load-bearing before
relying on it.

## Have now

| Service | Used for                           |
| ------- | ---------------------------------- |
| GitHub  | Repository, and CI when it arrives |

## Phase 0 — blocking the current phase

| Service        | Used for               | Cost at pilot scale                                                                                                                         | Have it |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Neon**       | Postgres               | Free to start; **Launch (~$10/mo) from pilot start** — see below                                                                            | ☐       |
| **Clerk**      | Auth (phone-based)     | Free to 50,000 monthly retained users. **SMS OTPs are metered separately** — small at 30 users, but not zero                                | ☐       |
| **Vercel**     | Web app + the tRPC API | **$20/mo (Pro).** Hobby forbids commercial use, which includes pre-revenue company work                                                     | ☐       |
| **Sentry**     | Error tracking         | Free tier; confirm limits at signup                                                                                                         | ☐       |
| **Expo / EAS** | Mobile builds          | Free = **15 iOS + 15 Android builds/month**, lower-priority queue, 45-minute timeout. **Local CLI builds are unlimited** — the relief valve | ☐       |

### Why Neon Launch rather than Free

Free gives 100 CU-hours per project per month — roughly 400 hours of a 0.25 CU compute.
Thirty phones syncing across a 10–12 hour workday can approach that in an active month, and
**when CU-hours run out the compute is suspended until the next billing period**: open
connections drop, new ones fail, and the crew loses the app mid-workday.

Free also keeps only a 6-hour restore window, against 1 day on paid. For payroll and invoice
data that is too thin. ~$10/mo removes both problems.

## Before the pilot reaches real phones

| Service                     | Used for                                                             | Cost             | Have it |
| --------------------------- | -------------------------------------------------------------------- | ---------------- | ------- |
| **Apple Developer Program** | TestFlight; running on a real iPhone                                 | **$99/year**     | ☐       |
| **Google Play Console**     | Android distribution                                                 | **$25 one-time** | ☐       |
| **Domain name**             | Production web origin; likely needed for a Clerk production instance | ~$15/year        | ☐       |

Both store accounts are **individual**, not under JPTEQ LLC. No D-U-N-S number is required,
so enrollment is quick — with one consequence.

### Android needs a 14-day head start

Personal Play accounts created after 13 November 2023 must run a **closed test with 12
testers opted in for 14 continuous days** before production access is granted. "Opted in"
means each tester accepted the invitation and installed the app under a matching Google
account.

Treat this as a scheduled dependency: line up 12 people and start the clock **two weeks
before** the crew needs Android builds. iOS via TestFlight has no equivalent gate.
Organization accounts are exempt from this — that is the trade against the D-U-N-S lead time.

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
runs 10–15 days.** Start a month before it is needed, and settle the TCPA opt-out item in
[DECISIONS.md](DECISIONS.md) first.

## Running cost

**$20/month** once Phase 0 is live, rising to **~$30/month** when Neon Launch starts at pilot.
First-year one-offs total **~$139**: Apple $99, Google Play $25, domain ~$15. Everything else
sits inside a free tier at this scale. [SPEC.md](SPEC.md) §8 tracks cost creep as a standing
risk.

## Dropped

**Doppler** was previously listed for secrets management. Vercel environment variables, EAS
secrets and GitHub Actions secrets cover Phases 0–4, so it would be one more service to
monitor and pay for — against SPEC §1's principle that every moving part is something one
person must maintain. Removed rather than deferred; revisit if a real need appears.
