// The office on staging, as the suite's admin, at three widths: one PNG a path and width in
// LOOK_DIR, for the session that asked to read. Signed in by the single-use ticket
// `scripts/staging.sh` made (tickets.ts), redeemed as staging.spec.ts redeems its own; the
// ticket is never printed and no trace keeps the session. It writes nothing to staging.
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { signInByTicket } from "./ticket-session";

const WIDTHS = [390, 768, 1280];
const paths = (process.env.LOOK_PATHS ?? "")
  .split(/\s+/)
  .filter((p) => p.startsWith("/"));
const dir = process.env.LOOK_DIR ?? "";
const ticket = process.env.E2E_ADMIN_TICKET ?? "";

test("the office on staging, as screenshots", async ({ page }) => {
  expect(paths.length, "LOOK_PATHS names at least one path").toBeGreaterThan(0);
  expect(dir, "LOOK_DIR is set").not.toBe("");
  expect(ticket, "E2E_ADMIN_TICKET is set").not.toBe("");
  mkdirSync(dir, { recursive: true });

  const signedIn = await signInByTicket(page, ticket);
  expect(signedIn, "the ticket signs the admin in").toBe(true);

  for (const path of paths) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const name = `${path.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "home"}-${width}.png`;
      await page.screenshot({ path: join(dir, name), fullPage: true });
      console.log(
        `${path} at ${width}: ${name} (ended on ${new URL(page.url()).pathname})`,
      );
    }
  }
});
