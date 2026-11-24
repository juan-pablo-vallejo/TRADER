// An invoice's status, the one function that names it and the reads that carry it: one
// invoice walked through issue, a part payment and the final payment; a second one that
// passes its due date and is Overdue with no manual step; the due date a draft names or
// issuing fills from the company's terms, frozen from then on; and the three figures above
// the list. Every test runs in an owner transaction that is always rolled back.
import { companies, invoiceCounters, invoices } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { invoiceStatus, INVOICE_STATUS_WORDS, OUTSTANDING } from "../../src/contract";
import type { Tx } from "../../src/core/context";
import { invoiceTotals, listInvoices, readInvoice } from "../../src/invoices/read";
import {
  appCallerIn,
  asTenant,
  boundIn,
  ownerDb,
  rejection,
  rolledBack,
  sqlstateOf,
  uuidv7,
  workDayIn,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

describe("the one function that names a status", () => {
  const facts = (over: Partial<Parameters<typeof invoiceStatus>[0]> = {}) => ({
    number: 12,
    voided: false,
    totalCents: 100_000,
    paidCents: 0,
    dueOn: "2026-11-30",
    ...over,
  });
  const TODAY = "2026-11-20";

  it("reads draft and void from the invoice's own stamps, whatever else is true", () => {
    expect(invoiceStatus(facts({ number: null, dueOn: null }), TODAY)).toBe("draft");
    expect(invoiceStatus(facts({ number: null, dueOn: "2026-01-01" }), TODAY)).toBe(
      "draft",
    );
    expect(invoiceStatus(facts({ voided: true }), TODAY)).toBe("void");
    expect(invoiceStatus(facts({ voided: true, dueOn: "2026-01-01" }), TODAY)).toBe(
      "void",
    );
  });

  it("works the rest out from the payments and the due date against today", () => {
    expect(invoiceStatus(facts(), TODAY)).toBe("issued");
    expect(invoiceStatus(facts({ paidCents: 40_000 }), TODAY)).toBe("partly_paid");
    expect(invoiceStatus(facts({ paidCents: 100_000 }), TODAY)).toBe("paid");
    // Paid is paid, however late it was.
    expect(invoiceStatus(facts({ paidCents: 100_000, dueOn: "2026-01-01" }), TODAY)).toBe(
      "paid",
    );
    // Past its due date with something owed: overdue, whether or not part was paid.
    expect(invoiceStatus(facts({ dueOn: "2026-11-19" }), TODAY)).toBe("overdue");
    expect(invoiceStatus(facts({ dueOn: "2026-11-19", paidCents: 40_000 }), TODAY)).toBe(
      "overdue",
    );
  });

  it("is not overdue on the day it is due, and is the day after", () => {
    expect(invoiceStatus(facts({ dueOn: TODAY }), TODAY)).toBe("issued");
    expect(invoiceStatus(facts({ dueOn: TODAY }), "2026-11-21")).toBe("overdue");
  });

  it("has a word for a customer for every status, and knows which still owe", () => {
    expect(Object.keys(INVOICE_STATUS_WORDS).sort()).toEqual(
      ["draft", "issued", "overdue", "paid", "partly_paid", "void"].sort(),
    );
    expect([...OUTSTANDING].sort()).toEqual(["issued", "overdue", "partly_paid"]);
  });
});

// New York, UTC-5 in November.
const day = (d: string, wall = "09:00") => new Date(`${d}T${wall}:00-05:00`);

async function office(tx: Tx, termsDays = 15) {
  const d = await workDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  await tx
    .insert(invoiceCounters)
    .values({ companyId: d.companyId, nextInvoiceNumber: 1 });
  await tx
    .update(companies)
    .set({ invoiceTermsDays: termsDays })
    .where(eq(companies.id, d.companyId));
  await asTenant(tx, d.companyId);
  const bill = appCallerIn(tx, admin.who).invoice;
  const draft = async (cents: number, dueOn: string | null = null) => {
    const id = uuidv7();
    await bill.create({ id, jobId: d.J, currency: "USD" });
    await bill.save({
      invoiceId: id,
      taxCents: 0,
      dueOn,
      lines: [
        {
          id: uuidv7(),
          description: "Work",
          quantity: "1",
          unit: null,
          unitPriceCents: cents,
        },
      ],
    });
    return id;
  };
  const pay = (invoiceId: string, amountCents: number, paidOn: string) =>
    bill.recordPayment({
      id: uuidv7(),
      invoiceId,
      amountCents,
      paidOn,
      method: "check",
      note: null,
    });
  const at = (invoiceId: string, now: Date) => readInvoice(tx, { invoiceId }, now);
  return { ...d, admin, bill, draft, pay, at };
}

// The day the database issued on, on the company's wall clock: issue reads the real clock.
const issuedDay = async (tx: Tx) =>
  (
    await tx.execute<{ d: string }>(
      sql`select to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD') as d`,
    )
  ).rows[0]!.d;
const plus = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe("an invoice through its statuses", () => {
  it("walks from draft through issue, a part payment and the final payment", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await o.draft(100_000);
      const today = await issuedDay(tx);
      const now = day(today);
      expect(await o.at(id, now)).toMatchObject({ status: "draft", dueOn: null });

      expect((await o.bill.issue({ invoiceId: id })).result).toBe("issued");
      // Issuing filled the due date from the company's terms: fifteen days on.
      expect(await o.at(id, now)).toMatchObject({
        status: "issued",
        dueOn: plus(today, 15),
        owedCents: 100_000,
      });

      expect((await o.pay(id, 40_000, today)).result).toBe("recorded");
      expect(await o.at(id, now)).toMatchObject({
        status: "partly_paid",
        paidCents: 40_000,
        owedCents: 60_000,
      });

      expect((await o.pay(id, 60_000, today)).result).toBe("recorded");
      expect(await o.at(id, now)).toMatchObject({
        status: "paid",
        paidCents: 100_000,
        owedCents: 0,
      });
      // Paid stays paid, however long after.
      expect((await o.at(id, day(plus(today, 90)))).status).toBe("paid");
      // The list names it the same.
      expect((await listInvoices(tx, now)).items.find((i) => i.id === id)?.status).toBe(
        "paid",
      );
    });
  });

  it("is Overdue the day after its due date with no manual step, and Paid when paid late", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await o.draft(50_000);
      await o.bill.issue({ invoiceId: id });
      const today = await issuedDay(tx);
      const due = plus(today, 15);
      // Nothing is done to it between these reads: only the day moves.
      expect((await o.at(id, day(today))).status).toBe("issued");
      expect((await o.at(id, day(due, "23:30"))).status).toBe("issued");
      expect((await o.at(id, day(plus(due, 1), "00:30"))).status).toBe("overdue");
      expect(
        (await listInvoices(tx, day(plus(due, 30)))).items.find((i) => i.id === id)
          ?.status,
      ).toBe("overdue");

      // A part payment does not make it less overdue.
      await o.pay(id, 10_000, plus(due, 2));
      expect(await o.at(id, day(plus(due, 3)))).toMatchObject({
        status: "overdue",
        owedCents: 40_000,
      });
      await o.pay(id, 40_000, plus(due, 5));
      expect((await o.at(id, day(plus(due, 6)))).status).toBe("paid");
    });
  });

  it("keeps the due date a draft names, fills none on a draft, and freezes it at issue", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx, 30);
      const named = await o.draft(10_000, "2027-01-31");
      const unnamed = await o.draft(10_000);
      // A draft's due date is the draft's to change, and to clear.
      await o.bill.save({
        invoiceId: unnamed,
        taxCents: 0,
        dueOn: "2027-02-01",
        lines: [],
      });
      expect((await o.at(unnamed, new Date())).dueOn).toBe("2027-02-01");
      await o.bill.save({
        invoiceId: unnamed,
        taxCents: 0,
        dueOn: null,
        lines: [
          {
            id: uuidv7(),
            description: "Work",
            quantity: "1",
            unit: null,
            unitPriceCents: 10_000,
          },
        ],
      });
      expect((await o.at(unnamed, new Date())).dueOn).toBeNull();

      await o.bill.issue({ invoiceId: named });
      await o.bill.issue({ invoiceId: unnamed });
      const today = await issuedDay(tx);
      expect((await o.at(named, new Date())).dueOn).toBe("2027-01-31");
      expect((await o.at(unnamed, new Date())).dueOn).toBe(plus(today, 30));

      // Issued, the due date is frozen with the rest: a save is refused by the API, and a
      // direct write by the database itself.
      expect(
        await o.bill.save({
          invoiceId: named,
          taxCents: 0,
          dueOn: "2027-06-01",
          lines: [],
        }),
      ).toEqual({ result: "rejected", code: "issued" });
      await tx.execute(sql`reset role`);
      const refused = await rejection(
        tx.transaction((sp) =>
          sp.update(invoices).set({ dueOn: "2027-06-01" }).where(eq(invoices.id, named)),
        ),
      );
      expect(sqlstateOf(refused)).toBe("23000");
      // And terms changed afterwards do not move an issued invoice's date.
      await tx
        .update(companies)
        .set({ invoiceTermsDays: 0 })
        .where(eq(companies.id, o.companyId));
      await asTenant(tx, o.companyId);
      expect((await o.at(unnamed, new Date())).dueOn).toBe(plus(today, 30));
    });
  });
});

