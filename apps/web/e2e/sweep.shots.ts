// One web cell of the sweep (sweep.config.ts names them): every catalogue entry in English
// and in Spanish, each saved as a picture and a view tree (collect.ts) under
// SWEEP_OUT/web-<cell>-<language>/, for scripts/sweep/check.mjs and the gallery. Beside
// what check.mjs reads from the tree, the collector's own faults ride in the tree: axe's
// serious and critical findings, a Tab stop with no ring or out of order, an error the page
// logged, sideways scroll, an animation under reduced motion. An entry that cannot be
// reached is a fault of its own.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { collect, type Tree } from "./collect";
import { reach, release, signedIn } from "./reach";
import { CATALOGS, SCREENS, type Lang } from "./screens";
import { tabWalk } from "./tab-walk";

const out = process.env.SWEEP_OUT ?? "";
const frame = process.env.SWEEP_PASS === "frame";
const LANGS: Lang[] = ["en", "es"];

// The catalogue's own strings that end in an ellipsis: said so on purpose.
const ellipses = (lang: Lang): string[] => {
  const found: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string" && /(…|\.\.\.)$/.test(v)) found.push(v);
    else if (v !== null && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(CATALOGS[lang]);
  return found;
};

// SWEEP_SCREENS narrows a run to some entries, to try a change; such a run is partial.
const only = (process.env.SWEEP_SCREENS ?? "").split(/\s+/).filter(Boolean);
const entries = SCREENS.filter(
  (e) =>
    (frame ? e.area === "auth" : e.area !== "auth") &&
    (only.length === 0 || only.includes(e.name)),
);

test("every catalogue entry, pictured and read", async ({ browser }, info) => {
  expect(out, "SWEEP_OUT is set").not.toBe("");
  const use = info.project.use;
  const origin = new URL(use.baseURL ?? "").origin;
  const width = use.viewport?.width ?? 1280;
  for (const lang of LANGS) {
    const dir = join(out, `web-${info.project.name}-${lang}`);
    mkdirSync(dir, { recursive: true });
    const started = Date.now();
    const allowed = ellipses(lang);
    const pages = new Map<string, { page: Page; logged: string[] }>();
    for (const entry of entries) {
      if (entry.narrowOnly === true && width >= 768) continue;
      const key = String(entry.as);
      let held = pages.get(key);
      if (held === undefined) {
        const page = await signedIn(browser, origin, entry.as, lang, {
          viewport: use.viewport,
          deviceScaleFactor: use.deviceScaleFactor,
          reducedMotion: "reduce",
          userAgent: use.userAgent,
        });
        const logged: string[] = [];
        page.on("console", (m) => {
          if (m.type() === "error") logged.push(m.text().split("\n")[0]!.slice(0, 160));
        });
        page.on("pageerror", (e) => logged.push(`thrown: ${e.message.slice(0, 160)}`));
        held = { page, logged };
        pages.set(key, held);
      }
      const { page, logged } = held;
      logged.length = 0;
      let tree: Tree;
      try {
        await reach(page, entry, lang);
        await page.screenshot({ path: join(dir, `${entry.name}.png`), fullPage: true });
        tree = await collect(page, allowed);
        const { violations } = await new AxeBuilder({ page }).analyze();
        for (const v of violations) {
          if (v.impact === "serious" || v.impact === "critical")
            tree.faults.push(`axe ${v.id}: ${v.nodes.length} element(s)`);
        }
        if (entry.open === undefined && entry.state === undefined) {
          tree.faults.push(...new Set(await tabWalk(page)));
        }
        // A held or refused request is the state asked for, not a fault of the page's.
        if (entry.state === undefined)
          tree.faults.push(...logged.map((l) => `logged: ${l}`));
      } catch (error) {
        await page
          .screenshot({ path: join(dir, `${entry.name}.png`) })
          .catch(() => undefined);
        tree = {
          platform: "web",
          width,
          height: 0,
          layoutWidth: width,
          nodes: [],
          faults: [`not reached: ${(error as Error).message.split("\n")[0]}`],
        };
      }
      await release(page, entry, lang);
      writeFileSync(join(dir, `${entry.name}.json`), JSON.stringify(tree));
    }
    for (const { page } of pages.values()) await page.context().close();
    // The cell's own time, for the sweep's budget (verdict.mjs adds them up).
    writeFileSync(
      join(dir, "cell.json"),
      JSON.stringify({
        platform: "web",
        screens: entries.length,
        seconds: Math.round((Date.now() - started) / 1000),
      }),
    );
  }
});
