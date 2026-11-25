// The invoice page itself (invoices/pdf.ts): no database. What it is asked to draw is on
// the page, in the figures it was given; text Helvetica cannot draw does not fail it; a
// long invoice runs onto more pages; the same description is the same bytes.

import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import {
  drawable,
  type InvoicePage,
  DESCRIPTION_WIDTH,
  amount,
  money,
  printedDay,
  quantityText,
  renderInvoice,
  wrap,
} from "../../src/invoices/pdf";
import { drawn } from "./drawn";

const page = (over: Partial<InvoicePage> = {}): InvoicePage => ({
  company: {
    name: "D Sierra Painting",
    address: "200 Broad St, Providence, RI 02903",
    phone: "401-555-0142",
    email: "office@dsierra.test",
  },
  howToPay: "Check payable to D Sierra Painting LLC.\nZelle: pay@dsierra.test",
  payments: [{ paidOn: "2026-11-18", method: "check", amountCents: 20000 }],
  number: 1042,
  issuedOn: "2026-11-15",
  dueOn: "2026-11-30",
  status: "Issued",
  void: false,
  customer: { name: "Whitmore Family", address: "14 Elmgrove Ave, Providence, RI" },
  job: "Whitmore exterior repaint",
  currency: "USD",
  lines: [
    {
      description: "Exterior repaint, two coats",
      quantity: "8",
      unit: "h",
      unitPriceCents: 6500,
      amountCents: 52000,
    },
    {
      description: "Primer",
      quantity: "3",
      unit: "gal",
      unitPriceCents: 1500,
      amountCents: 4500,
    },
  ],
  // No figure here equals another, so each is found only where it belongs.
  subtotalCents: 56500,
  taxCents: 3955,
  totalCents: 60455,
  paidCents: 20000,
  owedCents: 40455,
  stamp: new Date("2026-11-15T15:00:00Z"),
  ...over,
});

describe("money", () => {
  it("writes cents as a decimal with thousands apart", () => {
    expect(money(0)).toBe("0.00");
    expect(money(5)).toBe("0.05");
    expect(money(52000)).toBe("520.00");
    expect(money(123456789)).toBe("1,234,567.89");
    expect(amount(123456789, "USD")).toBe("$1,234,567.89");
    expect(amount(-2000, "USD")).toBe("-$20.00");
    expect(amount(125050, "EUR")).toBe("1,250.50 EUR");
    expect(printedDay("2026-11-16")).toBe("Nov 16, 2026");
    expect(printedDay("")).toBe("");
    expect(money(-100050)).toBe("-1,000.50");
  });
});

describe("quantityText", () => {
  it("drops the decimal places that say nothing", () => {
    expect(quantityText("8.000")).toBe("8");
    expect(quantityText("2.500")).toBe("2.5");
    expect(quantityText("0.125")).toBe("0.125");
    expect(quantityText("100")).toBe("100");
    expect(quantityText("10.000")).toBe("10");
  });
});

describe("drawable", () => {
  it("keeps Latin text and writes what the font cannot draw as ?", () => {
    expect(drawable("Señor Muñoz — 2 “coats”")).toBe("Señor Muñoz — 2 “coats”");
    expect(drawable("王 paint 🎨")).toBe("? paint ?");
    expect(drawable("one\ntwo\tthree")).toBe("one two three");
    expect(drawable("a\u0007b")).toBe("a?b");
  });
});

