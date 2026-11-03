import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { invoices } from "./invoices";
import { createdAt, id } from "./shared";
import { users } from "./users";

// A credit against an issued invoice (PRD, Invoicing and exports: an issued invoice is
// immutable; a change is a credit memo or a new invoice). Issued the moment it is written,
// numbered from the company's own credit-memo series, and append-only after that: no
// updated_at, and migration 0010 refuses UPDATE, DELETE and TRUNCATE. A wrong memo is
// answered by a new invoice. An office row, so the id defaults.
//
// Migration 0010 also requires the invoice to be issued and not voided, and assigns
// `number` in a BEFORE INSERT trigger, so an insert passes sql`NULL` for it: the column is
// NOT NULL, checked after the trigger has filled it, and a supplied number is refused.
export const creditMemos = pgTable(
  "credit_memos",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    invoiceId: uuid("invoice_id").notNull(),
    currency: text("currency").notNull(),
    number: integer("number").notNull(),
    // Integer minor units, the invoice's currency beside them by foreign key (invariant 3).
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    issuedByUserId: uuid("issued_by_user_id").notNull(),
    createdAt,
  },
  (t) => [
    unique("credit_memos_company_id_id_unique").on(t.companyId, t.id),
    unique("credit_memos_company_id_number_unique").on(t.companyId, t.number),
    // Composite over invoices' (company_id, id, currency) unique: the memo is in its
    // invoice's company (invariant 4) and currency.
    foreignKey({
      name: "credit_memos_company_id_invoice_id_currency_fk",
      columns: [t.companyId, t.invoiceId, t.currency],
      foreignColumns: [invoices.companyId, invoices.id, invoices.currency],
    }),
    foreignKey({
      name: "credit_memos_company_id_issued_by_user_id_fk",
      columns: [t.companyId, t.issuedByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    // An invoice's credits (Stage 8).
    index("credit_memos_invoice_id_idx").on(t.invoiceId),
    check("credit_memos_number_positive", sql`${t.number} > 0`),
    check("credit_memos_amount_cents_positive", sql`${t.amountCents} > 0`),
    check("credit_memos_reason_not_blank", sql`btrim(${t.reason}) <> ''`),
  ],
);
