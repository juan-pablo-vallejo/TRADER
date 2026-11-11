// Stage 2 line 5: invoice line items, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { invoiceLineItems, invoices, materials } from "../../src/schema";
import {
  billing,
  type Billing,
  fixture,
  one,
  pgError,
  rolledBack,
  sqlstate,
  uuidv7,
} from "../helpers";

async function draft(tx: Parameters<typeof billing>[0], refs: Billing) {
  return one(
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
}

const line = (
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

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("invoice_line_items", () => {
  it("accepts a line whose amount is the rounded product", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoice = await draft(tx, refs);
      const row = one(
        await tx
          .insert(invoiceLineItems)
          .values(line(refs, invoice.id))
          .returning({ amountCents: invoiceLineItems.amountCents }),
      );
      expect(row.amountCents).toBe(4998);
    });
  });

  it("rejects an amount that is not quantity times unit price", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoice = await draft(tx, refs);
      const code = await sqlstate(
        tx
          .insert(invoiceLineItems)
          .values({ ...line(refs, invoice.id), amountCents: 4997 }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a currency that differs from the invoice's", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoice = await draft(tx, refs);
      const code = await sqlstate(
        tx
          .insert(invoiceLineItems)
          .values({ ...line(refs, invoice.id), currency: "CAD" }),
      );
      expect(code).toBe("23503");
    });
  });

  it("rejects a quantity of zero", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoice = await draft(tx, refs);
      const code = await sqlstate(
        tx
          .insert(invoiceLineItems)
          .values({ ...line(refs, invoice.id), quantity: "0", amountCents: 0 }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a material of another company", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const invoice = await draft(tx, refs);
      const other = await fixture(tx);
      const material = one(
        await tx
          .insert(materials)
          .values({
            id: uuidv7(),
            companyId: other.companyId,
            jobId: other.jobId,
            loggedByUserId: other.workerId,
            description: "Tape",
            quantity: "1",
            unit: "roll",
            loggedAt: new Date(),
            capturedOffline: false,
            clockSkewed: false,
            clockSkewMs: 0,
          })
          .returning({ id: materials.id }),
      );
      const error = await pgError(
        tx
          .insert(invoiceLineItems)
          .values({ ...line(refs, invoice.id), materialId: material.id }),
      );
      expect(error.code).toBe("23503");
      expect(error.message).toContain("invoice_line_items_company_id_material_id_fk");
    });
  });
});
