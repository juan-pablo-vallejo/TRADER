// The office is drawn from its tokens alone, read from the source itself, as the phone's
// is (apps/mobile/test/styles.test.ts). Outside theme.css, brand-fonts.css and theme.ts,
// nothing under src:
//
// - names a colour: no hex, rgb(), hsl() or named colour (`transparent`, `currentColor`
//   and `inherit` are not a colour of the brand's and stay);
// - writes a length into a declaration: no px, rem, em, ch or pt number but 0;
// - puts an inline `style` on an element;
// - asks a media query of any width but 768 px, the one breakpoint, or a container query
//   of any but 720 px, the column a table needs beside it (table.module.css).
//
// UNMOVED lists, per file, the rules it still breaks; it only shrinks: a listed rule the
// file no longer breaks fails here too, so the list is kept to what is still true.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type Rule = "colour" | "length" | "inline" | "media";

const src = fileURLToPath(new URL("../src", import.meta.url).href);
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
const THEME = new Set(["app/theme.css", "app/brand-fonts.css", "app/theme.ts"]);
const sources = files(src)
  .filter((path) => /\.(css|tsx?)$/.test(path))
  .map((path) => [relative(src, path), readFileSync(path, "utf8")] as const)
  .filter(([file]) => !THEME.has(file));

// The named colours a stylesheet could reach for; the keywords above are left out.
const NAMED =
  /\b(white|black|red|green|blue|gray|grey|silver|navy|maroon|purple|teal|olive|lime|aqua|fuchsia|orange|yellow|pink|brown|gold|indigo|violet|crimson|tomato|coral|salmon|beige|ivory|khaki|lavender|plum|orchid|tan|wheat|azure|cyan|magenta|snow|linen)\b/;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNC = /\b(rgba?|hsla?)\(/;
const LENGTH = /(?<![\w.-])-?(\d+(?:\.\d+)?)(px|rem|em|ch|pt)\b/g;

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

// A file's offences, by rule, each as the text that offends.
function offences(file: string, source: string): Record<Rule, string[]> {
  const out: Record<Rule, string[]> = { colour: [], length: [], inline: [], media: [] };
  if (file.endsWith(".css")) {
    const css = stripComments(source);
    for (const m of css.matchAll(/@(media|container)[^{]*/g)) {
      const allowed = m[1] === "media" ? ["768"] : ["719", "720"];
      for (const [whole, value, unit] of m[0].matchAll(LENGTH)) {
        if (!(allowed.includes(value!) && unit === "px")) out.media.push(whole);
      }
    }
    const body = css.replace(/@(media|container)[^{]*/g, "");
    for (const m of body.matchAll(/([-a-z]+)\s*:\s*([^;{}]+)(?=[;}])/g)) {
      const value = m[2]!;
      // A token's own name (`var(--navy-700)`) is no colour written down.
      const bare = value.replace(/var\(--[\w-]+/g, "var(");
      if (HEX.test(bare) || FUNC.test(bare) || NAMED.test(bare)) {
        out.colour.push(`${m[1]}: ${value.trim()}`);
      }
      for (const [whole, n] of value.matchAll(LENGTH)) {
        if (Number(n) !== 0) out.length.push(`${m[1]}: ${whole}`);
      }
    }
  } else {
    for (const m of source.matchAll(/["'`](#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\()/g)) {
      out.colour.push(m[1]!);
    }
    for (const m of source.matchAll(/\bstyle=\{/g)) out.inline.push(m[0]);
  }
  return out;
}

const RULES: Rule[] = ["colour", "length", "inline", "media"];

// Today's offenders, file by file. Only shrinks.
const UNMOVED: Record<string, Rule[]> = {
  "app/(auth)/auth.module.css": ["length", "media"],
  "app/(auth)/sign-in/google-button.module.css": ["colour", "length"],
  "app/(public)/home.module.css": ["length", "media"],
  "app/global-error.tsx": ["colour", "inline"],
};

describe("the office's styles", () => {
  it("name no colour, length, inline style or second breakpoint outside the theme", () => {
    for (const [file, source] of sources) {
      const found = offences(file, source);
      const allowed = new Set(UNMOVED[file] ?? []);
      for (const rule of RULES) {
        if (allowed.has(rule)) continue;
        expect([file, rule, found[rule]]).toEqual([file, rule, []]);
      }
    }
  });

  it("keeps its list of files not yet moved to what is still true", () => {
    for (const [file, rules] of Object.entries(UNMOVED)) {
      const source = sources.find(([name]) => name === file)?.[1];
      expect([file, source !== undefined]).toEqual([file, true]);
      const found = offences(file, source!);
      for (const rule of rules) {
        expect([file, rule, found[rule].length > 0]).toEqual([file, rule, true]);
      }
    }
  });
});
