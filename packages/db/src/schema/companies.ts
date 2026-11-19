import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text } from "drizzle-orm/pg-core";

import { createdAt, id, updatedAt } from "./shared";

// The tenant. Every other table carries company_id so a second contractor is
// onboarding, not restructuring. Not tenant-scoped itself: no company_id here.
export const companies = pgTable(
  "companies",
  {
    id,
    name: text("name").notNull(),
    // IANA zone. `work_date` is derived in it and never stored. No default: the seed and
    // onboarding supply it, and a default would hide a missing value. Validity is a zod check at
    // the boundary (Intl.supportedValuesOf("timeZone")), not a database check.
    timezone: text("timezone").notNull(),
    // Whether a clock-in is judged by the weekly schedule. Off until an admin turns it on in
    // Settings (company.update): the application role holds UPDATE on this column since
    // migration 0001. The phone is told and never believed about it (sync/schedule.ts).
    scheduleEnforced: boolean("schedule_enforced").notNull().default(false),
    // What prints on an invoice, typed by an admin in Settings. An invoice takes its own
    // copy at issue, so a change here never reaches one already issued.
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    // How to pay: a few lines, printed as typed.
    paymentInstructions: text("payment_instructions"),
    // Days from issue to due. Zero is due on receipt.
    invoiceTermsDays: integer("invoice_terms_days").notNull().default(0),
    // Whether a clock tap is stamped with the phone's location. A person's own setting
    // (users.location_stamps) wins where it is set.
    locationStamps: boolean("location_stamps").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (t) => [
    check("companies_name_not_blank", sql`btrim(${t.name}) <> ''`),
    check("companies_timezone_not_blank", sql`btrim(${t.timezone}) <> ''`),
    check(
      "companies_invoice_terms_days_range",
      sql`${t.invoiceTermsDays} BETWEEN 0 AND 365`,
    ),
  ],
);
