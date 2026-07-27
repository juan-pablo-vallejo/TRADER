import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { cents, currency, primaryId, timestamps } from "./_shared.js";
import { companies } from "./companies.js";
import { customers } from "./customers.js";
import { invoiceStatus } from "./enums.js";
import { jobs } from "./jobs.js";
import { materials } from "./materials.js";

/**
 * A tracking record in v1 — already shaped for real payments (SPEC §4).
 *
 * `paid` is set manually until Phase 5, when a `payments` row will attach to this
 * exact invoice and flip the status automatically. That phase adds tables; it does
 * not restructure this one.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: primaryId,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    jobId: uuid("job_id").references(() => jobs.id),
    invoiceNumber: text("invoice_number").notNull(),
    status: invoiceStatus("status").notNull().default("draft"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    subtotalCents: cents("subtotal_cents").notNull().default(0),
    taxCents: cents("tax_cents").notNull().default(0),
    totalCents: cents("total_cents").notNull().default(0),
    currency: currency().notNull().default("USD"),
    pdfS3Key: text("pdf_s3_key"),
    ...timestamps,
  },
  (t) => [
    /** SPEC §4: unique per company, not globally. */
    unique("invoices_company_number_unq").on(t.companyId, t.invoiceNumber),
    index("invoices_customer_idx").on(t.customerId),
    index("invoices_company_status_idx").on(t.companyId, t.status),
  ],
);

/**
 * Invoices are structured data, not a text blob (SPEC §4). Line items may be
 * entered by hand or pulled from a job's labor and materials.
 */
export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: primaryId,
    /** Carried for the RLS seam, though derivable via `invoice_id`. */
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
    unitPriceCents: cents("unit_price_cents").notNull().default(0),
    lineTotalCents: cents("line_total_cents").notNull().default(0),
    /** Provenance links, when the line came from real field data. */
    jobId: uuid("job_id").references(() => jobs.id),
    materialId: uuid("material_id").references(() => materials.id),
    ...timestamps,
  },
  (t) => [index("invoice_line_items_invoice_idx").on(t.invoiceId)],
);
