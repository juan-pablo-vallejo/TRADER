// Entry point for `pnpm --filter @trader/api reference`: writes the reference (reference.ts)
// to ~/Library/Caches/TRADER/reference, or to the folder named as its one argument, and
// prints where.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { reference, type Wire } from "./reference";

const wire = JSON.parse(
  readFileSync(join(import.meta.dirname, "../test/contract/wire.json"), "utf8"),
) as Wire;
const out = process.argv[2] ?? join(homedir(), "Library/Caches/TRADER/reference");
mkdirSync(out, { recursive: true });
for (const [file, html] of Object.entries(reference(wire)))
  writeFileSync(join(out, file), html);
console.log(`reference: ${join(out, "index.html")}`);
