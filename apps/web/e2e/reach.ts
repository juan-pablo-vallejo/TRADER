// How a catalogue entry (screens.ts) is reached, for the three that open them: the look
// harness (look.shots.ts), the gates (screens.local.ts) and the sweep (sweep.shots.ts). A
// page per person and language, signed in through `/dev-signin`; then the entry's address,
// its network state, and its `open` step.
import type { Browser, BrowserContextOptions, Page } from "@playwright/test";

import { CATALOGS, EMAILS, type As, type Entry, type Lang } from "./screens";

const API = "**/api/trpc/**";

export async function signedIn(
  browser: Browser,
  origin: string,
  as: As,
  lang: Lang,
  options: BrowserContextOptions = {},
): Promise<Page> {
  const context = await browser.newContext({ baseURL: origin, ...options });
  await context.addCookies([{ name: "trader_lang", value: lang, url: origin }]);
  const page = await context.newPage();
  if (as !== null) {
    await page.goto("/dev-signin");
    await page.locator("#email").fill(EMAILS[as]);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/dev-signin"));
  }
  return page;
}

export const viewportOf = (width: number) => ({
  width,
  height: width < 768 ? 844 : 900,
});

// The entry on screen, as a person would have it; its network state stays held until
// `release`.
export async function reach(page: Page, entry: Entry, lang: Lang): Promise<void> {
  const t = CATALOGS[lang];
  if (entry.state === "first-load") await page.route(API, () => undefined);
  if (entry.state === "failure") await page.route(API, (route) => route.abort());
  await page.goto(entry.path);
  if (entry.state === "first-load") {
    await page.waitForTimeout(1_500);
  } else if (entry.state === "failure") {
    await page.getByText(t.loadFailed).first().waitFor({ timeout: 30_000 });
  } else {
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => undefined);
  }
  if (entry.open !== undefined) {
    await entry.open(page, t);
    // A panel that loads its own rows is pictured with them.
    await page
      .getByRole("dialog")
      .getByRole("status", { name: t.loadingRows })
      .waitFor({ state: "detached", timeout: 30_000 })
      .catch(() => undefined);
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => undefined);
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // `next dev`'s own badge is no part of the page. Removed, not hidden by a style tag: a
  // public page's policy admits no inline style, and on staging it refused the tag.
  await page.evaluate(() => {
    for (const badge of document.querySelectorAll("nextjs-portal")) badge.remove();
  });
}

// The network let go, and what the entry changed put back.
export async function release(page: Page, entry?: Entry, lang?: Lang): Promise<void> {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  if (entry?.after !== undefined && lang !== undefined) {
    await entry.after(page, CATALOGS[lang]).catch(() => undefined);
  }
}
