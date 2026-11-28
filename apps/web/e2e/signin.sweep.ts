// One sign-in cell of the sweep (signin.sweep.config.ts): Clerk's states of the office's
// sign-in in English and Spanish, each saved as a picture and a view tree under
// SWEEP_OUT/signin-<cell>-<language>/, as sweep.shots.ts saves the web cells'. The suite's
// admin number is in Clerk's fictional range, so no text is sent and every code is 424242
// (Clerk's documentation, Test emails and phones, read 2026-11-27); it is typed, never printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { collect, type Tree } from "./collect";
import { CATALOGS, type Lang } from "./screens";

const out = process.env.SWEEP_OUT ?? "";
const PHONE = process.env.E2E_ADMIN_PHONE ?? "";
const NOBODY = "nobody.invited+clerk_test@example.com";

async function open(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.waitForFunction(
    () => (window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true,
    undefined,
    { timeout: 60_000 },
  );
}

const send = async (page: Page, address: string) => {
  await page.locator("#sign-in-address").fill(address);
  await page.locator("#sign-in-address").press("Enter");
};

// Each state, from a fresh sign-in page.
const STATES: Record<string, (page: Page, lang: Lang) => Promise<void>> = {
  "sign-in-not-added": async (page) => {
    await send(page, NOBODY);
    await page.locator("#sign-in-note").waitFor();
  },
  "sign-in-code": async (page) => {
    await send(page, PHONE);
    await page.locator("#sign-in-code").waitFor();
  },
  "sign-in-code-refused": async (page) => {
    await send(page, PHONE);
    await page.locator("#sign-in-code").fill("000000");
    await page.locator("#sign-in-code").press("Enter");
    await page
      .locator('#sign-in-code[aria-invalid="true"], [role="alert"]')
      .first()
      .waitFor();
  },
  "sign-in-new-code": async (page, lang) => {
    await send(page, PHONE);
    await page.locator("#sign-in-code").waitFor();
    const again = page.getByRole("button", { name: CATALOGS[lang].signInForm.resend });
    await again.waitFor({ timeout: 90_000 });
    await again.click();
    // The state is the sentence that says a new code went out.
    await page
      .getByRole("status")
      .filter({ hasText: CATALOGS[lang].signInForm.codeResent })
      .waitFor();
  },
};

test("sign-in's states with Clerk, pictured and read", async ({ browser }, info) => {
  expect(out, "SWEEP_OUT is set").not.toBe("");
  for (const lang of ["en", "es"] as const) {
    const dir = join(out, `signin-${info.project.name}-${lang}`);
    mkdirSync(dir, { recursive: true });
    for (const [name, reach] of Object.entries(STATES)) {
      const context = await browser.newContext({
        ...info.project.use,
        reducedMotion: "reduce",
      });
      await context.addCookies([
        { name: "trader_lang", value: lang, url: info.project.use.baseURL ?? "" },
      ]);
      const page = await context.newPage();
      let tree: Tree;
      try {
        await open(page);
        await reach(page, lang);
        await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
        tree = await collect(page, []);
        const { violations } = await new AxeBuilder({ page }).analyze();
        for (const v of violations) {
          if (v.impact === "serious" || v.impact === "critical")
            tree.faults.push(`axe ${v.id}: ${v.nodes.length} element(s)`);
        }
      } catch (error) {
        await page.screenshot({ path: join(dir, `${name}.png`) }).catch(() => undefined);
        const width = info.project.use.viewport?.width ?? 0;
        tree = {
          platform: "web",
          width,
          height: 0,
          layoutWidth: width,
          nodes: [],
          faults: [`not reached: ${(error as Error).message.split("\n")[0]}`],
        };
      }
      writeFileSync(join(dir, `${name}.json`), JSON.stringify(tree));
      await context.close();
    }
  }
});
