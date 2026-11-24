// Squawk on every new migration (docs/ARCHITECTURE.md, "Migrating a live database"; M16):
// the lock safety no other check reads. New means 0008 and later; the eight before them were
// written before the rule and run on no live database. Squawk is told each file runs in the
// transaction drizzle-kit wraps the pending migrations in, and the server's major version.
// `require-statement-timeout` is left off: the approved rule bounds a lock's wait
// (lock_timeout), and a statement that only touches the catalog needs no second limit.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

const DIR = join(import.meta.dirname, "../../migrations");
const FIRST_LINTED = 8;
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
        "--exclude=require-statement-timeout",
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

it("passes every new migration", () => {
  const files = linted();
  expect(files.length).toBeGreaterThan(0);
  expect(squawk(files)).toEqual({ ok: true, out: "" });
});
