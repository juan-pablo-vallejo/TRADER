// Which language the app opens in: the first of the phone's languages that is one of ours,
// English when none is: a pure function of what the phone reported.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { preferred } from "../src/i18n/preferred";

describe("preferred", () => {
  it("takes the first of the phone's languages that the app has", () => {
    expect(preferred(["es", "en"])).toBe("es");
    expect(preferred(["pt", "es", "en"])).toBe("es");
    expect(preferred(["en"])).toBe("en");
  });

  it("is English when the phone has none of them, or reports nothing", () => {
    expect(preferred(["pt", "fr"])).toBe("en");
    expect(preferred([null])).toBe("en");
    expect(preferred([])).toBe("en");
  });
});

// The system's own questions (location, Face ID) are asked in the phone's language: each
// purpose string app.json gives in English has its Spanish beside it (locales/es.json).
describe("the purpose strings", () => {
  const read = (path: string) =>
    JSON.parse(
      readFileSync(fileURLToPath(new URL(path, import.meta.url).href), "utf8"),
    ) as {
      expo: { plugins: (string | [string, Record<string, unknown>])[] };
      ios: Record<string, string>;
    };
  const KEY: Record<string, string> = {
    locationWhenInUsePermission: "NSLocationWhenInUseUsageDescription",
    faceIDPermission: "NSFaceIDUsageDescription",
  };

  it("are in Spanish for every one asked in English", () => {
    const english = read("../app.json")
      .expo.plugins.flatMap((plugin) => (typeof plugin === "string" ? [] : [plugin[1]]))
      .flatMap((options) => Object.keys(options).filter((key) => key in KEY))
      .map((key) => KEY[key]!);
    const spanish = read("../locales/es.json").ios;
    expect(english.length).toBeGreaterThan(0);
    for (const key of new Set(english)) {
      expect([key, typeof spanish[key] === "string" && spanish[key] !== ""]).toEqual([
        key,
        true,
      ]);
    }
  });
});
