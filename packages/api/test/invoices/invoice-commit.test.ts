// On real commits: fifty invoices issued at once take fifty consecutive numbers
// with no gap and no duplicate, and one invoice issued twice at once takes one. In a
// disposable database (helpers.ts): an issued invoice can never be deleted.
import { invoiceCounters, invoiceLineItems, invoices } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContext } from "../../src/core/context";
import { localDirectory, type VerifiedIdentity } from "../../src/core/identity";
import { createCallerFactory } from "../../src/core/trpc";
import { appRouter } from "../../src/router";
import {
  boundIn,
  workDayIn,
  disposableDb,
  quietReporter,
  REQUEST_ID,
  uuidv7,
} from "../helpers";

let D: Awaited<ReturnType<typeof disposableDb>>;
let app: ReturnType<typeof D.app>;

beforeAll(async () => {
  D = await disposableDb();
  app = D.app({ max: 10 });
}, 60_000);
afterAll(async () => {
  await D.drop();
});

const bill = (who: VerifiedIdentity) =>
  createCallerFactory(appRouter)(
    createContext({
      directory: localDirectory,
      db: app,
      identity: who,
      reporter: quietReporter,
      requestId: REQUEST_ID,
    }),
  ).invoice;

// A committed company with a series at 1042, an admin, and `n` drafts of one line each.
async function world(n: number) {
  return D.owner.transaction(async (tx) => {
    const d = await workDayIn(tx);
    const admin = await boundIn(tx, d.companyId, "admin");
    await tx.insert(invoiceCounters).values({
      companyId: d.companyId,
      nextInvoiceNumber: 1042,
    });
    const ids = Array.from({ length: n }, () => uuidv7());
    await tx.insert(invoices).values(
      ids.map((id) => ({
        id,
        companyId: d.companyId,
        customerId: d.customerId,
        jobId: d.J,
        currency: "USD",
        taxCents: 0,
      })),
    );
    await tx.insert(invoiceLineItems).values(
      ids.map((invoiceId) => ({
        companyId: d.companyId,
        invoiceId,
        currency: "USD",
        position: 0,
        description: "Repaint",
        quantity: "1",
        unitPriceCents: 10000,
        amountCents: 10000,
      })),
    );
    return { ...d, admin, ids };
  });
}

describe("invoice.issue at once", () => {
  it("gives fifty invoices fifty consecutive numbers, none twice and none skipped", async () => {
    const d = await world(50);
    const answers = await Promise.all(
      d.ids.map((invoiceId) => bill(d.admin.who).issue({ invoiceId })),
    );
    expect(answers.every((a) => a.result === "issued")).toBe(true);
    const numbers = answers
      .map((a) => (a.result === "issued" ? a.number : 0))
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => 1042 + i));
    const [counter] = await D.owner
      .select({ next: invoiceCounters.nextInvoiceNumber })
      .from(invoiceCounters)
      .where(eq(invoiceCounters.companyId, d.companyId));
    expect(counter).toEqual({ next: 1092 });
  }, 30_000);

  it("gives one invoice issued five times at once one number", async () => {
    const d = await world(1);
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => bill(d.admin.who).issue({ invoiceId: d.ids[0]! })),
    );
    expect(answers.map((a) => a.result).sort()).toEqual([
      "duplicate",
      "duplicate",
      "duplicate",
      "duplicate",
      "issued",
    ]);
    expect(new Set(answers.map((a) => ("number" in a ? a.number : 0)))).toEqual(
      new Set([1042]),
    );
  });
});
