// A Tab walk over a page, for the gates (screens.local.ts) and the sweep (sweep.shots.ts):
// each stop until the walk leaves the page or comes round again, and whether it draws a
// ring and comes after the stop before it in the document.
import type { Page } from "@playwright/test";

// Each Tab stop until the walk leaves the page: whether it draws a ring, and whether it
// comes after the one before it in the document.
export async function tabWalk(page: Page): Promise<string[]> {
  const faults: string[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => {
    (window as unknown as { __stops: Element[] }).__stops = [];
  });
  for (let i = 0; i < 150; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body) return null;
      const w = window as unknown as { __stops: Element[] };
      const seen = w.__stops.includes(el);
      const last = w.__stops.at(-1);
      const after =
        last === undefined ||
        (last.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      w.__stops.push(el);
      const style = getComputedStyle(el);
      const ring =
        (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
        style.boxShadow !== "none";
      const name =
        el.getAttribute("aria-label") ??
        (el.textContent ?? "").trim().slice(0, 40) ??
        el.tagName;
      return { seen, after, ring, name: `${el.tagName.toLowerCase()} "${name}"` };
    });
    if (stop === null || stop.seen) break;
    if (!stop.ring) faults.push(`no ring: ${stop.name}`);
    if (!stop.after) faults.push(`out of order: ${stop.name}`);
  }
  return faults;
}
