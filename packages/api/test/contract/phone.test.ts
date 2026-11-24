// The phone's procedures (contract/phone.ts) are exactly the ones its source calls. A call
// to a twelfth procedure fails here until the list names it, and with it the additive-only
// rule; a procedure the phone stops calling stays listed until no supported build calls it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

import { PHONE_PROCEDURES } from "../../src/contract";

const SRC = join(import.meta.dirname, "../../../../apps/mobile/src");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
  });
}

// `.router.procedure.query(` or `.mutate(`, line breaks allowed between the parts, as a
// client built by createApi is called.
const CALL =
  /\.\s*([a-z][A-Za-z]*)\s*\.\s*([a-z][A-Za-z]*)\s*\.\s*(?:query|mutate)\s*\(/g;

it("lists every procedure the phone calls, and the phone calls nothing else", () => {
  const files = sources(SRC);
  expect(files.length).toBeGreaterThan(20);
  const called = new Set<string>();
  for (const file of files) {
    for (const m of readFileSync(file, "utf8").matchAll(CALL))
      called.add(`${m[1]}.${m[2]}`);
  }
  expect([...called].sort()).toEqual([...PHONE_PROCEDURES].sort());
});
