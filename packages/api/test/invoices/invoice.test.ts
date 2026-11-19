// TASKS R6, invoices: invoice.create, save, remove, issue, void, list, read and suggest. A
// draft's lines are snapshots priced by the admin alone; an issue takes the next number of
// the company's series and freezes the invoice; a void is the one change after it; a retry
// answers what the first call did; another company's invoice is one FORBIDDEN on every
// procedure. Rolled-back transactions; fifty issues at once are invoice-commit.test.ts's,
// the database's own guards the db suite's (billing/invoice-guards.test.ts).
import { invoiceCounters, invoiceLineItems, invoices } from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  type CrewDay,
  crewDayIn,
  eventIn,
  outcome,
  ownerDb,
  rolledBack,
  uuidv7,
  workedDay,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

// A crew's day with a number series starting at 1042, an admin, and a second company
// beside it with an invoice of its own.
async function office(tx: Tx, counter = true) {
  const day = await crewDayIn(tx);
  const other = await crewDayIn(tx);
  const admin = await boundIn(tx, day.companyId, "admin");
  const worker = await boundIn(tx, day.companyId, "worker");
  if (counter) {
    await tx.insert(invoiceCounters).values({
      companyId: day.companyId,
      nextInvoiceNumber: 1042,
      nextCreditMemoNumber: 1,
    });
  }
  const [foreign] = await tx
    .insert(invoices)
    .values({
      companyId: other.companyId,
      customerId: other.customerId,
      jobId: other.J,
      currency: "USD",
      taxCents: 0,
    })
    .returning({ id: invoices.id });
  await becomeApp(tx);
  const as = (who: unknown) => appCallerIn(tx, who).invoice;
  return { day, other, admin, worker, as, bill: as(admin.who), foreign: foreign!.id };
}

const line = (over: Record<string, unknown> = {}) => ({
  id: uuidv7(),
  description: "Interior repaint, two coats",
  quantity: "8",
  unit: "h" as string | null,
  unitPriceCents: 6500,
  ...over,
});

// A draft on J with one line, saved.
async function draft(
  o: Awaited<ReturnType<typeof office>>,
  lines = [line()],
  taxCents = 0,
) {
  const id = uuidv7();
  await o.bill.create({ id, jobId: o.day.J, currency: "USD" });
  await o.bill.save({ invoiceId: id, taxCents, lines });
  return id;
}

const rowsOf = async (tx: Tx, d: CrewDay) => {
  await tx.execute(sql`reset role`);
  const rows = await tx
    .select({ id: invoices.id, number: invoices.number })
    .from(invoices)
    .where(eq(invoices.companyId, d.companyId))
    .orderBy(asc(invoices.createdAt), asc(invoices.id));
  await becomeApp(tx);
  await tx.execute(sql`select set_config('app.company_id', ${d.companyId}, true)`);
  return rows;
};

describe("invoice.create", () => {
  it("makes a draft for the job's own customer; sent again it is `duplicate`", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = uuidv7();
      const made = { id, jobId: o.day.J, currency: "USD" };
      expect(await o.bill.create(made)).toEqual({ result: "created" });
      expect(await o.bill.create(made)).toEqual({ result: "duplicate" });
      // The same id for another job or currency.
      for (const other of [
        { ...made, jobId: o.day.K },
        { ...made, currency: "CAD" },
      ]) {
        expect(await o.bill.create(other)).toEqual({
          result: "rejected",
          code: "id_conflict",
        });
      }
      expect(await o.bill.read({ invoiceId: id })).toMatchObject({
        state: "draft",
        number: null,
        customer: { id: o.day.customerId },
        job: { id: o.day.J },
        currency: "USD",
        lines: [],
        subtotalCents: 0,
        taxCents: 0,
        totalCents: 0,
      });
      expect(await rowsOf(tx, o.day)).toHaveLength(1);
    });
  });

  it("refuses a job that is missing or another company's, and a malformed draft", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      for (const jobId of [o.other.J, uuidv7()]) {
        expect(
          await outcome(o.bill.create({ id: uuidv7(), jobId, currency: "USD" })),
        ).toBe("FORBIDDEN");
      }
      for (const currency of ["usd", "US", "DOLLARS", ""]) {
        expect(
          await outcome(o.bill.create({ id: uuidv7(), jobId: o.day.J, currency })),
        ).toBe("BAD_REQUEST");
      }
      // Another company's invoice id for a draft of ours: taken, and nothing said of by what.
      expect(
        await o.bill.create({ id: o.foreign, jobId: o.day.J, currency: "USD" }),
      ).toEqual({ result: "rejected", code: "id_conflict" });
      expect(await rowsOf(tx, o.day)).toEqual([]);
    });
  });
});

