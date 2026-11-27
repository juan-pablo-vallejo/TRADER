// The phone's screens are built on its tokens and shared pieces, so a new screen costs
// little and every phone draws the same: read from the source itself.
//
// - No number or colour written into a style outside theme.ts: a size is a token. 0, and
//   1 as a flex weight, are not sizes.
// - No Text, TextInput or Pressable taken from react-native outside src/ui/: the app's own
//   pieces carry its font, its voice and its 48-point target.
// - No Dimensions.get: a screen asks layout.ts, which follows the window as it changes.
// - Every radio, checkbox, switch and tab says its state to a screen reader.
//
// UNMOVED lists the files not yet on the tokens; it only shrinks.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL("../src", import.meta.url).href);
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
const sources = files(src)
  .filter((path) => /\.tsx?$/.test(path))
  .map((path) => [relative(src, path), readFileSync(path, "utf8")] as const);

const UNMOVED = new Set<string>([]);

const STYLE_NUMBER =
  /\b(fontSize|lineHeight|letterSpacing|width|height|minHeight|minWidth|maxWidth|maxHeight|padding\w*|margin\w*|gap|rowGap|columnGap|borderRadius|border\w*Width|top|left|right|bottom|size|shadowRadius|shadowOpacity|elevation|opacity|flex|flexGrow|flexShrink)\s*[:=]\s*\{?\s*(-?\d+(?:\.\d+)?)\b/g;
const COLOUR = /["'`](#[0-9a-fA-F]{3,8}|rgba?\()/g;

// A number in a style: not 0, and not 1 as a flex weight.
function numbers(source: string): string[] {
  return [...source.matchAll(STYLE_NUMBER)]
    .filter(([, , value]) => value !== "0")
    .filter(([, key, value]) => !(/^flex(Grow|Shrink)?$/.test(key!) && value === "1"))
    .map(([, key, value]) => `${key}: ${value}`);
}

describe("the phone's styles", () => {
  it("write no size or colour outside theme.ts", () => {
    for (const [file, source] of sources) {
      if (file === "theme.ts" || UNMOVED.has(file)) continue;
      expect([file, numbers(source)]).toEqual([file, []]);
      expect([file, [...source.matchAll(COLOUR)].map((m) => m[1])]).toEqual([file, []]);
    }
  });

  it("keeps its list of files not yet moved to what is still true", () => {
    for (const file of UNMOVED) {
      const source = sources.find(([name]) => name === file)?.[1] ?? "";
      const raw =
        /import\s*\{[^}]*\b(Text|TextInput|Pressable)\b[^}]*\}\s*from\s*"react-native"/;
      const still =
        numbers(source).length > 0 ||
        [...source.matchAll(COLOUR)].length > 0 ||
        (!file.startsWith("ui/") && raw.test(source));
      expect([file, still]).toEqual([file, true]);
    }
  });

  it("takes Text, TextInput and Pressable from the app's own pieces", () => {
    for (const [file, source] of sources) {
      if (file.startsWith("ui/") || UNMOVED.has(file)) continue;
      const imported =
        /import\s*\{([^}]*)\}\s*from\s*"react-native"/.exec(source)?.[1] ?? "";
      const raw = imported
        .split(",")
        .map((name) => name.trim().replace(/^type\s+/, ""))
        .filter((name) => ["Text", "TextInput", "Pressable"].includes(name));
      expect([file, raw]).toEqual([file, []]);
    }
  });

  it("reads the window through layout.ts, never Dimensions.get", () => {
    for (const [file, source] of sources) {
      expect([file, source.includes("Dimensions.get")]).toEqual([file, false]);
    }
  });

  it("says the state of every radio, checkbox, switch and tab", () => {
    for (const [file, source] of sources) {
      for (const m of source.matchAll(
        /accessibilityRole=\{?["']?(radio|checkbox|switch|tab)\b/g,
      )) {
        // The element's own props: from its role to the end of its opening tag.
        const rest = source.slice(m.index);
        const tag = rest.slice(0, rest.search(/\n\s*>|\/>/) + 1);
        expect([file, m[1], /accessibilityState=/.test(tag)]).toEqual([file, m[1], true]);
      }
    }
  });
});
