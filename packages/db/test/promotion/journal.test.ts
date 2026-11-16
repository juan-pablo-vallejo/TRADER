// The journal as the promotion reads it, against the migrations in this repository.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readJournal } from "../../src/promotion/journal";

const folder = fileURLToPath(new URL("../../migrations", import.meta.url));
const journal = readJournal(folder);
const flagsOf = (tag: string) => journal.find((entry) => entry.tag === tag)?.flags;

describe("readJournal", () => {
  it("has one entry a migration file, in order", () => {
    const files = readdirSync(folder)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(journal.map((entry) => `${entry.tag}.sql`)).toEqual(files);
    expect(journal.map((entry) => entry.idx)).toEqual(journal.map((_, i) => i));
  });

  it("hashes a file as drizzle's migrator does", () => {
    const first = journal[0];
    const sql = readFileSync(`${folder}/${first?.tag}.sql`);
    expect(first?.hash).toBe(createHash("sha256").update(sql).digest("hex"));
  });

  it("reads the flags of migrations whose text is known", () => {
    expect(flagsOf("0040_schedule-shifts")).toEqual(["drop"]);
    expect(flagsOf("0041_schedule-guards")).toEqual(["revoke"]);
    expect(flagsOf("0042_approval-reason-unscheduled")).toEqual(["enum_value_added"]);
    expect(flagsOf("0044_invoice-payments")).toEqual([]);
    expect(flagsOf("0013_app-role")).toEqual(["role_change"]);
  });
});
