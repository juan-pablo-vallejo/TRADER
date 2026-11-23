---
name: ui-check
description: Look at an office screen of TRADER in a real browser against the demo data, at a phone width and a desktop width, before and after a UI change. Use for any change under apps/web/src/app that alters what a screen draws.
---

# Check an office screen in the browser

Three layouts (`apps/web/src/app`, one route group each):

- **Public**, `(public)`: `/`, D Sierra's homepage, and `/get`, `/privacy`, `/terms` as they
  are written. No menu, nothing of Clerk loaded.
- **Sign-in**, `(auth)`: `/sign-in`, the office's own one-field form on D'Sierra's brand,
  beside their navy. Locally it is a 404 under the development identity, and `/dev-signin`
  stands in for it; its frame can be seen on a server started with no Clerk keys and no
  development identity, and the real thing under `scripts/staging.sh local serve`.
- **Office**, `(office)`: Today (`/today`, where a signed-in person lands), Schedule
  (`/schedule`), Hours (`/hours`), Jobs (`/jobs`) with Customers (`/customers`) as the tab
  beside it, Invoices (`/invoices`, and one invoice at `/invoices/<id>`), People (`/people`),
  and Settings (`/settings`) behind the person's name in the header; `/profile` is its old
  address.

1. **Demo data.** `pnpm demo --reset` (never export a long `TMPDIR` for it: tsx's socket
   path breaks). Screens that commit rows nothing can delete (a correcting entry on Hours,
   an issued invoice, a payment, a sent invoice) are exercised only in `trader_demo`, and
   the demo is reset after.
2. **Server.** From `apps/web`:
   `POSTGRES_DB=trader_demo DATABASE_URL= TRADER_DEV_IDENTITY=enabled pnpm exec next dev --webpack`.
   Kill only listeners on the port (`lsof -ti :3000 -sTCP:LISTEN`). `--webpack` because the
   default bundler has looped on "Fast Refresh rebuilding" at the first page load.
3. **Sign in** at `/dev-signin` as `office@demo.invalid`. It lands on `/today`.
4. **Look**, with the Playwright connector, at 390, 768 and 1280 wide: a screenshot before
   the change and after it. At each width check that nothing scrolls sideways, focus is
   visible and in order by keyboard, and the console is clean.
5. **Density.** One breakpoint, 768 px (`theme.css`). Below it: 17 px text, and no control
   or row under 48 px tall. From it up: 15 px text, table rows 40 px, controls 36 px, and
   none smaller. A checkbox or a radio is its 24 px box inside a line that is the target.
6. **States.** A first load (placeholder rows, never the word "Loading"), empty, a refusal
   under its field, a load failure, and the saved note: each seen, or named as not seen in
   the report. A screen visited before opens on its rows at once.
7. **Report** what was seen at which width and what was not; then `pnpm demo --reset`.
