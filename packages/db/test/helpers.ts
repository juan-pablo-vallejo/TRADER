// Shared by every schema test file. Fixtures can never be cleaned up: work_session_events is
// append-only by trigger and references users and companies, so nothing can bulk-delete
// those tables. Every test therefore runs inside a transaction that is always rolled back,
// and every statement runs on `tx`, never `db`.
import { DrizzleQueryError } from "drizzle-orm";
import { expect } from "vitest";

import type { Db } from "../src/client";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const ROLLBACK = Symbol("rollback");

// Runs `body` in a transaction and rolls it back whatever happens.
export async function rolledBack(db: Db, body: (tx: Tx) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await body(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

// drizzle-orm wraps a failed query in DrizzleQueryError; the pg error, with its SQLSTATE and
// message, is the `cause`. A statement that expects to fail aborts the enclosing transaction,
// so callers wrap it in a savepoint (`tx.transaction(...)`) when the test continues after it.
export async function pgError(
  statement: Promise<unknown>,
): Promise<{ code?: string; message: string }> {
  try {
    await statement;
  } catch (error) {
    expect(error).toBeInstanceOf(DrizzleQueryError);
    const cause = (error as DrizzleQueryError).cause as
      { code?: string; message: string } | undefined;
    if (cause === undefined) {
      throw new Error("expected a pg error as the cause", { cause: error });
    }
    return cause;
  }
  throw new Error("expected the statement to fail");
}

export async function sqlstate(statement: Promise<unknown>): Promise<string | undefined> {
  return (await pgError(statement)).code;
}

export function one<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected one row");
  return row;
}

export const company = { name: "Invariant Co", timezone: "America/New_York" };