describe("wrap", () => {
  it("breaks at words, and cuts a word wider than the line", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrap("Exterior repaint of the whole north face", font, 10, 80);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("Exterior repaint of the whole north face");
    for (const l of lines) expect(font.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(80);
    const cut = wrap("W".repeat(60), font, 10, 80);
    expect(cut.join("")).toBe("W".repeat(60));
    for (const l of cut) expect(font.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(80);
    expect(wrap("", font, 10, 80)).toEqual([""]);
  });
});

describe("renderInvoice", () => {
  it("draws the invoice's own figures and words", async () => {
    const text = drawn(await renderInvoice(page()));
    for (const said of [
      "D Sierra Painting",
      "INVOICE",
      "Invoice 1042",
      // What a customer looks for: the amount, the day and the instructions.
      "Amount due: $404.55",
      "Due Nov 30, 2026",
      "Status: Issued",
      "200 Broad St, Providence, RI 02903",
      "401-555-0142",
      "office@dsierra.test",
      "Payments received",
      "Nov 18, 2026, check",
      "Balance",
      "How to pay",
      "Check payable to D Sierra Painting LLC.",
      "Zelle: pay@dsierra.test",
      "Questions about this invoice: 401-555-0142 or office@dsierra.test",
      "Issued Nov 15, 2026",
      "Whitmore Family",
      "14 Elmgrove Ave, Providence, RI",
      "Job: Whitmore exterior repaint",
      "Exterior repaint, two coats",
      "8 h",
      "$65.00",
      "$520.00",
      "3 gal",
      "$15.00",
      "$45.00",
      "$565.00",
      "$39.55",
      "$604.55",
      "$200.00",
      "$404.55",
    ]) {
      expect([said, text.includes(said)]).toEqual([said, true]);
    }
    expect(text).not.toContain("VOID");
    expect(text).not.toContain("PAID");
    // It opens with the amount due, the due date and the number, in that order, before
    // anything else on the page.
    const first = text.split("\n");
    expect(first[0]).toBe("Amount due: $404.55");
    expect(first.indexOf("Due Nov 30, 2026")).toBeLessThan(first.indexOf("From"));
    expect(first.indexOf("Invoice 1042")).toBeLessThan(first.indexOf("From"));
    expect(first.indexOf("How to pay")).toBeGreaterThan(first.indexOf("Balance"));
  });

  it("says PAID across the head when nothing is owed", async () => {
    const text = drawn(
      await renderInvoice(
        page({
          paidCents: 60455,
          owedCents: 0,
          status: "Paid",
          payments: [
            { paidOn: "2026-11-18", method: "check", amountCents: 20000 },
            { paidOn: "2026-11-25", method: "cash", amountCents: 40455 },
          ],
        }),
      ),
    );
    expect(text.split("\n")).toContain("PAID");
    expect(text).toContain("Amount due: $0.00");
    expect(text).toContain("Nov 25, 2026, cash");
    expect(text.split("\n")).not.toContain("INVOICE");
  });

  it("leaves out what the company never filled in", async () => {
    const text = drawn(
      await renderInvoice(
        page({
          company: { name: "D Sierra Painting", address: null, phone: null, email: " " },
          howToPay: null,
          payments: [],
        }),
      ),
    );
    expect(text).not.toContain("How to pay");
    expect(text).not.toContain("Questions about");
    expect(text).not.toContain("Payments received");
    expect(text).toContain("Balance");
  });

  it("keeps a description clear of the widest quantity a line can carry", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    // The quantity column ends 330 pt from the left edge and the page's margin is 54.
    const widest = font.widthOfTextAtSize("99999999.999 gallons", 10);
    expect(54 + DESCRIPTION_WIDTH).toBeLessThan(330 - widest);
    const text = drawn(
      await renderInvoice(
        page({
          lines: [
            {
              description:
                "Exterior repaint, two coats, north and east faces, trim included",
              quantity: "8.000",
              unit: "h",
              unitPriceCents: 6500,
              amountCents: 52000,
            },
          ],
        }),
      ),
    );
    expect(text).toContain("8 h");
    expect(text).not.toContain("8.000");
    for (const line of text
      .split("\n")
      .filter((l) => l.includes("repaint") || l.includes("trim"))) {
      expect(font.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(DESCRIPTION_WIDTH);
    }
  });

  it("says VOID on a void invoice and leaves out what is paid and owed", async () => {
    const text = drawn(await renderInvoice(page({ void: true })));
    expect(text).toContain("VOID");
    expect(text).not.toContain("Balance");
    expect(text).not.toContain("Paid");
    expect(text).not.toContain("PAID");
    expect(text).not.toContain("How to pay");
  });

  it("is the same bytes for the same invoice", async () => {
    // Rendered on different days: nothing of the clock is in the file.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));
    const a = await renderInvoice(page());
    vi.setSystemTime(new Date("2027-03-09T18:30:00Z"));
    const b = await renderInvoice(page());
    vi.useRealTimers();
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const c = await renderInvoice(page({ paidCents: 0, owedCents: 60455 }));
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false);
  });

  it("does not fail on a name the font cannot draw", async () => {
    const text = drawn(
      await renderInvoice(page({ customer: { name: "王小明 🎨", address: null } })),
    );
    expect(text).toContain("???");
  });

  it("runs a long invoice onto more pages, every line on one of them", async () => {
    const lines = Array.from({ length: 120 }, (_, i) => ({
      description: `Line ${i + 1} of the work`,
      quantity: "1",
      unit: null,
      unitPriceCents: 100,
      amountCents: 100,
    }));
    const bytes = await renderInvoice(page({ lines }));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    const text = drawn(bytes);
    for (const l of lines) expect(text).toContain(l.description);
    expect(text).toContain("Invoice 1042, continued");
    expect(text).toContain("Balance");
    expect(text).toContain("Zelle: pay@dsierra.test");
  });
});
