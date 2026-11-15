// invoice.issue and invoice.void (PRD, Invoicing and exports: draft → issued → void;
// ARCHITECTURE, Invoice pricing, Credit and void; TASKS R6). Issue is one UPDATE of the
// draft: the database assigns the next number of the company's series under the counter
// row's lock, so concurrent issues take consecutive numbers and a rolled-back one leaves no
// gap, and from then the row and its lines are frozen (0010, 0043). Sent again, an issue
// answers the number the invoice already has: a retry never spends a second number. A void
// is the one later change, once, touching nothing else; it takes no number.
//
// Lock order: the caller re-read, the invoice's row FOR UPDATE, then — inside the database's
// trigger — the counter's row. Consumed by routers/invoice.ts.
import { invoiceLineItems, invoices } from "@trader/db/schema";
import { DrizzleQueryError, eq } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { lockInvoice } from "./draft";

export const issueInput = z.strictObject({ invoiceId: z.uuid() });
export const issueOutput = z.discriminatedUnion("result", [
  z.strictObject({
    // `duplicate`: already issued; this is its number.
    result: z.enum(["issued", "duplicate"]),
    number: z.number().int().positive(),
  }),
  z.strictObject({
    result: z.literal("rejected"),
    // `no_number_series`: the company's counter was never created (onboarding makes it).
    code: z.enum(["no_lines", "no_number_series"]),
  }),
]);

export const voidInput = z.strictObject({ invoiceId: z.uuid() });
export const voidOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.enum(["voided", "duplicate"]) }),
  z.strictObject({ result: z.literal("rejected"), code: z.literal("not_issued") }),
]);

export async function issueInvoice(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof issueInput>,
): Promise<z.infer<typeof issueOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const invoice = await lockInvoice(tx, input.invoiceId);
  if (invoice === undefined) throw forbidden();
  if (invoice.number !== null) return { result: "duplicate", number: invoice.number };
  const lines = await tx.$count(
    invoiceLineItems,
    eq(invoiceLineItems.invoiceId, invoice.id),
  );
  if (lines === 0) return { result: "rejected", code: "no_lines" };
  try {
    // A savepoint: a missing counter is an answer, and must not abort the caller's
    // transaction.
    const [issued] = await tx.transaction((sp) =>
      sp
        .update(invoices)
        .set({ issuedAt: new Date(), issuedByUserId: user.id })
        .where(eq(invoices.id, invoice.id))
        .returning({ number: invoices.number }),
    );
    if (issued?.number == null) throw new Error("an issued invoice has a number");
    return { result: "issued", number: issued.number };
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : undefined;
    if (
      (cause as { constraint?: string } | undefined)?.constraint ===
      "invoices_counter_missing"
    ) {
      return { result: "rejected", code: "no_number_series" };
    }
    throw error;
  }
}

export async function voidInvoice(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof voidInput>,
): Promise<z.infer<typeof voidOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const invoice = await lockInvoice(tx, input.invoiceId);
  if (invoice === undefined) throw forbidden();
  if (invoice.issuedAt === null) return { result: "rejected", code: "not_issued" };
  if (invoice.voidedAt !== null) return { result: "duplicate" };
  await tx
    .update(invoices)
    .set({ voidedAt: new Date(), voidedByUserId: user.id })
    .where(eq(invoices.id, invoice.id));
  return { result: "voided" };
}
