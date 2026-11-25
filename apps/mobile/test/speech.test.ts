// The language a screen reader speaks the app in (src/i18n/preferred.ts, ui/text.tsx): the
// one chosen in the app, set on every text and every control it reads.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { speechLanguage } from "../src/i18n/preferred";

const src = fileURLToPath(new URL("../src", import.meta.url).href);
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
const sources = files(src)
  .filter((path) => path.endsWith(".tsx"))
  .map((path) => [relative(src, path), readFileSync(path, "utf8")] as const);

// Each opening tag of an element, its props whole: a `>` inside braces is not its end. A
// tag has its props after it; `useRef<TextInput>` is a type, not an element.
function tags(source: string, name: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(new RegExp(`<${name}\\s`, "g"))) {
    let depth = 0;
    let i = m.index;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
    }
    found.push(source.slice(m.index, i + 1));
  }
  return found;
}

describe("the screen reader's language", () => {
  it("is the language chosen in the app", () => {
    expect(speechLanguage("es")).toBe("es");
    expect(speechLanguage("en")).toBe("en");
  });

  it("is set on every text, through the app's own Text", () => {
    const native = sources
      .filter(
        ([path, source]) =>
          path !== "ui/text.tsx" &&
          /import\s*\{[^}]*\bText\b[^}]*\}\s*from\s*"react-native"/.test(source),
      )
      .map(([path]) => path);
    expect(native).toEqual([]);
  });

  it("is set on every control a screen reader reads", () => {
    const missing = sources.flatMap(([path, source]) =>
      ["Pressable", "TextInput"].flatMap((name) =>
        tags(source, name)
          .filter(
            (tag) =>
              !tag.includes("accessibilityLanguage") &&
              !tag.includes("accessible={false}"),
          )
          .map((tag) => `${path}: ${tag.split("\n")[0]}`),
      ),
    );
    expect(missing).toEqual([]);
  });
});
