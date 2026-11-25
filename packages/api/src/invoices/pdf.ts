// invoice.pdf: an issued invoice as a PDF, made when asked and stored nowhere. The figures are
// `invoice.read`'s own — the stored line amounts, the stored tax, what is paid and owed —
// so the page says what the screen says, and nothing is computed again here. A draft has no
// PDF: it has no number and may still change. A void one has, and says VOID across its head.
// Its status line ("Status: Overdue"), like the amount due and the payments, is as of the
// moment the file is made: the same invoice downloaded on a later day can say something
// else. The copy taken at issue never changes.
//
// The page is the only thing a customer sees, so it opens with what they need: the amount
// due, the day it is due and the invoice's number. Then who is asking (the company's
// block), who is asked, the job, the lines, the payments received and the balance, and how
// to pay. The company's block, the instructions, the customer's name and address and the
// job's name are the copy the invoice took at issue (`printed`), never the records as
// they stand today. PAID across the head when nothing is owed.
//
// `renderInvoice` is pure: a plain description of the page in, bytes out, the same bytes for
// the same description (the document's dates are the invoice's own, never the clock's). The
// standard Helvetica carries Latin text only, so a character it cannot draw is written `?`
// rather than failing the invoice. Consumed by routers/invoice.ts.
import { companies } from "@trader/db/schema";
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { z } from "zod";

import { INVOICE_STATUS_WORDS } from "../contract/invoice-status";
import type { Tx } from "../core/context";
import { hoursText } from "../core/csv";
import { workDate } from "../labor/work-date";
import { readInput, readInvoice } from "./read";

export const pdfInput = readInput;
export const pdfOutput = z.discriminatedUnion("result", [
  z.strictObject({
    result: z.literal("rendered"),
    filename: z.string(),
    // The file, base64: tRPC answers JSON.
    pdf: z.string(),
  }),
  z.strictObject({ result: z.literal("rejected"), reason: z.literal("not_issued") }),
]);

export type InvoicePage = {
  // As copied at issue.
  company: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  howToPay: string | null;
  // The payments that stand, oldest first.
  payments: { paidOn: string; method: string; amountCents: number }[];
  number: number;
  issuedOn: string;
  // The day it is due, and its status in the customer's words (contract/invoice-status.ts).
  dueOn: string;
  status: string;
  void: boolean;
  customer: { name: string; address: string | null };
  job: string;
  currency: string;
  lines: {
    description: string;
    quantity: string;
    unit: string | null;
    unitPriceCents: number;
    amountCents: number;
  }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  owedCents: number;
  // The instant the document is dated with: the invoice's issue, so the bytes never change.
  stamp: Date;
};

