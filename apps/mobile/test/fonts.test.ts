// The app's fonts ship inside it (src/fonts.ts), so no phone draws a weight it has no face for
// and cuts the line's end. Every weight lands on a shipped file with the weight cleared, and
// what Text does not reach (a text field, a family named by hand) names a shipped file.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

// The packages hand the bundler font files, which a test cannot load; here each is a number,
// as a bundled asset is.
vi.mock("@expo-google-fonts/inter", () => ({
  Inter_400Regular: 1,
  Inter_500Medium: 2,
  Inter_600SemiBold: 3,
  Inter_700Bold: 4,
}));
vi.mock("@expo-google-fonts/bodoni-moda", () => ({ BodoniModa_700Bold: 5 }));

import { FONTS, fontFile, fontFor } from "../src/fonts";

const src = fileURLToPath(new URL("../src", import.meta.url).href);
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
const sources = files(src)
  .filter((path) => /\.tsx?$/.test(path))
  .map((path) => [relative(src, path), readFileSync(path, "utf8")] as const);

describe("the app's fonts", () => {
  it("gives every weight a shipped file and clears the weight", () => {
    for (const weight of [
      "normal",
      "bold",
      "100",
      "400",
      "500",
      "600",
      "700",
      "900",
    ] as const) {
      const style = fontFor({ fontWeight: weight });
      expect(Object.keys(FONTS)).toContain(style.fontFamily);
      expect(style.fontWeight).toBe("normal");
    }
    expect(fontFor({ fontWeight: "600" }).fontFamily).toBe("Inter_600SemiBold");
    expect(fontFor(undefined).fontFamily).toBe("Inter_400Regular");
  });

  it("leaves a family already named", () => {
    expect(fontFor({ fontFamily: "BodoniModa_700Bold" }).fontFamily).toBe(
      "BodoniModa_700Bold",
    );
  });

  it("names only shipped files by hand", () => {
    const named = sources.flatMap(([file, source]) =>
      [...source.matchAll(/fontFamily:\s*"([^"]+)"/g)].map((m) => [file, m[1]] as const),
    );
    for (const [file, family] of named) {
      expect(Object.keys(FONTS), `${file} names ${family}`).toContain(family);
    }
  });

  it("puts every text field in a shipped font", () => {
    const fields = sources.filter(([, source]) => /<TextInput\s/.test(source));
    expect(fields.length).toBeGreaterThan(0);
    for (const [file, source] of fields) {
      expect(source, `${file} draws a TextInput`).toMatch(/fontFamily:\s*fontFile\(/);
    }
    expect(fontFile()).toBe("Inter_400Regular");
  });
});
