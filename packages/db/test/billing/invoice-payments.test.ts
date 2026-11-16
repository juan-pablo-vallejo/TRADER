// TASKS R7, recorded payments: the invoice_payments table (0044, 0045), asserted against
// the migrated container. Rolled-back transactions throughout; see helpers.ts. The catalog
// side — FORCE, the policy, the grant matrix — is row-level-security.test.ts's and
// app-role.test.ts's.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { invoicePayments, invoices } from "../../src/schema";
import {
  asApp,
  billing,
  type Billing,
  draftInvoice,
  issue,
  lockExclusive,
  one,
  pgError,
  rolledBack,
  sqlstate,
  type Tx,
  uuidv7,
} from "../helpers";

// The fixture's one line is its invoice's whole total.
async function issued(tx: Tx) {
  const refs = await billing(tx);
  const { invoiceId } = await draftInvoice(tx, refs);
  await issue(tx, refs, invoiceId);
  const total = one(
    (
      await tx.execute<{ total: number }>(sql`
        select (coalesce(sum(l.amount_cents), 0) + max(i.tax_cents))::int as total
        from invoices i join invoice_line_items l on l.invoice_id = i.id
        where i.id = ${invoiceId}
      `)
    ).rows,
  ).total;
  return { refs, invoiceId, total };
}

const payment = (
  refs: Billing,
  invoiceId: string,
  amountCents: number,
  over: Partial<typeof invoicePayments.$inferInsert> = {},
): typeof invoicePayments.$inferInsert => ({
  id: uuidv7(),
  companyId: refs.companyId,
  invoiceId,
  currency: "USD",
  amountCents,
  paidOn: "2026-11-02",
  method: "check",
  recordedByUserId: refs.adminId,
  ...over,
});