describe("invoice.save", () => {
  it("stores the lines as sent, in order, each amount its quantity times its price", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const lines = [
        line({
          quantity: "2.5",
          unitPriceCents: 4599,
          unit: "gal",
          description: "Primer",
        }),
        line({ quantity: "0.335", unitPriceCents: 100, unit: null }),
        line({ quantity: "12", unitPriceCents: 0, description: "Touch-up, no charge" }),
      ];
      const id = await draft(o, lines, 807);
      const read = await o.bill.read({ invoiceId: id });
      expect(read.lines).toEqual([
        { ...lines[0], quantity: "2.500", amountCents: 11498 },
        { ...lines[1], quantity: "0.335", amountCents: 34 },
        { ...lines[2], quantity: "12.000", amountCents: 0 },
      ]);
      expect(read).toMatchObject({
        subtotalCents: 11532,
        taxCents: 807,
        totalCents: 12339,
      });
      // The list answers the same totals.
      expect((await o.bill.list()).find((i) => i.id === id)).toMatchObject({
        state: "draft",
        subtotalCents: 11532,
        totalCents: 12339,
      });
      // Saved again with one line: the draft is what was last sent, whole.
      await o.bill.save({ invoiceId: id, taxCents: 0, lines: [lines[1]!] });
      expect((await o.bill.read({ invoiceId: id })).lines.map((l) => l.id)).toEqual([
        lines[1]!.id,
      ]);
    });
  });

  it("refuses what cannot be a line and an amount too large", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await draft(o, []);
      const saving = (lines: unknown[], taxCents = 0) =>
        o.bill.save({ invoiceId: id, taxCents, lines: lines as never });
      const twice = line();
      for (const bad of [
        [line({ description: "  " })],
        [line({ quantity: "0" })],
        [line({ quantity: "-1" })],
        [line({ quantity: "1.2345" })],
        [line({ unitPriceCents: -1 })],
        [line({ unitPriceCents: 10.5 })],
        [line({ unit: " " })],
        [twice, twice],
        Array.from({ length: 101 }, () => line()),
      ]) {
        expect(await outcome(saving(bad))).toBe("BAD_REQUEST");
      }
      expect(await outcome(saving([], -1))).toBe("BAD_REQUEST");
      expect(
        await saving([line({ quantity: "999999999", unitPriceCents: 1000 })]),
      ).toEqual({ result: "rejected", code: "too_large" });
      expect(
        await saving([line({ quantity: "1", unitPriceCents: 2_147_483_000 })], 1000),
      ).toEqual({ result: "rejected", code: "too_large" });
      expect(await saving([line()])).toEqual({ result: "saved" });
      expect((await o.bill.read({ invoiceId: id })).lines).toHaveLength(1);
    });
  });
});

