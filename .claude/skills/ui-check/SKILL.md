---
name: ui-check
description: Look at an office screen of TRADER in a real browser against the demo data, at a phone width and a desktop width, before and after a UI change. Use for any change under apps/web/src/app that alters what a screen draws.
---

# Check an office screen in the browser

The office is six screens: People (`/people`), Customers (`/customers`), Jobs (`/jobs`),
Schedule (`/schedule`), Hours (`/hours`) and Invoices (`/invoices`, and one invoice at
`/invoices/<id>`).

1. **Demo data.** `pnpm demo --reset` (never export a long `TMPDIR` for it: tsx's socket
   path breaks). Screens that commit rows nothing can delete (a correcting entry on Hours,
   an issued invoice, a payment, a sent invoice) are exercised only in `trader_demo`, and
   the demo is reset after.
2. **Server.** From `apps/web`:
   `POSTGRES_DB=trader_demo DATABASE_URL= TRADER_DEV_IDENTITY=enabled pnpm exec next dev --webpack`.
   Kill only listeners on the port (`lsof -ti :3000 -sTCP:LISTEN`). `--webpack` because the
   default bundler has looped on "Fast Refresh rebuilding" at the first page load.
3. **Sign in** at `/dev-signin` as `office@demo.invalid`.
4. **Look**, with the Playwright connector, at 390, 768 and 1280 wide: a screenshot before
   the change and after it. At each width check that nothing scrolls sideways, no control
   is under 48 pt tall when narrow or 44 pt when wide, focus is visible and in order by
   keyboard, and the console is clean.
5. **States.** Loading, empty, a refusal under its field, a load failure, and the saved
   note: each seen, or named as not seen in the report.
6. **Report** what was seen at which width and what was not; then `pnpm demo --reset`.
