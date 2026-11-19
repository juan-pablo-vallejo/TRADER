import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { invoices } from "./invoices";
import { createdAt, id, updatedAt } from "./shared";

// A line is typed by the admin and is a snapshot, never a live reference: the office enters
// the figures while the invoice is a draft, and a trigger refuses any INSERT, UPDATE or
// DELETE here once the invoice is issued. An office row,
// so the id defaults; deleting a draft cascades its lines.
//
// Money is whole cents: amount_cents is the figure the invoice total sums, stored so the PDF
// shows quantity × unit price and the sum is exact. The check ties the three
// together with Postgres numeric rounding (half away from zero). The currency is the
// invoice's by foreign key, so no line can disagree with its invoice.
export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    invoiceId: uuid("invoice_id").notNull(),
    currency: text("currency").notNull(),
    // Display order; duplicates sort by id. Not unique, so a draft can be reordered in one
    // statement.
    position: integer("position").notNull(),
    description: text("description").notNull(),
    // Hours, gallons, or 1 for a lump sum. Exact decimal.
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: text("unit"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("invoice_line_items_company_id_id_unique").on(t.companyId, t.id),
    // Composite over invoices' (company_id, id, currency) unique: the line is in its
    // invoice's company and currency, and goes with a deleted draft.
    foreignKey({
      name: "invoice_line_items_company_id_invoice_id_currency_fk",
      columns: [t.companyId, t.invoiceId, t.currency],
      foreignColumns: [invoices.companyId, invoices.id, invoices.currency],
    }).onDelete("cascade"),
    // An invoice's lines in order.
    index("invoice_line_items_invoice_id_position_idx").on(t.invoiceId, t.position),
    check("invoice_line_items_position_nonnegative", sql`${t.position} >= 0`),
    check("invoice_line_items_description_not_blank", sql`btrim(${t.description}) <> ''`),
    check("invoice_line_items_quantity_positive", sql`${t.quantity} > 0`),
    check("invoice_line_items_unit_not_blank", sql`btrim(${t.unit}) <> ''`),
    check(
      "invoice_line_items_unit_price_cents_nonnegative",
      sql`${t.unitPriceCents} >= 0`,
    ),
    check(
      "invoice_line_items_amount_is_quantity_times_price",
      sql`${t.amountCents} = round(${t.quantity} * ${t.unitPriceCents})`,
    ),
  ],
);
