// Stage 2 line 5: invoices and the number counter, asserted against the migrated container.
// Rolled-back transactions throughout; see helpers.ts.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import { customers, invoiceCounters, invoices } from "../src/schema";
import {
  billing,
  type Billing,
  draftInvoice,
  fixture,
  issue,
  one,
  rolledBack,
  sqlstate,
} from "./helpers";

const draft = (refs: Billing): typeof invoices.$inferInsert => ({
  companyId: refs.companyId,
  customerId: refs.customerId,
  jobId: refs.jobId,
  currency: "USD",
  taxCents: 0,
});

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("invoice_counters", () => {
  it("rejects a series that starts at zero", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId } = await fixture(tx);
      const code = await sqlstate(
        tx
          .insert(invoiceCounters)
          .values({ companyId, nextInvoiceNumber: 0, nextCreditMemoNumber: 1 }),
      );
      expect(code).toBe("23514");
    });
  });
});

describe("invoices", () => {
  it("accepts a draft: no number, not issued", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const row = one(
        await tx
          .insert(invoices)
          .values(draft(refs))
          .returning({ number: invoices.number, issuedAt: invoices.issuedAt }),
      );
      expect(row).toEqual({ number: null, issuedAt: null });
    });
  });

  it("rejects a number on a draft", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      const code = await sqlstate(
        tx.update(invoices).set({ number: 1042 }).where(eq(invoices.id, invoiceId)),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects two invoices of one company with the same number", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const first = await draftInvoice(tx, refs);
      const second = await draftInvoice(tx, refs);
      expect((await issue(tx, refs, first.invoiceId)).number).toBe(1042);
      // The counter is the mechanism; the unique is the backstop if it is ever wound back.
      await tx
        .update(invoiceCounters)
        .set({ nextInvoiceNumber: 1042 })
        .where(eq(invoiceCounters.companyId, refs.companyId));
      expect(await sqlstate(issue(tx, refs, second.invoiceId))).toBe("23505");
    });
  });

  it("rejects an invoice to a customer who does not own the job", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const other = one(
        await tx
          .insert(customers)
          .values({ companyId: refs.companyId, name: "Other customer" })
          .returning({ id: customers.id }),
      );
      const code = await sqlstate(
        tx.insert(invoices).values({ ...draft(refs), customerId: other.id }),
      );
      expect(code).toBe("23503");
    });
  });

  it("rejects a void of a draft", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const code = await sqlstate(
        tx.insert(invoices).values({
          ...draft(refs),
          voidedAt: new Date(),
          voidedByUserId: refs.adminId,
        }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a void dated before the issue", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId } = await draftInvoice(tx, refs);
      const { issuedAt } = await issue(tx, refs, invoiceId);
      const code = await sqlstate(
        tx
          .update(invoices)
          .set({
            voidedAt: new Date(issuedAt!.getTime() - 1000),
            voidedByUserId: refs.adminId,
          })
          .where(eq(invoices.id, invoiceId)),
      );
      expect(code).toBe("23514");
    });
  });
});
