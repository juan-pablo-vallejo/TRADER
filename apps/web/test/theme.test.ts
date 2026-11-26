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

  // The phone is on D'Sierra's red and navy for its actions; the office keeps its indigo.
  const PHONE_OWN = [
    "primary",
    "primaryPressed",
    "onPrimary",
    "action",
    "actionPressed",
    "onAction",
    "actionTint",
  ];
  const OFFICE_OWN = ["accent", "onAccent", "accentTint"];

  it("holds the same colors under the same names in the office and on the phone", () => {
    expect(web.size).toBeGreaterThan(20);
    const shared = (colors: Map<string, string>, own: string[]) =>
      Object.fromEntries([...colors].filter(([name]) => !own.includes(name)).sort());
    expect(shared(phone, PHONE_OWN)).toEqual(shared(web, OFFICE_OWN));
    for (const name of PHONE_OWN) expect([name, phone.has(name)]).toEqual([name, true]);
  });

  it("puts the phone's actions on D'Sierra's red and navy, each readable", () => {
    expect(phone.get("primary")).toBe(web.get("brand"));
    expect(phone.get("action")).toBe(web.get("brandNavy"));
    for (const [ink, ground] of [
      ["onPrimary", "primary"],
      ["onPrimary", "primaryPressed"],
      ["onAction", "action"],
      ["onAction", "actionPressed"],
      ["action", "surface"],
      ["action", "canvas"],
      ["action", "actionTint"],
      ["ink", "actionTint"],
    ] as const) {
      expect([ink, ground, contrast(phone.get(ink)!, phone.get(ground)!) >= 4.5]).toEqual(
        [ink, ground, true],
      );
    }
  });

  it("is the owner's palette", () => {
    expect(Object.fromEntries(web)).toMatchObject({
      ink: "#111827",
      inkSecondary: "#4B5563",
      canvas: "#F5F6F8",
      surface: "#FFFFFF",
      border: "#D9DCE3",
      controlBorder: "#140064",
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
    // A field's edge is their navy, and shows on the canvas a page sits on as well.
    expect(web.get("controlBorder")).toBe(web.get("brandNavy"));
    expect(
      contrast(web.get("controlBorder")!, web.get("canvas")!),
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

// D'Sierra's homepage has a scale of its own (`[data-brand]` in theme.css): their navy and
// their red with tints and shades. It is not the phone's, so the test above does not see
// it; this one holds every pair the homepage puts together to its contrast. Sign-in, the
// homepage's next page, draws on the same scale and is held to the same rules.
describe("the homepage's scale", () => {
  const web = webColors();
  const start = css.indexOf("[data-brand] {");
  const block = css.slice(start, css.indexOf("}", start));
  const scale = new Map<string, string>();
  for (const m of block.matchAll(/--((?:navy|red)-\d+):\s*([^;]+);/g)) {
    const alias = /^var\(--([a-z-]+)\)$/.exec(m[2]!.trim());
    const name = alias?.[1]?.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    scale.set(m[1]!, (name === undefined ? m[2]!.trim() : web.get(name)!).toUpperCase());
  }
  const color = (name: string) => scale.get(name) ?? web.get(name)!;
  const home = read("../src/app/(public)/home.module.css");
  const auth = read("../src/app/(auth)/auth.module.css");

  it("is their navy and their red, with what is mixed from them", () => {
    expect(Object.fromEntries(scale)).toEqual({
      "navy-900": "#0D0041",
      "navy-700": web.get("brandNavy"),
      "navy-400": "#7266A2",
      "navy-200": "#BDB8D4",
      "navy-100": "#E3E0EC",
      "navy-50": "#F3F2F7",
      "red-600": web.get("brand"),
      "red-700": "#9A0A0A",
      "red-800": "#7C0808",
    });
  });

  it("keeps every text and ground the page pairs at 4.5:1 or better", () => {
    const pairs: [string, string][] = [
      // The header, the footer and the photo viewer: white, and the quieter tint, on navy.
      ["surface", "navy-700"],
      ["surface", "navy-900"],
      ["navy-200", "navy-900"],
      // Headings, links and words on white and on the near-white band.
      ["navy-700", "surface"],
      ["navy-700", "navy-50"],
      ["ink", "navy-50"],
      ["inkSecondary", "navy-50"],
      // Call: white on their red, at rest, pointed at and pressed; and the red as a
      // link's hover color on white and on the band.
      ["surface", "red-600"],
      ["surface", "red-700"],
      ["surface", "red-800"],
      ["red-600", "surface"],
      ["red-600", "navy-50"],
    ];
    for (const [ink, ground] of pairs) {
      expect([ink, ground, contrast(color(ink), color(ground)) >= 4.5]).toEqual([
        ink,
        ground,
        true,
      ]);
    }
  });

  it("never puts the red on navy, where it cannot be seen", () => {
    // 2.63:1: under the 3:1 a control's edge or a focus ring needs.
    expect(contrast(color("red-600"), color("navy-700"))).toBeLessThan(3);
    // So no rule that paints a navy ground names a red, and the three navy places (the
    // header, the footer, the viewer) name none at all.
    const rules = [...home.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      (m) => [m[1]!.trim(), m[2]!] as const,
    );
    expect(rules.length).toBeGreaterThan(40);
    for (const [selector, body] of rules) {
      const onNavy =
        /background:\s*var\(--navy-(700|900)\)/.test(body) ||
        /\.(header|head[A-Z]\w*|brand\w*|signIn|footer\w*|viewer\w*)\b/.test(selector);
      if (onNavy) expect([selector, /--red-/.test(body)]).toEqual([selector, false]);
    }
    // A focus ring there is white.
    expect(home).toMatch(
      /\.header :focus-visible,\s*\.footer :focus-visible,\s*\.viewer :focus-visible \{\s*outline-color: var\(--surface\);/,
    );
    // Sign-in's sheet: the same rule. Its one red thing is the form's main button, on
    // white; nothing that paints navy, and nothing of the panel, names a red; and the
    // panel's focus ring is white.
    const authRules = [...auth.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      (m) => [m[1]!.trim(), m[2]!] as const,
    );
    expect(authRules.length).toBeGreaterThan(30);
    const reds = authRules.filter(([, body]) => /--red-/.test(body)).map(([sel]) => sel);
    expect(reds.map((sel) => sel.replace(/\/\*[^]*?\*\/\s*/g, ""))).toEqual([
      ".send",
      ".send:hover",
      ".send:active",
    ]);
    for (const [selector, body] of authRules) {
      const onNavy =
        /background:\s*var\(--navy-(700|900)\)/.test(body) ||
        /\.(panel|brand|mark|picture|line|home)\b/.test(selector);
      if (onNavy) expect([selector, /--red-/.test(body)]).toEqual([selector, false]);
    }
    expect(auth).toMatch(/background: var\(--navy-700\)/);
    expect(auth).toMatch(/\.panel :focus-visible \{\s*outline-color: var\(--surface\);/);
  });

  it("keeps what the sign-in form pairs at its contrast", () => {
    // The button's words on each of its reds, the heading and links, an error and the
    // helper on white, and the field's edge.
    for (const [ink, ground] of [
      ["surface", "red-600"],
      ["surface", "red-700"],
      ["surface", "red-800"],
      ["navy-700", "surface"],
      ["problemInk", "surface"],
      ["inkSecondary", "surface"],
      ["ink", "surface"],
    ] as const) {
      expect([ink, ground, contrast(color(ink), color(ground)) >= 4.5]).toEqual([
        ink,
        ground,
        true,
      ]);
    }
    expect(contrast(color("controlBorder"), color("surface"))).toBeGreaterThanOrEqual(3);
    for (const token of [
      "--red-600",
      "--navy-700",
      "--problem-ink",
      "--control-border",
    ]) {
      expect([token, auth.includes(`var(${token})`)]).toEqual([token, true]);
    }
  });

  it("names a token for every color: neither stylesheet holds a color of its own", () => {
    for (const sheet of [home, auth]) {
      expect(sheet).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    }
  });

  it("gives the browser's own bar the header's navy, on the homepage and on sign-in", () => {
    for (const file of ["(public)/page.tsx", "(auth)/sign-in/page.tsx"]) {
      const page = read(`../src/app/${file}`);
      expect([file, page.toUpperCase()]).toEqual([
        file,
        expect.stringContaining(`THEMECOLOR: "${web.get("brandNavy")}"`),
      ]);
    }
  });
});
