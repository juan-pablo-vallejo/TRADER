// Shared by every schema test file. Fixtures can never be cleaned up: work_session_events is
// append-only by trigger and references users and companies, so nothing can bulk-delete
// those tables. Every test therefore runs inside a transaction that is always rolled back,
// and every statement runs on `tx`, never `db`.
import { DrizzleQueryError } from "drizzle-orm";
import { expect } from "vitest";

import type { Db } from "../src/client";
import { companies, customers, jobs, users, type workSessionEvents } from "../src/schema";

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

// What the device will do in Stage 5: 48 bits of milliseconds, version 7, variant 10, random.
export function uuidv7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// One company, one worker, one job: the rows an event must reference. Shared by the
// events and approvals tests.
export async function fixture(tx: Tx) {
  const c = one(
    await tx.insert(companies).values(company).returning({ id: companies.id }),
  );
  const worker = one(
    await tx
      .insert(users)
      .values({ companyId: c.id, email: "w@co.test", name: "Worker" })
      .returning({ id: users.id }),
  );
  const customer = one(
    await tx
      .insert(customers)
      .values({ companyId: c.id, name: "Customer" })
      .returning({ id: customers.id }),
  );
  const job = one(
    await tx
      .insert(jobs)
      .values({ companyId: c.id, customerId: customer.id, name: "Job" })
      .returning({ id: jobs.id }),
  );
  return { companyId: c.id, workerId: worker.id, jobId: job.id };
}

type Refs = Awaited<ReturnType<typeof fixture>>;

// A complete, legal clock-in as the push handler will write it.
export const started = (refs: Refs): typeof workSessionEvents.$inferInsert => ({
  id: uuidv7(),
  ...refs,
  type: "started",
  clientTimestamp: new Date(),
  clockSkewed: false,
  clockSkewMs: 0,
  attestationLevel: "none",
  schemaVersion: 1,
  timeSetByUser: false,
  initiatorUserId: refs.workerId,
});