describe("the three figures above the list", () => {
  it("are outstanding, the overdue part of it, and what was paid this month", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx, 10);
      const today = await issuedDay(tx);
      const a = await o.draft(100_000);
      const b = await o.draft(30_000);
      const paid = await o.draft(20_000);
      await o.draft(99_900); // a draft owes nothing
      for (const id of [a, b, paid]) await o.bill.issue({ invoiceId: id });
      await o.pay(a, 25_000, today);
      await o.pay(paid, 20_000, today);
      // A payment noted for last month is last month's.
      await o.pay(b, 5_000, plus(`${today.slice(0, 8)}01`, -1));

      expect(await invoiceTotals(tx, day(today))).toEqual({
        today,
        outstanding: [{ currency: "USD", cents: 75_000 + 25_000 }],
        overdue: [],
        paidThisMonth: [{ currency: "USD", cents: 45_000 }],
      });
      // Eleven days on, past the ten days of terms: all of it is overdue, and nothing has
      // been paid in whatever month that is unless it is still this one.
      const later = await invoiceTotals(tx, day(plus(today, 11)));
      expect(later.outstanding).toEqual([{ currency: "USD", cents: 100_000 }]);
      expect(later.overdue).toEqual([{ currency: "USD", cents: 100_000 }]);
    });
  });
});
