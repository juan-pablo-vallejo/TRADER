// The office's gates, over the whole catalogue (screens.ts), in the office suite
// (local.config.ts, `trader-ws e2e`), in both languages:
//
// - axe at 390 and 1280: no serious or critical violation;
// - nothing scrolls sideways at 390, 768 or 1280;
// - a Tab walk on every screen: each stop shows its focus ring, and the stops follow the
//   page's own order.
//
// KNOWN lists the faults these found on the day they were written; it only shrinks. A
// fault outside it fails the run, and so does a listed fault no longer seen.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { reach, release, signedIn, viewportOf } from "./reach";
import { SCREENS, type Lang } from "./screens";
import { tabWalk } from "./tab-walk";

const LANGS: Lang[] = ["en", "es"];

const KNOWN: readonly string[] = [];

const sideways = (page: Page) =>
  page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });

// The office and public entries; sign-in's frame needs its own server (look.local.config.ts).
const ENTRIES = SCREENS.filter((e) => e.area !== "auth");

test("every screen and state: axe, no sideways scroll, a visible focus in order", async ({
  browser,
}) => {
  test.setTimeout(3_600_000);
  const found: string[] = [];
  const pages = new Map<string, Page>();
  for (const lang of LANGS) {
    for (const entry of ENTRIES) {
      const key = `${entry.as}-${lang}`;
      let page = pages.get(key);
      if (page === undefined) {
        const origin = new URL(test.info().project.use.baseURL ?? "").origin;
        // Under reduced motion: a colour measured half way through its transition (a button
        // turning from Add to Close) is no colour the page shows at rest.
        page = await signedIn(browser, origin, entry.as, lang, {
          reducedMotion: "reduce",
        });
        pages.set(key, page);
      }
      for (const width of [390, 768, 1280]) {
        if (entry.narrowOnly === true && width >= 768) continue;
        const at = `${entry.name} ${width} ${lang}`;
        try {
          await page.setViewportSize(viewportOf(width));
          await reach(page, entry, lang);
        } catch (error) {
          found.push(`${at}: not reached: ${(error as Error).message.split("\n")[0]}`);
          await release(page, entry, lang);
          continue;
        }
        const over = await sideways(page);
        if (over > 0) found.push(`${at}: scrolls sideways by ${over} px`);
        if (width !== 768) {
          const { violations } = await new AxeBuilder({ page }).analyze();
          for (const v of violations) {
            if (v.impact === "serious" || v.impact === "critical") {
              found.push(`${at}: axe ${v.id} (${v.nodes.length})`);
            }
          }
        }
        if (entry.open === undefined && entry.state === undefined) {
          for (const fault of new Set(await tabWalk(page))) found.push(`${at}: ${fault}`);
        }
        await release(page, entry, lang);
      }
    }
  }
  const fresh = found.filter((f) => !KNOWN.includes(f));
  const gone = KNOWN.filter((f) => !found.includes(f));
  console.log(
    `screens: ${found.length} faults, ${fresh.length} not known, ${gone.length} gone`,
  );
  for (const f of fresh) console.log(`  new: ${f}`);
  for (const f of gone) console.log(`  gone: ${f}`);
  expect({ fresh, gone }).toEqual({ fresh: [], gone: [] });
});
