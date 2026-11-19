// invoice.recordPayment, reversePayment, what an invoice owes and the void rule.
// A payment changes no invoice row; payments never total more than the
// invoice; a void invoice takes no payment; another company's invoice is FORBIDDEN.
// Rolled-back transactions; the database's own guards are the db suite's
// (billing/invoice-payments.test.ts).
import { invoiceCounters, invoices } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  workDayIn,
  outcome,
  ownerDb,
  rolledBack,
  uuidv7,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

// A company with a series at 1042 and an admin; another company with an issued invoice.
async function office(tx: Tx) {
  const day = await workDayIn(tx);
  const other = await workDayIn(tx);
  const admin = await boundIn(tx, day.companyId, "admin");
  const theirAdmin = await boundIn(tx, other.companyId, "admin");
  const worker = await boundIn(tx, day.companyId, "worker");
  for (const companyId of [day.companyId, other.companyId]) {
    await tx.insert(invoiceCounters).values({ companyId, nextInvoiceNumber: 1042 });
  }
  await becomeApp(tx);
  const as = (who: unknown) => appCallerIn(tx, who).invoice;
  const bill = as(admin.who);
  // An invoice of one line, $520.00, plus tax: issued unless told otherwise.
  const invoice = async (
    o: { issue?: boolean; taxCents?: number; jobId?: string; by?: typeof bill } = {},
  ) => {
    const api = o.by ?? bill;
    const id = uuidv7();
    await api.create({ id, jobId: o.jobId ?? day.J, currency: "USD" });
    await api.save({
      invoiceId: id,
      taxCents: o.taxCents ?? 0,
      lines: [
        {
          id: uuidv7(),
          description: "Repaint",
          quantity: "8",
          unit: "h",
          unitPriceCents: 6500,
        },
      ],
    });
    if (o.issue !== false) await api.issue({ invoiceId: id });
    return id;
  };
  const foreign = await invoice({ by: as(theirAdmin.who), jobId: other.J });
  // Back in the first company's tenant for whatever the test reads next.
  await bill.list();
  return { day, other, admin, worker, as, bill, invoice, foreign };
}

const pay = (
  invoiceId: string,
  amountCents: number,
  over: Record<string, unknown> = {},
) => ({
  id: uuidv7(),
  invoiceId,
  amountCents,
  paidOn: "2026-11-02",
  method: "check" as const,
  note: null as string | null,
  ...over,
});

describe("invoice.recordPayment", () => {
  it("records what was paid; the invoice shows what is owed, and its own row never changes", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await o.invoice({ taxCents: 3640 });
      await tx.execute(sql`reset role`);
      const before = await tx.select().from(invoices).where(eq(invoices.id, id));
      await becomeApp(tx);
      expect(await o.bill.read({ invoiceId: id })).toMatchObject({
        totalCents: 55640,
        paidCents: 0,
        owedCents: 55640,
        payments: [],
      });
      const first = pay(id, 20000, { note: "Check 1187" });
      expect(await o.bill.recordPayment(first)).toEqual({ result: "recorded" });
      expect(await o.bill.recordPayment(first)).toEqual({ result: "duplicate" });
      expect(
        await o.bill.recordPayment(
          pay(id, 35640, { method: "bank_transfer", paidOn: "2026-11-09" }),
        ),
      ).toEqual({ result: "recorded" });
      const read = await o.bill.read({ invoiceId: id });
      expect(read).toMatchObject({ paidCents: 55640, owedCents: 0, state: "issued" });
      expect(read.payments).toMatchObject([
        {
          id: first.id,
          amountCents: 20000,
          paidOn: "2026-11-02",
          method: "check",
          note: "Check 1187",
          recordedBy: expect.stringContaining("admin"),
          reversesPaymentId: null,
          reversed: false,
        },
        { amountCents: 35640, method: "bank_transfer", paidOn: "2026-11-09" },
      ]);
      expect((await o.bill.list()).find((i) => i.id === id)).toMatchObject({
        paidCents: 55640,
        owedCents: 0,
      });
      await tx.execute(sql`reset role`);
      expect(await tx.select().from(invoices).where(eq(invoices.id, id))).toEqual(before);
    });
  });

  it("refuses a payment that would pay more than the invoice, to the cent", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await o.invoice();
      await o.bill.recordPayment(pay(id, 51999));
      expect(await o.bill.recordPayment(pay(id, 2))).toEqual({
        result: "rejected",
        code: "overpaid",
      });
      // The refusal left the transaction usable: the last cent is taken.
      expect(await o.bill.recordPayment(pay(id, 1))).toEqual({ result: "recorded" });
      expect(await o.bill.recordPayment(pay(id, 1))).toEqual({
        result: "rejected",
        code: "overpaid",
      });
      expect(await o.bill.read({ invoiceId: id })).toMatchObject({
        paidCents: 52000,
        owedCents: 0,
      });
    });
  });

  it("refuses a draft, a void invoice, a malformed payment and an id used for another", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const draft = await o.invoice({ issue: false });
      expect(await o.bill.recordPayment(pay(draft, 100))).toEqual({
        result: "rejected",
        code: "not_issued",
      });
      const voided = await o.invoice();
      await o.bill.void({ invoiceId: voided });
      expect(await o.bill.recordPayment(pay(voided, 100))).toEqual({
        result: "rejected",
        code: "void",
      });
      const id = await o.invoice();
      for (const bad of [
        pay(id, 0),
        pay(id, -100),
        pay(id, 10.5),
        pay(id, 100, { method: "barter" }),
        pay(id, 100, { paidOn: "11/02/2026" }),
        pay(id, 100, { note: "  " }),
      ]) {
        expect(await outcome(o.bill.recordPayment(bad as never))).toBe("BAD_REQUEST");
      }
      const first = pay(id, 100);
      await o.bill.recordPayment(first);
      expect(await o.bill.recordPayment({ ...first, amountCents: 200 })).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      expect((await o.bill.read({ invoiceId: id })).payments).toHaveLength(1);
    });
  });
});

