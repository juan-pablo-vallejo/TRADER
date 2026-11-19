import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { invoices } from "./invoices";
import { createdAt } from "./shared";
import { users } from "./users";

// What a customer paid against an issued invoice, as the office recorded it. TRADER captures
// and processes nothing: a row is a note that money arrived — how much, on what day, by what
// means. It changes nothing on the invoice: what is owed, and whether the invoice is paid,
// are derived from these rows and the invoice's total and never stored.
//
// Append-only (the baseline migration's reject_mutation triggers): no updated_at. A payment
// recorded by mistake is not edited or deleted; a second row reverses it, naming it in
// reverses_payment_id, for the same amount. A payment that has a reversal, and the reversal
// itself, count toward nothing. The id is the browser's, so a record sent again is the same record.
//
// Guards the database holds (a trigger in the baseline migration): the invoice is issued and
// not void; a reversal names a payment of the same invoice that is not itself a reversal and
// has none yet, for its amount; and the payments that stand never total more than the invoice — no overpayment.
export const invoicePayments = pgTable(
  "invoice_payments",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    invoiceId: uuid("invoice_id").notNull(),
    // The invoice's own: a payment is in the currency it was billed in.
    currency: text("currency").notNull(),
    amountCents: integer("amount_cents").notNull(),
    // The day the customer paid, as the office read it off the check or the statement: a
    // calendar day, never derived from an instant.
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    method: text("method").notNull(),
    note: text("note"),
    reversesPaymentId: uuid("reverses_payment_id"),
    recordedByUserId: uuid("recorded_by_user_id").notNull(),
    createdAt,
  },
  (t) => [
    unique("invoice_payments_company_id_id_unique").on(t.companyId, t.id),
    foreignKey({
      name: "invoice_payments_company_id_invoice_id_currency_fk",
      columns: [t.companyId, t.invoiceId, t.currency],
      foreignColumns: [invoices.companyId, invoices.id, invoices.currency],
    }),
    foreignKey({
      name: "invoice_payments_company_id_recorded_by_user_id_fk",
      columns: [t.companyId, t.recordedByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    foreignKey({
      name: "invoice_payments_company_id_reverses_payment_id_fk",
      columns: [t.companyId, t.reversesPaymentId],
      foreignColumns: [t.companyId, t.id],
    }),
    // One reversal for a payment, at most.
    unique("invoice_payments_reverses_payment_id_unique").on(t.reversesPaymentId),
    index("invoice_payments_invoice_id_idx").on(t.invoiceId),
    check("invoice_payments_amount_cents_positive", sql`${t.amountCents} > 0`),
    check(
      "invoice_payments_method",
      sql`${t.method} IN ('check', 'cash', 'card', 'bank_transfer', 'other')`,
    ),
    check("invoice_payments_note_not_blank", sql`btrim(${t.note}) <> ''`),
  ],
);
