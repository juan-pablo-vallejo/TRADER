// invoice.create, save and remove: a draft and its lines. A draft belongs to a job and so to that
// job's customer. Its lines are snapshots: each holds its own description, quantity and unit,
// and the price the admin typed; a line whose quantity was copied from the job's hours
// (read.ts, suggest) holds that figure as it was then and never follows the hours.
// `save` replaces the draft's lines whole, in the order sent, and sets its tax: what is
// stored is what the admin saw. An issued invoice is not changed here at all — the database
// refuses it as well.
//
// Ids are the browser's: a `create` sent again answers `duplicate`. Lock order: the caller
// re-read, then the invoice's row FOR UPDATE, which is what an issue takes, so a save and an
// issue of one draft never interleave. Who
// issued and who voided an invoice are on its row.
import { invoiceLineItems, invoices, jobs } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { workDay } from "../shifts/write";
import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { amountCents, lineInput, MAX_CENTS, MAX_LINES, taxInput } from "./lines";

export const createInput = z.strictObject({
  id: z.uuid({ version: "v7" }),
  jobId: z.uuid(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export const createOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.enum(["created", "duplicate"]) }),
  z.strictObject({ result: z.literal("rejected"), code: z.literal("id_conflict") }),
]);

export const updateInput = z.strictObject({
  invoiceId: z.uuid(),
  taxCents: taxInput,
  // The day it is due, when the draft names one; null leaves it to the company's terms,
  // which issuing fills it from.
  dueOn: workDay.nullable().default(null),
  lines: z
    .array(lineInput)
    .max(MAX_LINES)
    .refine((lines) => new Set(lines.map((l) => l.id)).size === lines.length, {
      message: "A line id is used once.",
    }),
});
export const updateOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("saved") }),
  z.strictObject({
    result: z.literal("rejected"),
    // `issued`: no longer a draft. `too_large`: a line's amount or the total would not fit.
    code: z.enum(["issued", "too_large"]),
  }),
]);

export const removeInput = z.strictObject({ invoiceId: z.uuid() });
export const removeOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.enum(["removed", "unchanged"]) }),
  z.strictObject({ result: z.literal("rejected"), code: z.literal("issued") }),
]);

export async function createInvoice(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof createInput>,
): Promise<z.infer<typeof createOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const [job] = await tx
    .select({ id: jobs.id, customerId: jobs.customerId })
    .from(jobs)
    .where(eq(jobs.id, input.jobId));
  // A missing id and another tenant's (invisible under RLS) are one answer.
  if (job === undefined) throw forbidden();
  const inserted = await tx
    .insert(invoices)
    .values({
      id: input.id,
      companyId: user.companyId,
      customerId: job.customerId,
      jobId: job.id,
      currency: input.currency,
      taxCents: 0,
    })
    // The id is named: any other violation is a defect and must be raised.
    .onConflictDoNothing({ target: invoices.id })
    .returning({ id: invoices.id });
  if (inserted.length === 1) return { result: "created" };
  const [existing] = await tx
    .select({ jobId: invoices.jobId, currency: invoices.currency })
    .from(invoices)
    .where(eq(invoices.id, input.id));
  return existing !== undefined &&
    existing.jobId === job.id &&
    existing.currency === input.currency
    ? { result: "duplicate" }
    : { result: "rejected", code: "id_conflict" };
}

// The invoice's row, held as an issue holds it. Missing, or another tenant's: FORBIDDEN.
export async function lockInvoice(tx: Tx, invoiceId: string) {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .for("update");
  return invoice;
}

export async function updateInvoice(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof updateInput>,
): Promise<z.infer<typeof updateOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const invoice = await lockInvoice(tx, input.invoiceId);
  if (invoice === undefined) throw forbidden();
  if (invoice.issuedAt !== null) return { result: "rejected", code: "issued" };

  const lines = [];
  let subtotal = 0;
  for (const [position, line] of input.lines.entries()) {
    const amount = amountCents(line.quantity, line.unitPriceCents);
    if (amount === null) return { result: "rejected", code: "too_large" };
    subtotal += amount;
    lines.push({
      id: line.id,
      companyId: user.companyId,
      invoiceId: invoice.id,
      currency: invoice.currency,
      position,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      amountCents: amount,
    });
  }
  if (subtotal + input.taxCents > MAX_CENTS)
    return { result: "rejected", code: "too_large" };

  await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoice.id));
  if (lines.length > 0) {
    const inserted = await tx
      .insert(invoiceLineItems)
      .values(lines)
      // A line id taken by another invoice, or by a row this tenant cannot see.
      .onConflictDoNothing({ target: invoiceLineItems.id })
      .returning({ id: invoiceLineItems.id });
    if (inserted.length !== lines.length) throw forbidden();
  }
  await tx
    .update(invoices)
    .set({ taxCents: input.taxCents, dueOn: input.dueOn })
    .where(eq(invoices.id, invoice.id));
  return { result: "saved" };
}

export async function removeInvoice(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof removeInput>,
): Promise<z.infer<typeof removeOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const invoice = await lockInvoice(tx, input.invoiceId);
  // Not there — never made, removed already, or another tenant's: a retry is harmless.
  if (invoice === undefined) return { result: "unchanged" };
  if (invoice.issuedAt !== null) return { result: "rejected", code: "issued" };
  await tx.delete(invoices).where(eq(invoices.id, invoice.id));
  return { result: "removed" };
}