describe("invoice.suggest", () => {
  it("offers the job's hours a day, with no price", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      await tx.execute(sql`reset role`);
      // w1 4 h and w2 8 h on J on the worked day.
      await workedDay(tx, o.day);
      await becomeApp(tx);
      const id = await draft(o, []);
      const offered = await o.bill.suggest({ invoiceId: id });
      expect(offered).toEqual({
        timezone: "America/New_York",
        labor: [{ workDate: "2026-10-05", hundredths: 1200, quantity: "12.00" }],
      });
      // No price, rate or cost anywhere in what is offered.
      expect(JSON.stringify(offered)).not.toMatch(/cents|rate|cost/i);
    });
  });

  it("leaves a draft's lines as they were when the labor behind them changes", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      await tx.execute(sql`reset role`);
      await workedDay(tx, o.day);
      await becomeApp(tx);
      const id = await draft(o, []);
      const offered = await o.bill.suggest({ invoiceId: id });
      const lines = [
        line({ description: "Labor, Oct 5", quantity: offered.labor[0]!.quantity }),
      ];
      await o.bill.save({ invoiceId: id, taxCents: 0, lines });
      const before = await o.bill.read({ invoiceId: id });
      // Later: more hours that day.
      await tx.execute(sql`reset role`);
      await eventIn(tx, o.day, {
        worker: o.day.foremanId,
        job: o.day.J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      await eventIn(tx, o.day, {
        worker: o.day.foremanId,
        job: o.day.J,
        type: "ended",
        client: "2026-10-05T14:00:00Z",
      });
      await becomeApp(tx);
      expect((await o.bill.suggest({ invoiceId: id })).labor[0]!.quantity).toBe("14.00");
      expect(await o.bill.read({ invoiceId: id })).toEqual(before);
    });
  });
});

describe("invoice.issue", () => {
  it("takes the next number of the series, once; a retry answers the same number", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const first = await draft(o);
      const second = await draft(o);
      expect(await o.bill.issue({ invoiceId: first })).toEqual({
        result: "issued",
        number: 1042,
      });
      expect(await o.bill.issue({ invoiceId: first })).toEqual({
        result: "duplicate",
        number: 1042,
      });
      expect(await o.bill.issue({ invoiceId: second })).toEqual({
        result: "issued",
        number: 1043,
      });
      expect(await o.bill.read({ invoiceId: first })).toMatchObject({
        state: "issued",
        number: 1042,
        issuedBy: expect.stringContaining("admin"),
        issuedAt: expect.any(Date),
        voidedAt: null,
      });
      // Newest number first in the list.
      expect((await o.bill.list()).map((i) => i.number)).toEqual([1043, 1042]);
    });
  });

  it("refuses a draft with no line, and a company with no number series, spending nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx, false);
      const empty = await draft(o, []);
      expect(await o.bill.issue({ invoiceId: empty })).toEqual({
        result: "rejected",
        code: "no_lines",
      });
      const full = await draft(o);
      expect(await o.bill.issue({ invoiceId: full })).toEqual({
        result: "rejected",
        code: "no_number_series",
      });
      // The refusal left the transaction usable and the draft a draft.
      expect(await o.bill.read({ invoiceId: full })).toMatchObject({
        state: "draft",
        number: null,
      });
    });
  });

  it("freezes the invoice: no save, no removal, and its lines as issued", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await draft(o);
      await o.bill.issue({ invoiceId: id });
      const issued = await o.bill.read({ invoiceId: id });
      expect(
        await o.bill.save({ invoiceId: id, taxCents: 100, lines: [line()] }),
      ).toEqual({
        result: "rejected",
        code: "issued",
      });
      expect(await o.bill.remove({ invoiceId: id })).toEqual({
        result: "rejected",
        code: "issued",
      });
      expect(await o.bill.read({ invoiceId: id })).toEqual(issued);
      // The database holds it as well: a line rewritten behind the API is refused.
      await tx.execute(sql`reset role`);
      await expect(
        tx.transaction((sp) =>
          sp
            .update(invoiceLineItems)
            .set({ unitPriceCents: 1, amountCents: 8 })
            .where(eq(invoiceLineItems.invoiceId, id)),
        ),
      ).rejects.toThrow();
    });
  });
});

