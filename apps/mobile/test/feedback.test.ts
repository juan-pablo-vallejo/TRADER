// One announce helper (src/feedback.ts): the only call to the screen reader's announcement,
// and what every screen that sets a verdict calls, on both platforms.
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
const read = (path: string) => readFileSync(join(src, path), "utf8");

describe("the announce helper", () => {
  it("is the one place that speaks to the screen reader", () => {
    const speaking = files(src)
      .filter((path) => readFileSync(path, "utf8").includes("announceForAccessibility"))
      .map((path) => relative(src, path));
    expect(speaking).toEqual(["feedback.ts"]);
  });

  it("is called where a verdict is set: a wrong code, a failed save, the chip's attention", () => {
    for (const path of [
      "ui/phone-sign-in.tsx",
      "app/(tabs)/me.tsx",
      "sync/provider.tsx",
    ]) {
      expect([path, /\bannounce\(/.test(read(path))]).toEqual([path, true]);
    }
  });
});
