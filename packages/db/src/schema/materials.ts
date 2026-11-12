import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
// (invariant 2); a receipt the office enters arrives under a UUIDv7 the browser minted and
// keeps across retries. Logging never waits on cost: cost is nullable and the office fills
// it in later through the ORM, which is why this row keeps updated_at. The receipt photo
// points here from photos.
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
    // The approval rule's facts of a receipt (PRD, Office approval), fixed at push like the
    // ledger's: the device's capture-time connectivity evidence, and the push's skew verdict
    // with its signed measurement (work_session_events, which see). No default: every writer
    // supplies them. Added NOT NULL while every environment held no receipt.
    capturedOffline: boolean("captured_offline").notNull(),
    clockSkewed: boolean("clock_skewed").notNull(),
    clockSkewMs: bigint("clock_skew_ms", { mode: "number" }).notNull(),
    // Provenance, stored and never inferred from the logger's role (ARCHITECTURE, Office
    // material entries): true for a receipt an admin entered in the office, whose
    // logged_by_user_id is that admin; false for one a device pushed, an admin's own phone
    // included. No default: every writer states it. Rows older than 0033 are device rows.
    enteredByOffice: boolean("entered_by_office").notNull(),
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
    // Job cost to date (job.cost) and the closeout review; the per-user pull snapshot.
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
    // The office has no device evidence to claim: an office entry is neither offline nor
    // skewed, so the only approval reason it can carry is after_closeout.
    check(
      "materials_office_entry_facts",
      sql`NOT ${t.enteredByOffice} OR (NOT ${t.capturedOffline} AND NOT ${t.clockSkewed} AND ${t.clockSkewMs} = 0)`,
    ),
  ],
);