// Cents as a decimal with two places and thousands apart: 1234567 → 12,345.67.
export function money(cents: number): string {
  const [whole, fraction] = hoursText(Math.abs(cents)).split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${cents < 0 ? "-" : ""}${grouped}.${fraction}`;
}

// A stored quantity carries three decimal places; the page shows the ones that say
// something: `8.000` is 8, `2.500` is 2.5.
export function quantityText(quantity: string): string {
  return quantity.includes(".")
    ? quantity.replace(/0+$/, "").replace(/\.$/, "")
    : quantity;
}

// What Helvetica's encoding (WinAnsi) can draw: printable Latin-1 and a few typographic marks.
// Anything else — another script, an emoji, a control character — becomes `?`; a line break
// or a tab becomes a space.
const TYPOGRAPHIC = "–—‘’“”•…€™";
export function drawable(textIn: string): string {
  return Array.from(textIn.replace(/[\r\n\t]+/g, " "), (ch) => {
    const code = ch.codePointAt(0)!;
    const latin = (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff);
    return latin || TYPOGRAPHIC.includes(ch) ? ch : "?";
  }).join("");
}

// Words wrapped to a width; a word wider than the line is cut.
export function wrap(
  textIn: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const out: string[] = [];
  let line = "";
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
  for (let word of textIn.split(" ").filter((w) => w !== "")) {
    while (!fits(word)) {
      let cut = word.length - 1;
      while (cut > 1 && !fits(word.slice(0, cut))) cut -= 1;
      if (line !== "") out.push(line);
      out.push(word.slice(0, cut));
      line = "";
      word = word.slice(cut);
    }
    const next = line === "" ? word : `${line} ${word}`;
    if (fits(next)) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line !== "") out.push(line);
  return out.length === 0 ? [""] : out;
}

// US Letter, in points.
const PAGE = { width: 612, height: 792, margin: 54 };
const COLUMNS = { quantity: 330, price: 440, amount: PAGE.width - PAGE.margin };
// The description ends well before the widest quantity begins.
export const DESCRIPTION_WIDTH = 170;
const SIZE = { title: 20, body: 10, small: 9 };
const LEADING = 14;

export async function renderInvoice(invoice: InvoicePage): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(drawable(`Invoice ${invoice.number}`));
  doc.setAuthor(drawable(invoice.company.name));
  doc.setProducer("TRADER");
  doc.setCreator("TRADER");
  doc.setCreationDate(invoice.stamp);
  doc.setModificationDate(invoice.stamp);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  const left = (s: string, x: number, font = regular, size = SIZE.body) =>
    page.drawText(drawable(s), { x, y, size, font });
  const right = (s: string, edge: number, font = regular, size = SIZE.body) => {
    const t = drawable(s);
    page.drawText(t, { x: edge - font.widthOfTextAtSize(t, size), y, size, font });
  };
  const rule = () =>
    page.drawLine({
      start: { x: PAGE.margin, y: y + LEADING - 4 },
      end: { x: PAGE.width - PAGE.margin, y: y + LEADING - 4 },
      thickness: 0.5,
    });
  const tableHead = () => {
    left("Description", PAGE.margin, bold);
    right("Quantity", COLUMNS.quantity, bold);
    right("Unit price", COLUMNS.price, bold);
    right(`Amount (${invoice.currency})`, COLUMNS.amount, bold);
    y -= LEADING;
    rule();
  };
  // Room for `rows` more lines of text, on this page or a new one that repeats the head.
  const room = (rows: number) => {
    if (y - rows * LEADING >= PAGE.margin) return;
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin;
    left(`Invoice ${invoice.number}, continued`, PAGE.margin, bold);
    y -= LEADING * 2;
    tableHead();
  };

  // Wrapped text, a paragraph for each line of what was typed.
  const paragraph = (textIn: string, width: number, before: () => void = () => {}) => {
    for (const typed of textIn.split(/\r?\n/)) {
      for (const line of wrap(drawable(typed), regular, SIZE.body, width)) {
        if (line === "") continue;
        before();
        left(line, PAGE.margin);
        y -= LEADING;
      }
    }
  };
  // Room below the table, on this page or a new one that says which invoice it continues.
  const roomBelow = () => {
    if (y - LEADING >= PAGE.margin) return;
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin;
    left(`Invoice ${invoice.number}, continued`, PAGE.margin, bold);
    y -= LEADING * 2;
  };

  // The three things a customer looks for, first.
  const settled = !invoice.void && invoice.owedCents <= 0;
  left(
    // A void invoice asks for nothing.
    `Amount due: ${money(invoice.void ? 0 : invoice.owedCents)} ${invoice.currency}`,
    PAGE.margin,
    bold,
    SIZE.title,
  );
  right(
    invoice.void ? "VOID" : settled ? "PAID" : "INVOICE",
    COLUMNS.amount,
    bold,
    SIZE.title,
  );
  y -= LEADING * 2;
  left(`Due ${invoice.dueOn}`, PAGE.margin, bold);
  right(`Invoice ${invoice.number}`, COLUMNS.amount, bold);
  y -= LEADING;
  left(`Status: ${invoice.status}`, PAGE.margin);
  right(`Issued ${invoice.issuedOn}`, COLUMNS.amount);
  y -= LEADING * 2;

  left("From", PAGE.margin, bold, SIZE.small);
  y -= LEADING;
  left(invoice.company.name, PAGE.margin, bold);
  y -= LEADING;
  paragraph(invoice.company.address ?? "", 300);
  for (const reach of [invoice.company.phone, invoice.company.email]) {
    if (reach === null || reach.trim() === "") continue;
    left(reach, PAGE.margin);
    y -= LEADING;
  }
  y -= LEADING;
  left("Bill to", PAGE.margin, bold, SIZE.small);
  y -= LEADING;
  left(invoice.customer.name, PAGE.margin);
  y -= LEADING;
  for (const line of wrap(
    drawable(invoice.customer.address ?? ""),
    regular,
    SIZE.body,
    300,
  )) {
    if (line === "") continue;
    left(line, PAGE.margin);
    y -= LEADING;
  }
  left(`Job: ${invoice.job}`, PAGE.margin);
  y -= LEADING * 2;
  tableHead();

  for (const line of invoice.lines) {
    const words = wrap(drawable(line.description), regular, SIZE.body, DESCRIPTION_WIDTH);
    room(words.length);
    right(
      line.unit === null
        ? quantityText(line.quantity)
        : `${quantityText(line.quantity)} ${line.unit}`,
      COLUMNS.quantity,
    );
    right(money(line.unitPriceCents), COLUMNS.price);
    right(money(line.amountCents), COLUMNS.amount);
    for (const part of words) {
      left(part, PAGE.margin);
      y -= LEADING;
    }
  }

  room(7);
  rule();
  y -= 4;
  const total = (label: string, cents: number, font = regular) => {
    right(label, COLUMNS.price, font);
    right(money(cents), COLUMNS.amount, font);
    y -= LEADING;
  };
  total("Subtotal", invoice.subtotalCents);
  total("Tax", invoice.taxCents);
  total("Total", invoice.totalCents, bold);
  if (!invoice.void) {
    if (invoice.payments.length > 0) {
      y -= LEADING / 2;
      roomBelow();
      left("Payments received", PAGE.margin, bold, SIZE.small);
      y -= LEADING;
      for (const paid of invoice.payments) {
        roomBelow();
        left(`${paid.paidOn}, ${paid.method}`, PAGE.margin);
        right(money(paid.amountCents), COLUMNS.amount);
        y -= LEADING;
      }
    }
    roomBelow();
    total("Paid", invoice.paidCents);
    roomBelow();
    total("Balance", invoice.owedCents, bold);
    if (invoice.howToPay !== null && invoice.howToPay.trim() !== "") {
      y -= LEADING;
      roomBelow();
      left("How to pay", PAGE.margin, bold);
      y -= LEADING;
      paragraph(invoice.howToPay, PAGE.width - PAGE.margin * 2, roomBelow);
    }
    const reach = [invoice.company.phone, invoice.company.email].filter(
      (r): r is string => r !== null && r.trim() !== "",
    );
    if (reach.length > 0) {
      y -= LEADING / 2;
      roomBelow();
      left(`Questions about this invoice: ${reach.join(" or ")}`, PAGE.margin);
      y -= LEADING;
    }
  }
  // No object streams and the dates above: the same invoice is the same bytes.
  return doc.save({ useObjectStreams: false });
}

export async function invoicePdf(
  tx: Tx,
  input: z.infer<typeof pdfInput>,
): Promise<z.infer<typeof pdfOutput>> {
  // Missing or another tenant's is FORBIDDEN there, before anything is drawn.
  const invoice = await readInvoice(tx, input);
  if (invoice.number === null || invoice.issuedAt === null) {
    return { result: "rejected", reason: "not_issued" };
  }
  // The company as it stands is read for its timezone alone: what prints is the copy.
  const [company] = await tx.select({ timezone: companies.timezone }).from(companies);
  if (company === undefined) throw new Error("the caller's company is not visible");
  if (invoice.printed === null) throw new Error("an issued invoice has no printed copy");
  const bytes = await renderInvoice({
    company: {
      name: invoice.printed.companyName,
      address: invoice.printed.companyAddress,
      phone: invoice.printed.companyPhone,
      email: invoice.printed.companyEmail,
    },
    howToPay: invoice.printed.howToPay,
    payments: invoice.payments
      .filter((x) => x.reversesPaymentId === null && !x.reversed)
      .map((x) => ({ paidOn: x.paidOn, method: x.method, amountCents: x.amountCents })),
    number: invoice.number,
    issuedOn: workDate(invoice.issuedAt, company.timezone),
    // An issued invoice always has one (the database's own check).
    dueOn: invoice.dueOn ?? workDate(invoice.issuedAt, company.timezone),
    status: INVOICE_STATUS_WORDS[invoice.status],
    void: invoice.state === "void",
    customer: {
      name: invoice.printed.customerName,
      address: invoice.printed.customerAddress,
    },
    job: invoice.printed.jobName,
    currency: invoice.currency,
    lines: invoice.lines,
    subtotalCents: invoice.subtotalCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    paidCents: invoice.paidCents,
    owedCents: invoice.owedCents,
    stamp: invoice.issuedAt,
  });
  return {
    result: "rendered",
    filename: `invoice-${invoice.number}.pdf`,
    pdf: Buffer.from(bytes).toString("base64"),
  };
}