describe("invoice.void", () => {
  it("voids an issued invoice once, keeping its number and its lines", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await draft(o);
      expect(await o.bill.void({ invoiceId: id })).toEqual({
        result: "rejected",
        code: "not_issued",
      });
      await o.bill.issue({ invoiceId: id });
      const issued = await o.bill.read({ invoiceId: id });
      expect(await o.bill.void({ invoiceId: id })).toEqual({ result: "voided" });
      expect(await o.bill.void({ invoiceId: id })).toEqual({ result: "duplicate" });
      const voided = await o.bill.read({ invoiceId: id });
      expect(voided).toMatchObject({
        state: "void",
        number: 1042,
        voidedBy: expect.stringContaining("admin"),
        voidedAt: expect.any(Date),
      });
      expect(voided.lines).toEqual(issued.lines);
      // The next issue takes the next number: a void gives none back.
      const next = await draft(o);
      expect(await o.bill.issue({ invoiceId: next })).toMatchObject({ number: 1043 });
    });
  });
});

describe("invoice.pdf", () => {
  it("renders an issued invoice, the same bytes each time; a draft has none", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const invoiceId = await draft(o, [line(), line({ description: "Primer" })], 1234);
      expect(await o.bill.pdf({ invoiceId })).toEqual({
        result: "rejected",
        reason: "not_issued",
      });
      await o.bill.issue({ invoiceId });
      const first = await o.bill.pdf({ invoiceId });
      if (first.result !== "rendered") throw new Error("not rendered");
      expect(first.filename).toBe("invoice-1042.pdf");
      const bytes = Buffer.from(first.pdf, "base64");
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(await o.bill.pdf({ invoiceId })).toEqual(first);
      // A void invoice still has its page.
      await o.bill.void({ invoiceId });
      const voided = await o.bill.pdf({ invoiceId });
      expect(voided.result).toBe("rendered");
      expect(voided).not.toEqual(first);
    });
  });
});

describe("invoice.remove", () => {
  it("removes a draft and its lines; again, or for one that never was, it is `unchanged`", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await draft(o);
      expect(await o.bill.remove({ invoiceId: id })).toEqual({ result: "removed" });
      expect(await o.bill.remove({ invoiceId: id })).toEqual({ result: "unchanged" });
      expect(await o.bill.remove({ invoiceId: uuidv7() })).toEqual({
        result: "unchanged",
      });
      expect(await rowsOf(tx, o.day)).toEqual([]);
    });
  });
});

describe("another company's invoice", () => {
  it("is FORBIDDEN or not there on every procedure, and is left as it was", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const invoiceId = o.foreign;
      for (const call of [
        () => o.bill.read({ invoiceId }),
        () => o.bill.suggest({ invoiceId }),
        () => o.bill.pdf({ invoiceId }),
        () => o.bill.save({ invoiceId, taxCents: 0, lines: [line()] }),
        () => o.bill.issue({ invoiceId }),
        () => o.bill.void({ invoiceId }),
      ]) {
        expect(await outcome(call())).toBe("FORBIDDEN");
      }
      expect(await o.bill.remove({ invoiceId })).toEqual({ result: "unchanged" });
      expect(await o.bill.list()).toEqual([]);
      await tx.execute(sql`reset role`);
      const [row] = await tx
        .select({ number: invoices.number, taxCents: invoices.taxCents })
        .from(invoices)
        .where(eq(invoices.id, invoiceId));
      expect(row).toEqual({ number: null, taxCents: 0 });
    });
  });

  it("and a worker or a foreman reaches none of them", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await draft(o);
      for (const who of [o.worker.who, o.day.who]) {
        for (const call of [
          () => o.as(who).list(),
          () => o.as(who).read({ invoiceId: id }),
          () => o.as(who).create({ id: uuidv7(), jobId: o.day.J, currency: "USD" }),
          () => o.as(who).issue({ invoiceId: id }),
        ]) {
          expect(await outcome(call())).toBe("FORBIDDEN");
        }
      }
    });
  });
});
