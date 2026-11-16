// The journal as the promotion reads it: each migration's tag, drizzle's own hash of its
// file (sha256 of the file as it is on disk, drizzle-orm's migrator) and what the reading
// flags in it. Consumed by run-promotion.ts and test/promotion/journal.test.ts.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { JournalEntry } from "./plan";
import { readMigration } from "./reading";

export function readJournal(folder: string): JournalEntry[] {
  const journal = JSON.parse(
    readFileSync(join(folder, "meta", "_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  return journal.entries.map(({ idx, tag }) => {
    const sql = readFileSync(join(folder, `${tag}.sql`), "utf8");
    return {
      idx,
      tag,
      hash: createHash("sha256").update(sql).digest("hex"),
      flags: readMigration(sql),
    };
  });
}
