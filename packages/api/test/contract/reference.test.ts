// The reference generates from the pinned contract: one page per router, every procedure
// on its router's page, and the phone's mark on exactly the procedures an installed phone
// calls.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PHONE_PROCEDURES } from "../../src/contract";
import { type Wire, typeOf } from "../../src/reference";

const wire = JSON.parse(
  readFileSync(join(import.meta.dirname, "wire.json"), "utf8"),
) as Wire;

describe("the generated reference", () => {
  it("writes a page per router, each procedure on it, the phone's marked", () => {
    const out = mkdtempSync(join(tmpdir(), "reference-"));
    execFileSync("pnpm", ["exec", "tsx", "src/run-reference.ts", out], {
      cwd: join(import.meta.dirname, "../.."),
    });
    const routers = [
      ...new Set(Object.keys(wire.procedures).map((p) => p.split(".")[0])),
    ];
    expect(readdirSync(out).sort()).toEqual(
      ["index.html", ...routers.map((r) => `${r}.html`)].sort(),
    );
    const marked: string[] = [];
    for (const router of routers) {
      const html = readFileSync(join(out, `${router}.html`), "utf8");
      const listed = [...html.matchAll(/data-procedure="([^"]+)"/g)].map((m) => m[1]!);
      expect(listed).toEqual(
        Object.keys(wire.procedures)
          .filter((p) => p.startsWith(`${router}.`))
          .sort(),
      );
      marked.push(
        ...[...html.matchAll(/data-procedure="([^"]+)" data-phone=""/g)].map(
          (m) => m[1]!,
        ),
      );
    }
    expect(marked.sort()).toEqual([...PHONE_PROCEDURES].sort());
  });

  it("writes a field's type on one line", () => {
    expect(
      typeOf({
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          note: { type: ["string", "null"] },
        },
        required: ["id"],
      }),
    ).toBe("{ id: string (uuid), note?: string | null }");
    expect(typeOf({ enum: ["a", "b"] })).toBe('"a" | "b"');
    expect(typeOf({ type: "array", items: { "x-type": "date" } })).toBe("date[]");
  });
});
