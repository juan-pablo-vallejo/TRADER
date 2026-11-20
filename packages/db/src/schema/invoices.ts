import { sql } from "drizzle-orm";
import {
  check,
  date,
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
import { jobs } from "./jobs";
import { createdAt, id, updatedAt } from "./shared";
import { users } from "./users";

// The company's invoice number series: gap-free per company, continuing the contractor's
// existing series. One row per company, created with it (the seed; onboarding) holding the
// next number. A trigger advances it inside the issuing transaction by UPDATE ... RETURNING:
// the row lock serialises concurrent issues, and an aborted issue rolls the counter back with
// it, so there is never a gap. A Postgres sequence is not used because nextval is never
// rolled back, and one sequence per tenant would be DDL at onboarding. A table rather than a
// column on companies: tenant-scoped for RLS, and the lock never touches the company row.
export const invoiceCounters = pgTable(
  "invoice_counters",
  {
    companyId: uuid("company_id")
      .primaryKey()
      .references(() => companies.id),
    nextInvoiceNumber: integer("next_invoice_number").notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    check(
      "invoice_counters_next_invoice_number_positive",
      sql`${t.nextInvoiceNumber} > 0`,
    ),
  ],
);

// An invoice: draft → issued → void. State is derived from the
// timestamps: draft is issued_at IS NULL; issued
// is issued_at set and voided_at NULL; void is voided_at set. No status enum, so no rule
// below names an enum member. An office row, so the id defaults.
//
// Money (invariant 6): tax_cents is the one input — the admin enters tax per invoice and
// TRADER does the arithmetic. The subtotal is the sum of the lines' amount_cents and the
// total is that plus tax, both derived and stable because a trigger freezes the lines
// and this row at issue. Every line carries the invoice's currency through
// a foreign key over (company_id, id, currency), which also makes the currency immutable
// once a line exists.
//
// The baseline migration adds the lifecycle: every invoice is born a draft; issue assigns
// `number` from invoice_counters; an issued row refuses every UPDATE except the single void and
// refuses DELETE; a draft may be deleted, cascading its lines.
export const invoices = pgTable(
  "invoices",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    customerId: uuid("customer_id").notNull(),
    jobId: uuid("job_id").notNull(),
    // NULL while draft; assigned at issue by the trigger, never supplied. Unique per
    // company: the series. The partner's format (prefix, padding) is presentation.
    number: integer("number"),
    // ISO 4217, upper case; no default.
    currency: text("currency").notNull(),
    taxCents: integer("tax_cents").notNull(),
    // The day it is due: a calendar day. A draft may name it; at issue the trigger fills
    // it from the company's terms when the draft did not, and it is frozen with the rest.
    dueOn: date("due_on", { mode: "string" }),
    // What prints, copied from the company at issue by the trigger and frozen with the
    // rest: an issued invoice's page never changes when Settings do. Null on a draft.
    printedCompanyName: text("printed_company_name"),
    printedCompanyAddress: text("printed_company_address"),
    printedCompanyPhone: text("printed_company_phone"),
    printedCompanyEmail: text("printed_company_email"),
    printedPaymentInstructions: text("printed_payment_instructions"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    issuedByUserId: uuid("issued_by_user_id"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByUserId: uuid("voided_by_user_id"),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("invoices_company_id_id_unique").on(t.companyId, t.id),
    // The target of the lines' currency-carrying foreign key.
    unique("invoices_company_id_id_currency_unique").on(t.companyId, t.id, t.currency),
    unique("invoices_company_id_number_unique").on(t.companyId, t.number),
    // Composite over jobs' (company_id, customer_id, id) unique, so the invoice is to the
    // job's customer and both belong to the row's company (invariant 5) — and a job's
    // customer is immutable once an invoice exists.
    foreignKey({
      name: "invoices_company_id_customer_id_job_id_fk",
      columns: [t.companyId, t.customerId, t.jobId],
      foreignColumns: [jobs.companyId, jobs.customerId, jobs.id],
    }),
    foreignKey({
      name: "invoices_company_id_issued_by_user_id_fk",
      columns: [t.companyId, t.issuedByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    foreignKey({
      name: "invoices_company_id_voided_by_user_id_fk",
      columns: [t.companyId, t.voidedByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    // The invoice list and the drafts; a job's invoices; a customer's.
    index("invoices_company_id_issued_at_idx").on(t.companyId, t.issuedAt),
    index("invoices_job_id_idx").on(t.jobId),
    index("invoices_customer_id_idx").on(t.customerId),
    check("invoices_number_positive", sql`${t.number} > 0`),
    check(
      "invoices_number_with_issue",
      sql`(${t.number} IS NULL) = (${t.issuedAt} IS NULL)`,
    ),
    check("invoices_currency_iso_4217", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("invoices_tax_cents_nonnegative", sql`${t.taxCents} >= 0`),
    check(
      "invoices_issued_complete",
      sql`(${t.issuedAt} IS NULL) = (${t.issuedByUserId} IS NULL)`,
    ),
    check(
      "invoices_voided_complete",
      sql`(${t.voidedAt} IS NULL) = (${t.voidedByUserId} IS NULL)`,
    ),
    check(
      "invoices_void_after_issue",
      sql`${t.voidedAt} IS NULL OR ${t.issuedAt} IS NOT NULL`,
    ),
    check("invoices_void_not_before_issue", sql`${t.voidedAt} >= ${t.issuedAt}`),
    // An issued invoice always says when it is due.
    check(
      "invoices_issued_has_due",
      sql`${t.issuedAt} IS NULL OR ${t.dueOn} IS NOT NULL`,
    ),
    // And always carries the name it printed under.
    check(
      "invoices_issued_has_print",
      sql`${t.issuedAt} IS NULL OR ${t.printedCompanyName} IS NOT NULL`,
    ),
  ],
);
