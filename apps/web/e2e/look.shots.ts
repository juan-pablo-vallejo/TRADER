// Pictures of every catalogue entry (screens.ts) at 390, 768 and 1280 in each language of
// LOOK_LANGS (default `en es`), one PNG an entry, width and language in LOOK_DIR, and a
// contact sheet, index.html, grouped by width and language. LOOK_BEFORE names an earlier
// run's folder: its picture of the same entry sits beside each new one. LOOK_SCREENS
// narrows the run to some entries.
//
// Two homes. Locally (look.local.config.ts) people are signed in through `/dev-signin`,
// the empty company and the worker among them. On staging (look.config.ts,
// `scripts/staging.sh look`) the suite's admin is signed in by the single-use ticket the
// script made (tickets.ts), never printed, and only the admin's and the public entries
// run. No trace and no video keeps a session.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { reach, release, signedIn, viewportOf } from "./reach";
import { SCREENS, type As, type Entry, type Lang } from "./screens";
import { signInByTicket } from "./ticket-session";

const WIDTHS = [390, 768, 1280];
const LANGS = (process.env.LOOK_LANGS ?? "en es")
  .split(/\s+/)
  .filter((l): l is Lang => l === "en" || l === "es");
const dir = process.env.LOOK_DIR ?? "";
const before = process.env.LOOK_BEFORE ?? "";
const ticket = process.env.E2E_ADMIN_TICKET ?? "";
const staging = ticket !== "";
const frame = process.env.LOOK_PASS === "frame";
const names = (process.env.LOOK_SCREENS ?? "").split(/\s+/).filter(Boolean);

const wanted = (e: Entry): boolean => {
  if (names.length > 0 && !names.includes(e.name)) return false;
  if (staging) return e.as === "admin" || e.as === null;
  return frame ? e.area === "auth" : e.area !== "auth";
};

export const fileOf = (width: number, lang: Lang, name: string) =>
  `${width}-${lang}-${name}.png`;

async function opened(browser: Browser, as: As, lang: Lang): Promise<Page> {
  const origin = new URL(test.info().project.use.baseURL ?? "").origin;
  if (!staging) return signedIn(browser, origin, as, lang, { reducedMotion: "reduce" });
  const page = await signedIn(browser, origin, null, lang, { reducedMotion: "reduce" });
  if (as !== null) {
    expect(await signInByTicket(page, ticket), "the ticket signs the admin in").toBe(
      true,
    );
  }
  return page;
}

async function shoot(page: Page, entry: Entry, lang: Lang, width: number): Promise<void> {
  await page.setViewportSize(viewportOf(width));
  await reach(page, entry, lang);
  await page.screenshot({
    path: join(dir, fileOf(width, lang, entry.name)),
    fullPage: true,
  });
  await release(page, entry, lang);
}

function contactSheet(): void {
  const have = new Set(readdirSync(dir));
  const rows: string[] = [];
  for (const width of WIDTHS) {
    for (const lang of ["en", "es"] as const) {
      const cells = SCREENS.filter((e) => have.has(fileOf(width, lang, e.name)));
      if (cells.length === 0) continue;
      rows.push(`<h2 id="w${width}-${lang}">${width} px, ${lang}</h2>`);
      for (const e of cells) {
        const file = fileOf(width, lang, e.name);
        const old = before !== "" && existsSync(join(before, file));
        rows.push(
          `<section><h3>${e.name} <small>${e.path}${e.state ? `, ${e.state}` : ""}</small></h3>` +
            `<div class="pair">` +
            (old
              ? `<figure><figcaption>before</figcaption><img loading="lazy" src="file://${join(before, file)}"></figure>`
              : "") +
            `<figure><figcaption>${old ? "after" : ""}</figcaption><img loading="lazy" src="${file}"></figure>` +
            `</div></section>`,
        );
      }
    }
  }
  const misses = have.has("misses.txt")
    ? `<p><a href="misses.txt">Entries not reached</a></p>`
    : "";
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>TRADER look</title>` +
      `<style>body{font:14px system-ui;margin:16px}.pair{display:flex;gap:16px;align-items:flex-start}` +
      `figure{margin:0}img{max-width:640px;border:1px solid #ccc}h3 small{color:#666;font-weight:normal}</style>` +
      `<h1>TRADER look</h1>${misses}${rows.join("\n")}`,
  );
}

test("every catalogue entry, as pictures", async ({ browser }) => {
  expect(dir, "LOOK_DIR is set").not.toBe("");
  mkdirSync(dir, { recursive: true });
  const entries = SCREENS.filter(wanted);
  expect(entries.length, "the run names at least one entry").toBeGreaterThan(0);
  const misses: string[] = [];
  const pages = new Map<string, Page>();
  for (const lang of LANGS) {
    for (const entry of entries) {
      // On staging the ticket signs in once: one page for every language, told each
      // language by its cookie.
      const key = staging ? String(entry.as) : `${entry.as}-${lang}`;
      let page = pages.get(key);
      if (page === undefined) {
        page = await opened(browser, entry.as, lang);
        pages.set(key, page);
      } else if (staging) {
        const origin = new URL(test.info().project.use.baseURL ?? "").origin;
        await page
          .context()
          .addCookies([{ name: "trader_lang", value: lang, url: origin }]);
      }
      for (const width of WIDTHS) {
        if (entry.narrowOnly === true && width >= 768) continue;
        try {
          await shoot(page, entry, lang, width);
          console.log(`${fileOf(width, lang, entry.name)}`);
        } catch (error) {
          await release(page, entry, lang);
          await page
            .screenshot({ path: join(dir, `miss-${fileOf(width, lang, entry.name)}`) })
            .catch(() => undefined);
          const line = `${fileOf(width, lang, entry.name)}: ${(error as Error).message.split("\n")[0]}`;
          misses.push(line);
          console.log(`missed ${line}`);
        }
      }
    }
  }
  if (misses.length > 0) writeFileSync(join(dir, "misses.txt"), misses.join("\n") + "\n");
  contactSheet();
  console.log(`contact sheet: ${join(dir, "index.html")}`);
});
