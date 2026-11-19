// invoice.list, invoice.read and invoice.suggest. Plain reads under RLS. An invoice's state is derived, never stored: a draft has no
// number, an issued one has, a void one has a void stamp. Totals are sums of the stored
// line amounts and the stored tax, added here and never rounded again.
//
// `suggest` shows the job's hours beside a draft, one figure a work date, every worker's
// together. It carries no price: what the customer is charged is typed by the admin on every
// line. The hours are the one labor derivation's figures (labor/day-hours.ts): a day's
// quantity is the sum of that day's rounded cells, added and never rounded again. Consumed
// by routers/invoice.ts.
import {
  customers,
  invoiceLineItems,
  invoicePayments,
  invoiceSends,
  invoices,
  jobs,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { companyZone, readDayHours } from "../labor/day-hours";
import { hoursQuantity, totals } from "./lines";

const named = z.strictObject({ id: z.uuid(), name: z.string() });
const state = z.enum(["draft", "issued", "void"]);
const amounts = {
  subtotalCents: z.number().int(),
  taxCents: z.number().int(),
  totalCents: z.number().int(),
  // Of the payments that stand: neither reversed nor a reversal. Derived, never stored.
  paidCents: z.number().int(),
  // The total less what is paid; zero for a draft and for a void invoice, which owe nothing.
  owedCents: z.number().int(),
};
const header = {
  id: z.uuid(),
  state,
  // Null until issued.
  number: z.number().int().nullable(),
  customer: named,
  job: named,
  currency: z.string(),
  createdAt: z.date(),
  issuedAt: z.date().nullable(),
  voidedAt: z.date().nullable(),
  ...amounts,
};

export const LIST_LIMIT = 500;
export const listOutput = z.array(z.strictObject(header));

export const readInput = z.strictObject({ invoiceId: z.uuid() });
export const readOutput = z.strictObject({
  ...header,
  issuedBy: z.string().nullable(),
  voidedBy: z.string().nullable(),
  lines: z.array(
    z.strictObject({
      id: z.uuid(),
      description: z.string(),
      quantity: z.string(),
      unit: z.string().nullable(),
      unitPriceCents: z.number().int(),
      amountCents: z.number().int(),
    }),
  ),
  // The customer's address on file, offered as where to send the page; the admin may type
  // another.
  customerEmail: z.string().nullable(),
  // Every time the page was sent or failed to be, oldest first.
  sends: z.array(
    z.strictObject({
      id: z.uuid(),
      recipient: z.string(),
      outcome: z.enum(["sent", "failed"]),
      failure: z.string().nullable(),
      sentBy: z.string(),
      sentAt: z.date(),
    }),
  ),
  // Every recorded payment and reversal, oldest first.
  payments: z.array(
    z.strictObject({
      id: z.uuid(),
      amountCents: z.number().int(),
      paidOn: z.iso.date(),
      method: z.string(),
      note: z.string().nullable(),
      recordedBy: z.string(),
      recordedAt: z.date(),
      // The payment this row reverses, when it is a reversal.
      reversesPaymentId: z.uuid().nullable(),
      // Whether a later row reversed this payment.
      reversed: z.boolean(),
    }),
  ),
});

export const suggestInput = readInput;
export const suggestOutput = z.strictObject({
  // The zone the work dates were judged in.
  timezone: z.string(),
  labor: z.array(
    z.strictObject({
      workDate: z.iso.date(),
      // Hours that count on the job that day, every worker's together.
      hundredths: z.number().int().positive(),
      quantity: z.string(),
    }),
  ),
});

const stateOf = (i: { number: number | null; voidedAt: Date | null }) =>
  i.voidedAt !== null
    ? ("void" as const)
    : i.number !== null
      ? ("issued" as const)
      : ("draft" as const);

const columns = {
  id: invoices.id,
  number: invoices.number,
  currency: invoices.currency,
  taxCents: invoices.taxCents,
  createdAt: invoices.createdAt,
  issuedAt: invoices.issuedAt,
  voidedAt: invoices.voidedAt,
  customerId: customers.id,
  customerName: customers.name,
  jobId: jobs.id,
  jobName: jobs.name,
};

type Row = {
  id: string;
  number: number | null;
  currency: string;
  taxCents: number;
  createdAt: Date;
  issuedAt: Date | null;
  voidedAt: Date | null;
  customerId: string;
  customerName: string;
  jobId: string;
  jobName: string;
};

// What is owed: only an issued invoice that is not void owes anything.
const owed = (r: Row, totalCents: number, paidCents: number) =>
  r.number === null || r.voidedAt !== null ? 0 : totalCents - paidCents;

// The sum of an invoice's payments that stand.
const PAID = sql<number>`coalesce((
  select sum(p.amount_cents) from invoice_payments p
  where p.invoice_id = ${invoices.id} and p.reverses_payment_id is null
    and not exists (select 1 from invoice_payments r where r.reverses_payment_id = p.id)
), 0)::int`;

const headerOf = (r: Row, subtotalCents: number, paidCents: number) => ({
  id: r.id,
  state: stateOf(r),
  number: r.number,
  customer: { id: r.customerId, name: r.customerName },
  job: { id: r.jobId, name: r.jobName },
  currency: r.currency,
  createdAt: r.createdAt,
  issuedAt: r.issuedAt,
  voidedAt: r.voidedAt,
  subtotalCents,
  taxCents: r.taxCents,
  totalCents: subtotalCents + r.taxCents,
  paidCents,
  owedCents: owed(r, subtotalCents + r.taxCents, paidCents),
});

// Newest first: drafts by when they were made, issued invoices by their number.
export async function listInvoices(tx: Tx): Promise<z.infer<typeof listOutput>> {
  const rows = await tx
    .select({
      ...columns,
      subtotalCents: sql<number>`coalesce((
        select sum(l.amount_cents) from invoice_line_items l where l.invoice_id = ${invoices.id}
      ), 0)::int`,
      paidCents: PAID,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .innerJoin(jobs, eq(jobs.id, invoices.jobId))
    .orderBy(
      sql`${invoices.number} desc nulls first`,
      desc(invoices.createdAt),
      desc(invoices.id),
    )
    .limit(LIST_LIMIT);
  return rows.map((r) => headerOf(r, r.subtotalCents, r.paidCents));
}

export async function readInvoice(
  tx: Tx,
  input: z.infer<typeof readInput>,
): Promise<z.infer<typeof readOutput>> {
  const issuer = alias(users, "issuer");
  const voider = alias(users, "voider");
  const [row] = await tx
    .select({ ...columns, issuedBy: issuer.name, voidedBy: voider.name, paidCents: PAID })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .innerJoin(jobs, eq(jobs.id, invoices.jobId))
    .leftJoin(issuer, eq(issuer.id, invoices.issuedByUserId))
    .leftJoin(voider, eq(voider.id, invoices.voidedByUserId))
    .where(eq(invoices.id, input.invoiceId));
  // Missing, or another tenant's and so invisible: one answer.
  if (row === undefined) throw forbidden();
  const lines = await tx
    .select({
      id: invoiceLineItems.id,
      description: invoiceLineItems.description,
      quantity: invoiceLineItems.quantity,
      unit: invoiceLineItems.unit,
      unitPriceCents: invoiceLineItems.unitPriceCents,
      amountCents: invoiceLineItems.amountCents,
    })
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, row.id))
    .orderBy(asc(invoiceLineItems.position), asc(invoiceLineItems.id));
  const recorded = await tx
    .select({
      id: invoicePayments.id,
      amountCents: invoicePayments.amountCents,
      paidOn: invoicePayments.paidOn,
      method: invoicePayments.method,
      note: invoicePayments.note,
      recordedBy: users.name,
      recordedAt: invoicePayments.createdAt,
      reversesPaymentId: invoicePayments.reversesPaymentId,
    })
    .from(invoicePayments)
    .innerJoin(users, eq(users.id, invoicePayments.recordedByUserId))
    .where(eq(invoicePayments.invoiceId, row.id))
    .orderBy(asc(invoicePayments.createdAt), asc(invoicePayments.id));
  const sender = alias(users, "sender");
  const sends = await tx
    .select({
      id: invoiceSends.id,
      recipient: invoiceSends.recipient,
      outcome: invoiceSends.outcome,
      failure: invoiceSends.failure,
      sentBy: sender.name,
      sentAt: invoiceSends.createdAt,
    })
    .from(invoiceSends)
    .innerJoin(sender, eq(sender.id, invoiceSends.sentByUserId))
    .where(eq(invoiceSends.invoiceId, row.id))
    .orderBy(asc(invoiceSends.createdAt), asc(invoiceSends.id));
  const [contact] = await tx
    .select({ email: customers.email })
    .from(customers)
    .where(eq(customers.id, row.customerId));
  const reversedIds = new Set(recorded.map((p) => p.reversesPaymentId));
  return {
    ...headerOf(row, totals(lines, row.taxCents).subtotalCents, row.paidCents),
    issuedBy: row.issuedBy,
    voidedBy: row.voidedBy,
    lines,
    customerEmail: contact?.email ?? null,
    sends: sends.map((x) => ({
      ...x,
      outcome: x.outcome === "sent" ? "sent" : "failed",
    })),
    payments: recorded.map((p) => ({ ...p, reversed: reversedIds.has(p.id) })),
  };
}

export async function suggestLines(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof suggestInput>,
): Promise<z.infer<typeof suggestOutput>> {
  const [invoice] = await tx
    .select({ jobId: invoices.jobId })
    .from(invoices)
    .where(eq(invoices.id, input.invoiceId));
  if (invoice === undefined) throw forbidden();
  const timezone = await companyZone(tx, user.companyId);
  const workers = await tx
    .selectDistinct({ id: workSessionEvents.workerId })
    .from(workSessionEvents)
    .where(eq(workSessionEvents.jobId, invoice.jobId));
  const cells = await readDayHours(
    tx,
    workers.map((w) => w.id),
    timezone,
  );
  const byDay = new Map<string, number>();
  for (const cell of cells) {
    if (cell.jobId !== invoice.jobId) continue;
    byDay.set(cell.workDate, (byDay.get(cell.workDate) ?? 0) + cell.hundredths);
  }
  return {
    timezone,
    labor: [...byDay]
      .filter(([, hundredths]) => hundredths > 0)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([workDate, hundredths]) => ({
        workDate,
        hundredths,
        quantity: hoursQuantity(hundredths),
      })),
  };
}
