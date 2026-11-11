// Stage 2 line 5: credit memos, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts.
import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { creditMemos } from "../../src/schema";
import {
  billing,
  type Billing,
  draftInvoice,
  issue,
  one,
  rolledBack,
  sqlstate,
  type Tx,
} from "../helpers";

// An issued invoice to credit against.
async function issued(tx: Tx, refs: Billing) {
  const { invoiceId } = await draftInvoice(tx, refs);
  await issue(tx, refs, invoiceId);
  return invoiceId;
}

// The trigger (0010) assigns the number; the column is NOT NULL, so the insert says NULL.
type MemoInsert = Omit<typeof creditMemos.$inferInsert, "number"> & { number: SQL };

const memo = (refs: Billing, invoiceId: string): MemoInsert => ({
  companyId: refs.companyId,
  invoiceId,
  currency: "USD",
  number: sql`NULL`,
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
      const invoiceId = await issued(tx, refs);
      const row = one(
        await tx
          .insert(creditMemos)
          .values(memo(refs, invoiceId))
          .returning({ number: creditMemos.number }),
      );
      expect(row.number).toBe(7);
    });
  });

  it("rejects a currency that differs from the invoice's", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoiceId = await issued(tx, refs);
      const code = await sqlstate(
        tx.insert(creditMemos).values({ ...memo(refs, invoiceId), currency: "CAD" }),
      );
      expect(code).toBe("23503");
    });
  });

  it("rejects an amount of zero", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoiceId = await issued(tx, refs);
      const code = await sqlstate(
        tx.insert(creditMemos).values({ ...memo(refs, invoiceId), amountCents: 0 }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a blank reason", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoiceId = await issued(tx, refs);
      const code = await sqlstate(
        tx.insert(creditMemos).values({ ...memo(refs, invoiceId), reason: "  " }),
      );
      expect(code).toBe("23514");
    });
  });
});
