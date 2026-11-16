// invoice.send: an issued invoice's PDF sent to the customer by email when an admin chooses,
// and each send recorded (PRD, Invoicing and exports; ARCHITECTURE, Payments and delivery;
// TASKS R7). The page is `invoice.pdf`'s own, made for this send and stored nowhere. The
// record is append-only: a send that failed is a row that says so with a short code, and
// sending again is another row under another id. The id is the browser's, so one request
// sent twice is one message: the second answers what the first did, and the mail service is
// handed the same id to refuse a repeat on its side too.
//
// The invoice's row is held from the check to the record, so a void cannot land between a
// message leaving and its row being written; the mailer answers within its own timeout
// (apps/web, server/mailer.ts). Where a deployment names an allow-list, a recipient outside
// it is a failed send that asked the service nothing (mailer.ts, restrictedTo).
// Consumed by routers/invoice.ts.
import { companies, invoiceSends } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import { MAIL_FAILURES, type Mailer } from "../core/mailer";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { lockInvoice } from "./draft";
import { invoicePdf, money } from "./pdf";
import { readInvoice } from "./read";

export const sendInput = z.strictObject({
  id: z.uuid({ version: "v7" }),
  invoiceId: z.uuid(),
  // One address, kept as it is compared: trimmed and lower-case.
  to: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});
export const sendOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("sent") }),
  // Recorded as failed; the admin may send again.
  z.strictObject({ result: z.literal("failed"), failure: z.enum(MAIL_FAILURES) }),
  // This request was answered before: what that answer was.
  z.strictObject({
    result: z.literal("duplicate"),
    outcome: z.enum(["sent", "failed"]),
  }),
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["not_issued", "void", "id_conflict"]),
  }),
]);

export async function sendInvoice(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof sendInput>,
  mailer: Mailer,
): Promise<z.infer<typeof sendOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const locked = await lockInvoice(tx, input.invoiceId);
  // Missing, or another tenant's: one answer.
  if (locked === undefined) throw forbidden();
  const [existing] = await tx
    .select({
      invoiceId: invoiceSends.invoiceId,
      recipient: invoiceSends.recipient,
      outcome: invoiceSends.outcome,
    })
    .from(invoiceSends)
    .where(eq(invoiceSends.id, input.id));
  if (existing !== undefined) {
    return existing.invoiceId === locked.id && existing.recipient === input.to
      ? { result: "duplicate", outcome: existing.outcome === "sent" ? "sent" : "failed" }
      : { result: "rejected", code: "id_conflict" };
  }
  if (locked.issuedAt === null) return { result: "rejected", code: "not_issued" };
  if (locked.voidedAt !== null) return { result: "rejected", code: "void" };

  const invoice = await readInvoice(tx, { invoiceId: locked.id });
  const file = await invoicePdf(tx, { invoiceId: locked.id });
  if (file.result !== "rendered" || invoice.number === null) {
    throw new Error("an issued invoice has no page");
  }
  const [company] = await tx.select({ name: companies.name }).from(companies);
  if (company === undefined) throw new Error("the caller's company is not visible");

  const answer = await mailer.send({
    to: input.to,
    subject: `Invoice ${invoice.number} from ${company.name}`,
    text: [
      `Invoice ${invoice.number} from ${company.name} is attached.`,
      `Total: ${money(invoice.totalCents)} ${invoice.currency}. Amount owed: ${money(invoice.owedCents)} ${invoice.currency}.`,
    ],
    attachment: { filename: file.filename, content: Buffer.from(file.pdf, "base64") },
    idempotencyKey: input.id,
  });
  const inserted = await tx
    .insert(invoiceSends)
    .values({
      id: input.id,
      companyId: user.companyId,
      invoiceId: locked.id,
      recipient: input.to,
      outcome: answer.ok ? "sent" : "failed",
      failure: answer.ok ? null : answer.failure,
      providerMessageId: answer.ok ? answer.messageId : null,
      sentByUserId: user.id,
    })
    // The id is named: taken by a row this tenant cannot see, it is refused, and the
    // record of this send would be lost — so that is an error, not an answer.
    .onConflictDoNothing({ target: invoiceSends.id })
    .returning({ id: invoiceSends.id });
  if (inserted.length !== 1) throw new Error("a send could not be recorded under its id");
  return answer.ok ? { result: "sent" } : { result: "failed", failure: answer.failure };
}
