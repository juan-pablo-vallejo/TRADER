// The customer-ready invoice: what a customer of the company sees. The amount due, the due
// date and how to pay are found in the PDF's own text and in the email; and an invoice
// issued before a change to Settings prints as it did, byte for byte, while one issued
// after prints the new words. Every test runs in an owner transaction, always rolled back.
import { companies, invoiceCounters, invoices } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import type { Mail, Mailer } from "../../src/core/mailer";
import { invoiceEmail } from "../../src/invoices/send";
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
import { drawn } from "./drawn";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const AS_ISSUED = {
  name: "D Sierra Painting",
  address: "200 Broad St, Providence, RI 02903",
  phone: "401-555-0142",
  email: "office@dsierra.test",
  paymentInstructions: "Check payable to D Sierra Painting LLC.\nZelle: pay@dsierra.test",
  invoiceTermsDays: 15,
};
const TO = "billing@customer.test";

async function office(tx: Tx) {
  const d = await workDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  await tx
    .insert(invoiceCounters)
    .values({ companyId: d.companyId, nextInvoiceNumber: 77 });
  const settings = async (values: Partial<typeof AS_ISSUED>) => {
    await tx.execute(sql`reset role`);
    await tx.update(companies).set(values).where(eq(companies.id, d.companyId));
    await asTenant(tx, d.companyId);
  };
  await settings(AS_ISSUED);
  const sent: Mail[] = [];
  const mailer: Mailer = {
    send: (mail) => {
      sent.push(mail);
      return Promise.resolve({ ok: true, messageId: "msg_1" });
    },
  };
  const bill = appCallerIn(tx, admin.who, mailer).invoice;
  const issued = async (cents: number) => {
    const id = uuidv7();
    await bill.create({ id, jobId: d.J, currency: "USD" });
    await bill.save({
      invoiceId: id,
      taxCents: 0,
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
    expect((await bill.issue({ invoiceId: id })).result).toBe("issued");
    return id;
  };
  const page = async (invoiceId: string) => {
    const file = await bill.pdf({ invoiceId });
    if (file.result !== "rendered") throw new Error("not rendered");
    return file.pdf;
  };
  const text = async (invoiceId: string) =>
    drawn(Buffer.from(await page(invoiceId), "base64"));
  return { ...d, bill, issued, page, text, settings, sent };
}

describe("what a customer is sent", () => {
  it("says the amount, the due date and how to pay in the PDF and in the email", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = await o.issued(123_456);
      await o.bill.recordPayment({
        id: uuidv7(),
        invoiceId: id,
        amountCents: 23_456,
        paidOn: "2026-11-20",
        method: "check",
        note: null,
      });
      const { dueOn } = await o.bill.read({ invoiceId: id });
      expect(dueOn).not.toBeNull();

      const pdf = await o.text(id);
      for (const said of [
        "Amount due: 1,000.00 USD",
        `Due ${dueOn}`,
        "Invoice 77",
        "How to pay",
        "Check payable to D Sierra Painting LLC.",
        "Zelle: pay@dsierra.test",
        "D Sierra Painting",
        "200 Broad St, Providence, RI 02903",
        "Payments received",
        "2026-11-20, check",
      ]) {
        expect([said, pdf.includes(said)]).toEqual([said, true]);
      }

      expect(await o.bill.send({ id: uuidv7(), invoiceId: id, to: TO })).toEqual({
        result: "sent",
      });
      const mail = o.sent[0]!;
      expect(mail.subject).toBe("Invoice 77 from D Sierra Painting");
      expect(mail.text).toEqual([
        "Amount due: 1,000.00 USD",
        `Due: ${dueOn}`,
        "Invoice 77 from D Sierra Painting (Partly paid; total 1,234.56 USD)",
        "How to pay:",
        "Check payable to D Sierra Painting LLC.",
        "Zelle: pay@dsierra.test",
        "Questions? Call D Sierra Painting at 401-555-0142.",
        "The invoice is attached as a PDF.",
      ]);
    });
  });

  it("prints an invoice issued before a change to Settings as it did", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const before = await o.issued(50_000);
      const asItWas = await o.page(before);
      const dueBefore = (await o.bill.read({ invoiceId: before })).dueOn;

      await o.settings({
        name: "Sierra & Sons Painting",
        address: "9 New Road, Cranston, RI",
        phone: "401-555-0999",
        email: "billing@sierrasons.test",
        paymentInstructions: "Pay by card at the office.",
        invoiceTermsDays: 60,
      });

      // The same page, byte for byte, and the same due date.
      expect(await o.page(before)).toBe(asItWas);
      expect((await o.bill.read({ invoiceId: before })).dueOn).toBe(dueBefore);
      const old = await o.text(before);
      expect(old).toContain("D Sierra Painting");
      expect(old).toContain("Zelle: pay@dsierra.test");
      expect(old).not.toContain("Sierra & Sons");
      expect(old).not.toContain("Pay by card");
      // Its email too.
      await o.bill.send({ id: uuidv7(), invoiceId: before, to: TO });
      expect(o.sent[0]!.subject).toBe("Invoice 77 from D Sierra Painting");
      expect(o.sent[0]!.text.join("\n")).toContain(
        "Call D Sierra Painting at 401-555-0142",
      );

      // An invoice issued after the change prints the new words.
      const after = await o.text(await o.issued(50_000));
      expect(after).toContain("Sierra & Sons Painting");
      expect(after).toContain("Pay by card at the office.");
      expect(after).not.toContain("Zelle");
    });
  });

  it("takes the copy at issue and not before, and the database freezes it", async () => {
    await rolledBack(owner, async (tx) => {
      const o = await office(tx);
      const id = uuidv7();
      await o.bill.create({ id, jobId: o.J, currency: "USD" });
      await o.bill.save({
        invoiceId: id,
        taxCents: 0,
        lines: [
          {
            id: uuidv7(),
            description: "Work",
            quantity: "1",
            unit: null,
            unitPriceCents: 100,
          },
        ],
      });
      // A draft prints nothing and holds no copy.
      expect((await o.bill.read({ invoiceId: id })).printed).toBeNull();
      expect(await o.bill.pdf({ invoiceId: id })).toEqual({
        result: "rejected",
        reason: "not_issued",
      });
      // Settings changed while it was a draft are the ones it issues with.
      await o.settings({ name: "Renamed Before Issue" });
      await o.bill.issue({ invoiceId: id });
      expect((await o.bill.read({ invoiceId: id })).printed).toEqual({
        companyName: "Renamed Before Issue",
        companyAddress: AS_ISSUED.address,
        companyPhone: AS_ISSUED.phone,
        companyEmail: AS_ISSUED.email,
        howToPay: AS_ISSUED.paymentInstructions,
      });
      await tx.execute(sql`reset role`);
      const refused = await rejection(
        tx.transaction((sp) =>
          sp
            .update(invoices)
            .set({ printedCompanyName: "Forged" })
            .where(eq(invoices.id, id)),
        ),
      );
      expect(sqlstateOf(refused)).toBe("23000");
    });
  });
});

describe("the email's words", () => {
  it("leave out what the company never filled in", () => {
    expect(
      invoiceEmail({
        company: "Acme",
        phone: " ",
        number: 3,
        currency: "USD",
        owedCents: 0,
        totalCents: 5_000,
        dueOn: "2026-12-01",
        status: "Paid",
        howToPay: null,
      }),
    ).toEqual([
      "Amount due: 0.00 USD",
      "Due: 2026-12-01",
      "Invoice 3 from Acme (Paid; total 50.00 USD)",
      "The invoice is attached as a PDF.",
    ]);
  });
});