describe("invoice.reversePayment", () => {
  it("reverses a payment once; both rows stay and neither counts", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await o.invoice();
      const wrong = pay(id, 52000);
      await o.bill.recordPayment(wrong);
      const reversal = {
        id: uuidv7(),
        paymentId: wrong.id,
        note: "Entered on the wrong invoice",
      };
      expect(await o.bill.reversePayment(reversal)).toEqual({ result: "reversed" });
      expect(await o.bill.reversePayment(reversal)).toEqual({ result: "duplicate" });
      expect(
        await o.bill.reversePayment({ id: uuidv7(), paymentId: wrong.id, note: null }),
      ).toEqual({ result: "rejected", code: "already_reversed" });
      expect(
        await o.bill.reversePayment({ id: uuidv7(), paymentId: reversal.id, note: null }),
      ).toEqual({ result: "rejected", code: "is_reversal" });
      const read = await o.bill.read({ invoiceId: id });
      expect(read).toMatchObject({ paidCents: 0, owedCents: 52000 });
      expect(read.payments).toMatchObject([
        { id: wrong.id, reversed: true, reversesPaymentId: null },
        {
          id: reversal.id,
          reversed: false,
          reversesPaymentId: wrong.id,
          amountCents: 52000,
          note: "Entered on the wrong invoice",
        },
      ]);
      // What it had paid is owed again, and can be paid again.
      expect(await o.bill.recordPayment(pay(id, 52000))).toEqual({ result: "recorded" });
    });
  });
});

describe("invoice.void with payments", () => {
  it("refuses while a payment stands, and voids once it is reversed", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await o.invoice();
      const paid = pay(id, 100);
      await o.bill.recordPayment(paid);
      expect(await o.bill.void({ invoiceId: id })).toEqual({
        result: "rejected",
        code: "has_payments",
      });
      await o.bill.reversePayment({ id: uuidv7(), paymentId: paid.id, note: null });
      expect(await o.bill.void({ invoiceId: id })).toEqual({ result: "voided" });
      // A void invoice owes nothing, and its payments cannot be reversed again.
      expect(await o.bill.read({ invoiceId: id })).toMatchObject({
        state: "void",
        owedCents: 0,
      });
    });
  });
});

describe("another company's invoice and payments", () => {
  it("take no payment and no reversal from here, and a worker reaches neither", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      expect(await outcome(o.bill.recordPayment(pay(o.foreign, 100)))).toBe("FORBIDDEN");
      expect(
        await outcome(
          o.bill.reversePayment({ id: uuidv7(), paymentId: uuidv7(), note: null }),
        ),
      ).toBe("FORBIDDEN");
      const id = await o.invoice();
      for (const who of [o.worker.who, o.day.who]) {
        expect(await outcome(o.as(who).recordPayment(pay(id, 100)))).toBe("FORBIDDEN");
      }
    });
  });
});
