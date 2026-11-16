// invoice.exportCsv: a plain list of issued invoices (PRD, Invoicing and exports;
// ARCHITECTURE, 2026-11-15 scope row; TASKS R7). One row an invoice that has a number —
// void ones included, said to be void — with its number, the day it was issued in the
// company's zone, customer, job, currency, subtotal, tax, total, what is paid and what is
// owed, and its state. It is no accounting package's import format, and says so nowhere in
// the file: it is a list for a person or a spreadsheet. The figures are `invoice.list`'s
// own, so the file's totals are the screen's. Money is written as decimals with two places.
// Consumed by routers/invoice.ts.
import { z } from "zod";

import type { Tx } from "../core/context";
import { csv, hoursText, text } from "../core/csv";
import type { AppUser } from "../core/resolve-user";
import { companyZone } from "../labor/day-hours";
import { workDate } from "../labor/work-date";
import { listInvoices } from "./read";

export const INVOICE_COLUMNS = [
  "number",
  "issued_on",
  "customer",
  "job",
  "currency",
  "subtotal",
  "tax",
  "total",
  "paid",
  "owed",
  "state",
] as const;

export const exportOutput = z.strictObject({
  filename: z.string(),
  csv: z.string(),
  invoices: z.number().int().nonnegative(),
});

// Cents as a decimal with two places: the same digits as hundredths of an hour.
const moneyText = hoursText;

type Listed = Awaited<ReturnType<typeof listInvoices>>[number];

// Pure: the file of what the list answered. By number, lowest first.
export function invoicesCsv(invoices: readonly Listed[], timeZone: string): string {
  const issued = invoices
    .filter((i) => i.number !== null && i.issuedAt !== null)
    .sort((a, b) => a.number! - b.number!);
  return csv([
    [...INVOICE_COLUMNS],
    ...issued.map((i) => [
      String(i.number),
      workDate(i.issuedAt!, timeZone),
      text(i.customer.name),
      text(i.job.name),
      i.currency,
      moneyText(i.subtotalCents),
      moneyText(i.taxCents),
      moneyText(i.totalCents),
      moneyText(i.paidCents),
      moneyText(i.owedCents),
      i.state,
    ]),
  ]);
}

export async function exportInvoices(
  tx: Tx,
  user: AppUser,
): Promise<z.infer<typeof exportOutput>> {
  const timeZone = await companyZone(tx, user.companyId);
  const listed = await listInvoices(tx);
  const file = invoicesCsv(listed, timeZone);
  return {
    filename: `invoices-${workDate(new Date(), timeZone)}.csv`,
    csv: file,
    invoices: listed.filter((i) => i.number !== null).length,
  };
}
