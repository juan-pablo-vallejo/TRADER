// invoice.recordPayment and invoice.reversePayment: the office
// records the payments a customer makes.
// TRADER captures and processes nothing: a payment is a note of money that arrived — amount,
// day, method, a note — against an issued invoice. It changes nothing on the invoice; what
// is owed is derived (read.ts). A payment recorded by mistake is reversed by a second row,
// never edited or removed; both then count toward nothing.
//
// The database judges each insert under the invoice's row lock: the invoice is issued
// and not void, the payments that stand never total more than it, a reversal names a
// standing payment of the same invoice for its amount. This module holds that row first,
// so it can answer in words what the database would refuse, and names the database's own
// refusal where two calls raced. Ids are the browser's: a record sent again is `duplicate`.
// Consumed by routers/invoice.ts.
import { invoicePayments } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { workDay } from "../assignments/write";
import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import { pgFailure } from "../core/pg-error";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { lockInvoice } from "./draft";
import { MAX_CENTS } from "./lines";

export const METHODS = ["check", "cash", "card", "bank_transfer", "other"] as const;
const note = z.string().trim().min(1).max(500).nullable();

export const recordInput = z.strictObject({
  id: z.uuid(),
  invoiceId: z.uuid(),
  amountCents: z.number().int().min(1).max(MAX_CENTS),
  paidOn: workDay,
  method: z.enum(METHODS),
  note,
});
export const recordOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.enum(["recorded", "duplicate"]) }),
  z.strictObject({
    result: z.literal("rejected"),
    // `overpaid`: with this, the payments would total more than the invoice.
    code: z.enum(["not_issued", "void", "overpaid", "id_conflict"]),
  }),
]);

export const reverseInput = z.strictObject({
  id: z.uuid(),
  paymentId: z.uuid(),
  note,
});
export const reverseOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.enum(["reversed", "duplicate"]) }),
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["void", "already_reversed", "is_reversal", "id_conflict"]),
  }),
]);

const constraintOf = (error: unknown) => pgFailure(error).constraint;

async function byId(tx: Tx, id: string) {
  const [row] = await tx.select().from(invoicePayments).where(eq(invoicePayments.id, id));
  return row;
}

export async function recordPayment(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof recordInput>,
): Promise<z.infer<typeof recordOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const invoice = await lockInvoice(tx, input.invoiceId);
  // Missing, or another tenant's: one answer.
  if (invoice === undefined) throw forbidden();
  const existing = await byId(tx, input.id);
  if (existing !== undefined) {
    const same =
      existing.invoiceId === invoice.id &&
      existing.amountCents === input.amountCents &&
      existing.paidOn === input.paidOn &&
      existing.method === input.method &&
      existing.note === input.note &&
      existing.reversesPaymentId === null;
    return same ? { result: "duplicate" } : { result: "rejected", code: "id_conflict" };
  }
  if (invoice.issuedAt === null) return { result: "rejected", code: "not_issued" };
  if (invoice.voidedAt !== null) return { result: "rejected", code: "void" };
  try {
    // A savepoint: the database's refusal is an answer and must not abort the caller's
    // transaction.
    const inserted = await tx.transaction((sp) =>
      sp
        .insert(invoicePayments)
        .values({
          id: input.id,
          companyId: user.companyId,
          invoiceId: invoice.id,
          currency: invoice.currency,
          amountCents: input.amountCents,
          paidOn: input.paidOn,
          method: input.method,
          note: input.note,
          recordedByUserId: user.id,
        })
        // The id is named: taken by a row this tenant cannot see, it is refused.
        .onConflictDoNothing({ target: invoicePayments.id })
        .returning({ id: invoicePayments.id }),
    );
    return inserted.length === 1
      ? { result: "recorded" }
      : { result: "rejected", code: "id_conflict" };
  } catch (error) {
    if (constraintOf(error) === "invoice_payments_not_overpaid") {
      return { result: "rejected", code: "overpaid" };
    }
    throw error;
  }
}

export async function reversePayment(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof reverseInput>,
): Promise<z.infer<typeof reverseOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const seen = await byId(tx, input.paymentId);
  if (seen === undefined) throw forbidden();
  const invoice = await lockInvoice(tx, seen.invoiceId);
  if (invoice === undefined) throw forbidden();
  const existing = await byId(tx, input.id);
  if (existing !== undefined) {
    return existing.reversesPaymentId === seen.id
      ? { result: "duplicate" }
      : { result: "rejected", code: "id_conflict" };
  }
  if (seen.reversesPaymentId !== null) return { result: "rejected", code: "is_reversal" };
  if (invoice.voidedAt !== null) return { result: "rejected", code: "void" };
  try {
    const inserted = await tx.transaction((sp) =>
      sp
        .insert(invoicePayments)
        .values({
          id: input.id,
          companyId: user.companyId,
          invoiceId: invoice.id,
          currency: invoice.currency,
          amountCents: seen.amountCents,
          paidOn: seen.paidOn,
          method: seen.method,
          note: input.note,
          reversesPaymentId: seen.id,
          recordedByUserId: user.id,
        })
        .onConflictDoNothing({ target: invoicePayments.id })
        .returning({ id: invoicePayments.id }),
    );
    return inserted.length === 1
      ? { result: "reversed" }
      : { result: "rejected", code: "id_conflict" };
  } catch (error) {
    if (constraintOf(error) === "invoice_payments_reverses_payment_id_unique") {
      return { result: "rejected", code: "already_reversed" };
    }
    throw error;
  }
}
