---
name: interface-change
description: The lifecycle for a TRADER batch that changes what a person sees or touches, in the office (apps/web/src/app) or on the phone (apps/mobile/src/app, ui, i18n, theme.ts) - look before, build on the tokens, look after at three widths in both languages, the phone on both platforms, then one review of the rendered screens by an agent that did not write them. Use for every such batch.
---

# An interface batch

Runs inline: a forked skill cannot start agents. `docs/TASKS.md` and `CLAUDE.md` decide what
is built and when to stop and ask; this carries out rule 3's sentence on interface batches.
The method and its reviewer (the `frontend-excellence` skill, the `visual-qa` agent) are the
owner's, installed on this Mac. TRADER's own tokens and rules come first.

Three layouts (`apps/web/src/app`, one route group each):

- **Public**, `(public)`: `/`, D'Sierra's homepage, and `/get`, `/privacy`, `/terms` as they
  are written. No menu, nothing of Clerk loaded.
- **Sign-in**, `(auth)`: `/sign-in`, the office's own one-field form on D'Sierra's brand,
  beside their navy. Locally it is a 404 under the development identity, and `/dev-signin`
  stands in for it; its frame can be seen on a server started with no Clerk keys and no
  development identity, and the real thing under `scripts/staging.sh local serve`.
- **Office**, `(office)`: Today (`/today`, where a signed-in person lands), Schedule
  (`/schedule`), Hours (`/hours`), Jobs (`/jobs`) with Customers (`/customers`) as the tab
  beside it, Invoices (`/invoices`, and one invoice at `/invoices/<id>`), People (`/people`),
  and Settings (`/settings`) behind the person's name in the header.

1. **What.** The list's item and its Done when. A screenshot of each screen it touches at
   390, 768 and 1280, before the change.
2. **Demo data.** `pnpm demo --reset` (never export a long `TMPDIR` for it: tsx's socket
   path breaks). Screens that commit rows nothing can delete (a correcting entry on Hours,
   an issued invoice, a payment, a sent invoice) are exercised only in `trader_demo`, and
   the demo is reset after.
3. **Server.** From `apps/web`:
   `POSTGRES_DB=trader_demo DATABASE_URL= TRADER_DEV_IDENTITY=enabled pnpm exec next dev --webpack`.
   Kill only listeners on the port (`lsof -ti :3000 -sTCP:LISTEN`). `--webpack` because the
   default bundler has looped on "Fast Refresh rebuilding" at the first page load.
4. **Sign in** at `/dev-signin` as `office@demo.invalid`. It lands on `/today`.
5. **Build** on the tokens (`theme.css` and `theme.ts`, held equal by a test) and the shared
   pieces. A string lands in English and Spanish in the same commit.
6. **Look**, in the session's browser, at 390, 768 and 1280 wide, in English and in Spanish:
   a screenshot before the change and after it. At each width nothing scrolls sideways,
   focus is visible and in order by keyboard, and the console is clean.
7. **Density.** One breakpoint, 768 px (`theme.css`). Below it: 17 px text, and no control
   or row under 48 px tall. From it up: 15 px text, table rows 40 px, controls 36 px, and
   none smaller. A checkbox or a radio is its 24 px box inside a line that is the target.
8. **States.** A first load (placeholder rows, never the word "Loading"), empty, a refusal
   under its field, a load failure, and the saved note: each seen, or named as not seen in
   the report. A screen visited before opens on its rows at once.
9. **The phone.** A phone screen is seen on the iPhone simulator and the Android emulator in
   both languages; the `verify` skill says how its flows are run.
10. **Review.** Hand the rendered screens to `visual-qa` as the method's gate says: the
    item's requirement, the standards as paths (this file, `theme.css`, the MVP), the local
    address and its sign-in, the evidence folder. Opus for a small change; Fable for a
    screen with the clock, hours or money, and for an audit. A Critical or High finding
    blocks. Where the reviewer is not installed, the report says "not independently
    reviewed".
11. **Report** what was seen at which width and in which language, what the review found,
    and what was not seen; then `pnpm demo --reset`.
