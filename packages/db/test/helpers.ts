// Shared by every schema test file. Fixtures can never be cleaned up: work_session_events is
// append-only by trigger and references users and companies, so nothing can bulk-delete
// those tables. Every test therefore runs inside a transaction that is always rolled back,
// and every statement runs on `tx`, never `db`.
import { DrizzleQueryError, eq } from "drizzle-orm";
import { expect } from "vitest";

import type { Db } from "../src/client";
import {
  companies,
  customers,
  invoiceCounters,
  invoiceLineItems,
  invoices,
  jobs,
  users,
  type workSessionEvents,
} from "../src/schema";

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
export async function fixture(tx: Tx, values = company) {
  const c = one(
    await tx.insert(companies).values(values).returning({ id: companies.id }),
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

// The billing rows on top of fixture(): the job's customer, the admin who issues, and the
// counter row starting where the partner's series left off. Shared by the invoice, line,
// credit memo and guard tests.
export async function billing(tx: Tx, values = company) {
  const refs = await fixture(tx, values);
  const job = one(
    await tx
      .select({ customerId: jobs.customerId })
      .from(jobs)
      .where(eq(jobs.id, refs.jobId)),
  );
  const admin = one(
    await tx
      .insert(users)
      .values({
        companyId: refs.companyId,
        email: "a@co.test",
        name: "Admin",
        role: "admin",
      })
      .returning({ id: users.id }),
  );
  await tx.insert(invoiceCounters).values({
    companyId: refs.companyId,
    nextInvoiceNumber: 1042,
    nextCreditMemoNumber: 7,
  });
  return { ...refs, customerId: job.customerId, adminId: admin.id };
}

export type Billing = Awaited<ReturnType<typeof billing>>;

// One line as the office snapshots it: 2.5 gal at $19.99 is $49.98 after rounding.
export const line = (
  refs: Billing,
  invoiceId: string,
): typeof invoiceLineItems.$inferInsert => ({
  companyId: refs.companyId,
  invoiceId,
  currency: "USD",
  position: 0,
  description: "Interior walls, two coats",
  quantity: "2.500",
  unit: "gal",
  unitPriceCents: 1999,
  amountCents: 4998,
});

// A draft with one line, ready to issue.
export async function draftInvoice(tx: Tx, refs: Billing) {
  const invoice = one(
    await tx
      .insert(invoices)
      .values({
        companyId: refs.companyId,
        customerId: refs.customerId,
        jobId: refs.jobId,
        currency: "USD",
        taxCents: 0,
      })
      .returning({ id: invoices.id }),
  );
  const item = one(
    await tx
      .insert(invoiceLineItems)
      .values(line(refs, invoice.id))
      .returning({ id: invoiceLineItems.id }),
  );
  return { invoiceId: invoice.id, lineId: item.id };
}

// The issue transition as the office will perform it: the trigger (0010) assigns the number.
export async function issue(tx: Tx, refs: Billing, invoiceId: string) {
  return one(
    await tx
      .update(invoices)
      .set({ issuedAt: new Date(), issuedByUserId: refs.adminId })
      .where(eq(invoices.id, invoiceId))
      .returning({ number: invoices.number, issuedAt: invoices.issuedAt }),
  );
}

// Rows two connections can both see: the billing fixture committed, with a cleanup that
// deletes it in reverse. The company name carries a random suffix, so a row a crashed run
// leaves behind says which run made it and is never mistaken for a rolled-back fixture. The
// draft stays a draft in every committed state, because the cross-connection tests roll back
// every issue, so the cleanup is always allowed.
export async function committedBilling(db: Db) {
  const name = `${company.name} ${crypto.randomUUID().slice(0, 8)}`;
  const refs = await db.transaction((tx) => billing(tx, { ...company, name }));
  const draft = await db.transaction((tx) => draftInvoice(tx, refs));
  const cleanup = async () => {
    await db.delete(invoices).where(eq(invoices.id, draft.invoiceId));
    await db.delete(invoiceCounters).where(eq(invoiceCounters.companyId, refs.companyId));
    await db.delete(jobs).where(eq(jobs.id, refs.jobId));
    await db.delete(customers).where(eq(customers.id, refs.customerId));
    await db.delete(users).where(eq(users.companyId, refs.companyId));
    await db.delete(companies).where(eq(companies.id, refs.companyId));
  };
  return { ...refs, ...draft, cleanup };
}
