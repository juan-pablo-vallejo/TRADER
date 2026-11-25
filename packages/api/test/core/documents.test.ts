// The four documents against the repository: what one states in two places is held equal
// here, so a change to one copy cannot leave the other behind.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");

// A paragraph's words on one line, whatever its wrapping.
const flat = (text: string) => text.replace(/\s+/g, " ").trim();

describe("the four documents", () => {
  it("open README with the MVP's one sentence", () => {
    const mvp = /\*\*One sentence\.\*\* ([^]*?)\n\n/.exec(read("docs/TASKS.md"));
    const readme = /^# TRADER\n\n([^]*?)\n\n/.exec(read("README.md"));
    expect(mvp?.[1]).toBeTruthy();
    expect(flat(readme?.[1] ?? "")).toBe(flat(mvp?.[1] ?? ""));
  });
});
