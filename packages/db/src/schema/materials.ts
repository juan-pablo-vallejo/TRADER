import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { jobs } from "./jobs";
import { createdAt, updatedAt } from "./shared";
import { users } from "./users";

// A receipt: material logged against a job by the person who bought it (PRD, Materials and
// photos). The phone creates the row, so the id is the device's UUIDv7 with no default
// (invariant 2); the office logs one through the API, which supplies uuidv7() itself. Logging
// never waits on cost: cost is nullable and the office fills it in later through the ORM,
// which is why this row keeps updated_at. The receipt photo points here from photos.
export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    jobId: uuid("job_id").notNull(),
    loggedByUserId: uuid("logged_by_user_id").notNull(),
    description: text("description").notNull(),
    // Exact decimal, not float: 2.5 gallons is 2.5, and nothing downstream multiplies it into
    // money (the cost below is the receipt total). Three places cover any unit a crew buys in.
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    // Free text (gal, qt, ea, roll): a picker is a Stage 5 concern, the database knows only
    // that it is present — the PRD makes only the cost optional.
    unit: text("unit").notNull(),
    // The receipt total, not a unit price: what the office reads off the receipt, with no
    // multiplication or rounding between it and job cost. Integer minor units with the
    // currency beside them (invariant 3), both NULL until the office fills them in together.
    costCents: integer("cost_cents"),
    currency: text("currency"),
    // Device time, recorded as reported (PRD, Labor: device time is business time).
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("materials_company_id_id_unique").on(t.companyId, t.id),
    // The target of photos' (company_id, job_id, material_id) foreign key, which keeps a
    // receipt photo on its material's job.
    unique("materials_company_id_job_id_id_unique").on(t.companyId, t.jobId, t.id),
    // Composite, so the job and the buyer belong to the row's company (invariant 4).
    foreignKey({
      name: "materials_company_id_job_id_fk",
      columns: [t.companyId, t.jobId],
      foreignColumns: [jobs.companyId, jobs.id],
    }),
    foreignKey({
      name: "materials_company_id_logged_by_user_id_fk",
      columns: [t.companyId, t.loggedByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    // Job cost to date (Stage 4) and the closeout review (Stage 5); the per-user pull snapshot
    // (Stage 3).
    index("materials_job_id_logged_at_idx").on(t.jobId, t.loggedAt),
    index("materials_logged_by_user_id_logged_at_idx").on(t.loggedByUserId, t.loggedAt),
    check("materials_id_v7", sql`uuid_extract_version(${t.id}) = 7`),
    check("materials_description_not_blank", sql`btrim(${t.description}) <> ''`),
    check("materials_quantity_positive", sql`${t.quantity} > 0`),
    check("materials_unit_not_blank", sql`btrim(${t.unit}) <> ''`),
    check("materials_cost_cents_nonnegative", sql`${t.costCents} >= 0`),
    check(
      "materials_cost_complete",
      sql`(${t.costCents} IS NULL) = (${t.currency} IS NULL)`,
    ),
    check("materials_currency_iso_4217", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);
