// The two themes are one: the office's custom properties (app/theme.css) and the phone's
// tokens (apps/mobile/src/theme.ts) hold the same colors under the same names, and each of
// the five status tones is readable on its tint. Read from the files themselves, so the
// test cannot drift from what ships.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const css = read("../src/app/theme.css");
const ts = read("../../mobile/src/theme.ts");

// `--ink-secondary: #4b5563;` at the top level of :root. An alias (`var(--done-ink)`) is
// followed to the color it names.
function webColors(): Map<string, string> {
  const root = css.slice(
    css.indexOf(":root {"),
    css.indexOf("}", css.indexOf(":root {")),
  );
  const raw = new Map<string, string>();
  for (const m of root.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g))
    raw.set(m[1]!, m[2]!.trim());
  const colors = new Map<string, string>();
  for (const [name, value] of raw) {
    const alias = /^var\(--([a-z0-9-]+)\)$/.exec(value);
    const resolved = alias ? raw.get(alias[1]!) : value;
    if (resolved !== undefined && /^#[0-9a-f]{6}$/i.test(resolved)) {
      colors.set(
        name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
        resolved.toUpperCase(),
      );
    }
  }
  return colors;
}

// `inkSecondary: "#4B5563",` inside `export const color = { … }`.
function phoneColors(): Map<string, string> {
  const start = ts.indexOf("export const color = {");
  const body = ts.slice(start, ts.indexOf("} as const", start));
  const colors = new Map<string, string>();
  for (const m of body.matchAll(/^\s*([A-Za-z]+):\s*"(#[0-9A-Fa-f]{6})",/gm)) {
    colors.set(m[1]!, m[2]!.toUpperCase());
  }
  return colors;
}

// WCAG 2 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("the theme", () => {
  const web = webColors();
  const phone = phoneColors();

  it("holds the same colors under the same names in the office and on the phone", () => {
    expect(web.size).toBeGreaterThan(20);
    expect(Object.fromEntries([...phone].sort())).toEqual(
      Object.fromEntries([...web].sort()),
    );
  });

  it("is the owner's palette", () => {
    expect(Object.fromEntries(web)).toMatchObject({
      ink: "#111827",
      inkSecondary: "#4B5563",
      canvas: "#F5F6F8",
      surface: "#FFFFFF",
      border: "#D9DCE3",
      controlBorder: "#8A93A2",
      accent: "#2808AC",
      accentTint: "#EEEBFA",
      brand: "#BC0C0C",
      brandNavy: "#140064",
    });
  });

  it("keeps each status tone's ink at 4.5:1 or better on its tint", () => {
    for (const tone of ["neutral", "active", "done", "attention", "problem"]) {
      const ink = web.get(`${tone}Ink`);
      const tint = web.get(`${tone}Tint`);
      expect([tone, ink, tint]).not.toContain(undefined);
      expect([tone, contrast(ink!, tint!) >= 4.5]).toEqual([tone, true]);
    }
  });

  it("gives a control an edge of 3:1 on the surface, and text 4.5:1 on canvas and surface", () => {
    expect(
      contrast(web.get("controlBorder")!, web.get("surface")!),
    ).toBeGreaterThanOrEqual(3);
    for (const ground of ["surface", "canvas"]) {
      for (const ink of ["ink", "inkSecondary", "accent"]) {
        expect([ink, ground, contrast(web.get(ink)!, web.get(ground)!) >= 4.5]).toEqual([
          ink,
          ground,
          true,
        ]);
      }
    }
    expect(contrast(web.get("onAccent")!, web.get("accent")!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("never colors a control or a status with the mark's red or navy", () => {
    const sheets = [
      "../src/app/controls.module.css",
      "../src/app/table.module.css",
      "../src/app/nav.module.css",
    ].map(read);
    for (const sheet of sheets) expect(sheet).not.toMatch(/--brand\b|--brand-navy/);
  });
});