async function refused(tx: Tx, row: typeof invoicePayments.$inferInsert) {
  const error = (await pgError(
    tx.transaction((sp: Tx) => sp.insert(invoicePayments).values(row)),
  )) as { code?: string; constraint?: string };
  return { code: error.code, constraint: error.constraint };
}

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("invoice_payments", () => {
  it("takes payments up to the invoice's total, to the cent, and none beyond it", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, invoiceId, total } = await issued(tx);
      expect(total).toBeGreaterThan(2);
      const before = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
      await tx.insert(invoicePayments).values(payment(refs, invoiceId, total - 1));
      expect(await refused(tx, payment(refs, invoiceId, 2))).toEqual({
        code: "23000",
        constraint: "invoice_payments_not_overpaid",
      });
      await tx.insert(invoicePayments).values(payment(refs, invoiceId, 1));
      expect(await refused(tx, payment(refs, invoiceId, 1))).toEqual({
        code: "23000",
        constraint: "invoice_payments_not_overpaid",
      });
      // Nothing on the invoice changed: a payment is a row of its own.
      expect(await tx.select().from(invoices).where(eq(invoices.id, invoiceId))).toEqual(
        before,
      );
    });
  });

  it("refuses a draft and a void invoice", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await billing(tx);
      const { invoiceId: draft } = await draftInvoice(tx, refs);
      const no = { code: "23000", constraint: "invoice_payments_invoice_issued" };
      expect(await refused(tx, payment(refs, draft, 100))).toEqual(no);
      await issue(tx, refs, draft);
      await tx
        .update(invoices)
        .set({ voidedAt: new Date(), voidedByUserId: refs.adminId })
        .where(eq(invoices.id, draft));
      expect(await refused(tx, payment(refs, draft, 100))).toEqual(no);
    });
  });

  it("refuses an amount of nothing, an unknown method, a blank note and another currency", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, invoiceId } = await issued(tx);
      for (const [over, code, constraint] of [
        [{ amountCents: 0 }, "23514", "invoice_payments_amount_cents_positive"],
        [{ amountCents: -5 }, "23514", "invoice_payments_amount_cents_positive"],
        [{ method: "barter" }, "23514", "invoice_payments_method"],
        [{ note: "  " }, "23514", "invoice_payments_note_not_blank"],
        [
          { currency: "CAD" },
          "23503",
          "invoice_payments_company_id_invoice_id_currency_fk",
        ],
      ] as const) {
        expect([over, await refused(tx, payment(refs, invoiceId, 100, over))]).toEqual([
          over,
          { code, constraint },
        ]);
      }
    });
  });

  it("reverses a payment once, for its amount, and frees what it had paid", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, invoiceId, total } = await issued(tx);
      const paid = payment(refs, invoiceId, total);
      await tx.insert(invoicePayments).values(paid);
      const no = { code: "23000", constraint: "invoice_payments_reversal" };
      // Not for another amount.
      expect(
        await refused(
          tx,
          payment(refs, invoiceId, total - 1, { reversesPaymentId: paid.id }),
        ),
      ).toEqual(no);
      const reversal = payment(refs, invoiceId, total, { reversesPaymentId: paid.id });
      await tx.insert(invoicePayments).values(reversal);
      // Not twice, and never a reversal of a reversal.
      expect(
        await refused(
          tx,
          payment(refs, invoiceId, total, { reversesPaymentId: paid.id }),
        ),
      ).toEqual({
        code: "23505",
        constraint: "invoice_payments_reverses_payment_id_unique",
      });
      expect(
        await refused(
          tx,
          payment(refs, invoiceId, total, { reversesPaymentId: reversal.id }),
        ),
      ).toEqual(no);
      // Neither counts: the whole total can be paid again.
      await tx.insert(invoicePayments).values(payment(refs, invoiceId, total));
    });
  });

  it("refuses a reversal that names another invoice's payment", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, invoiceId } = await issued(tx);
      const second = await draftInvoice(tx, refs);
      await issue(tx, refs, second.invoiceId);
      const elsewhere = payment(refs, second.invoiceId, 100);
      await tx.insert(invoicePayments).values(elsewhere);
      expect(
        await refused(
          tx,
          payment(refs, invoiceId, 100, { reversesPaymentId: elsewhere.id }),
        ),
      ).toEqual({ code: "23000", constraint: "invoice_payments_reversal" });
    });
  });

  it("is never updated, deleted or truncated, by anyone", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, invoiceId } = await issued(tx);
      await tx.insert(invoicePayments).values(payment(refs, invoiceId, 100));
      for (const statement of [
        sql`update invoice_payments set amount_cents = 1`,
        sql`delete from invoice_payments`,
      ]) {
        const error = await pgError(tx.transaction((sp: Tx) => sp.execute(statement)));
        expect(error.message).toContain("append-only");
      }
      await lockExclusive(tx, ["invoice_payments"]);
      const truncated = await pgError(
        tx.transaction((sp: Tx) => sp.execute(sql`truncate invoice_payments`)),
      );
      expect(truncated.message).toContain("append-only");
    });
  });

  it("lets trader_app record and read its tenant's payments, and change none (42501)", async () => {
    await rolledBack(db, async (tx) => {
      const a = await issued(tx);
      const b = await issued(tx);
      await tx.insert(invoicePayments).values(payment(b.refs, b.invoiceId, 100));
      await asApp(tx, a.refs.companyId);
      await tx.insert(invoicePayments).values(payment(a.refs, a.invoiceId, 100));
      expect(
        await sqlstate(
          tx.transaction((sp: Tx) =>
            sp.insert(invoicePayments).values(payment(b.refs, b.invoiceId, 100)),
          ),
        ),
      ).toBe("42501");
      expect(
        await tx.select({ id: invoicePayments.id }).from(invoicePayments),
      ).toHaveLength(1);
      for (const statement of [
        sql`update invoice_payments set amount_cents = 1`,
        sql`delete from invoice_payments`,
      ]) {
        expect(await sqlstate(tx.transaction((sp: Tx) => sp.execute(statement)))).toBe(
          "42501",
        );
      }
    });
  });
});
