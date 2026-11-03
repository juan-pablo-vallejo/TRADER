// Stage 2 line 5: credit memos, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import { creditMemos, invoices } from "../src/schema";
import { billing, type Billing, one, rolledBack, sqlstate, type Tx } from "./helpers";

// An issued invoice to credit against.
async function issued(tx: Tx, refs: Billing) {
  return one(
    await tx
      .insert(invoices)
      .values({
        companyId: refs.companyId,
        customerId: refs.customerId,
        jobId: refs.jobId,
        currency: "USD",
        taxCents: 0,
        number: 1042,
        issuedAt: new Date(),
        issuedByUserId: refs.adminId,
      })
      .returning({ id: invoices.id }),
  );
}

const memo = (refs: Billing, invoiceId: string): typeof creditMemos.$inferInsert => ({
  companyId: refs.companyId,
  invoiceId,
  currency: "USD",
  number: 7,
  amountCents: 5000,
  reason: "Touch-up not completed",
  issuedByUserId: refs.adminId,
});

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("credit_memos", () => {
  it("accepts a credit against an issued invoice", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoice = await issued(tx, refs);
      const row = one(
        await tx
          .insert(creditMemos)
          .values(memo(refs, invoice.id))
          .returning({ number: creditMemos.number }),
      );
      expect(row.number).toBe(7);
    });
  });

  it("rejects a currency that differs from the invoice's", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoice = await issued(tx, refs);
      const code = await sqlstate(
        tx.insert(creditMemos).values({ ...memo(refs, invoice.id), currency: "CAD" }),
      );
      expect(code).toBe("23503");
    });
  });

  it("rejects an amount of zero", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoice = await issued(tx, refs);
      const code = await sqlstate(
        tx.insert(creditMemos).values({ ...memo(refs, invoice.id), amountCents: 0 }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a blank reason", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoice = await issued(tx, refs);
      const code = await sqlstate(
        tx.insert(creditMemos).values({ ...memo(refs, invoice.id), reason: "  " }),
      );
      expect(code).toBe("23514");
    });
  });
});
