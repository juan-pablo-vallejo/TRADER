// Squawk on every migration after the baseline (docs/ARCHITECTURE.md, "Migrating a live
// database"): the lock safety no other check reads. The baseline builds an empty database,
// where no lock waits on a row, and is not linted. Squawk is told each file runs in the
// transaction drizzle-kit wraps the pending migrations in, and the server's major version.
// Two rules are left off. `require-statement-timeout`: the approved rule bounds a lock's
// wait (lock_timeout), and a statement that only touches the catalog needs no second limit.
// `require-concurrent-index-creation`: every pending migration runs in one transaction, where
// CONCURRENTLY cannot run, so the approved rule builds an index plainly.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

const DIR = join(import.meta.dirname, "../../migrations");
const FIRST_LINTED = 1;
const SQUAWK = join(import.meta.dirname, "../../node_modules/.bin/squawk");

export const linted = () =>
  readdirSync(DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f) && Number(f.slice(0, 4)) >= FIRST_LINTED)
    .sort();

export function squawk(files: string[]): { ok: boolean; out: string } {
  try {
    const out = execFileSync(
      SQUAWK,
      [
        "--assume-in-transaction",
        "--pg-version=18.0",
        "--exclude=require-statement-timeout,require-concurrent-index-creation",
        "--reporter=gcc",
        ...files,
      ],
      { cwd: DIR, encoding: "utf8" },
    );
    return { ok: true, out };
  } catch (error) {
    return { ok: false, out: String((error as { stdout?: unknown }).stdout ?? error) };
  }
}

it("passes every migration after the baseline", () => {
  const files = linted();
  if (files.length > 0) expect(squawk(files)).toEqual({ ok: true, out: "" });
});

// The lint itself works: a column added NOT NULL without a default to a live table fails it.
it("refuses a migration that would lock a live table", () => {
  const dir = mkdtempSync(join(tmpdir(), "squawk-"));
  const file = join(dir, "0001_bad.sql");
  writeFileSync(file, "ALTER TABLE users ADD COLUMN nickname text NOT NULL;\n");
  expect(squawk([file]).ok).toBe(false);
});
