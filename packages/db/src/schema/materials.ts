import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { cents, primaryId, timestamps } from "./_shared.js";
import { companies } from "./companies.js";
import { jobs } from "./jobs.js";
import { users } from "./users.js";

/**
 * Materials consumed on a job (SPEC §4, §6).
 *
 * Field capture is never blocked on cost or connectivity: the record syncs
 * first, `unitCostCents` may be filled by an admin later, and the receipt photo
 * uploads to S3 when bandwidth allows.
 */
export const materials = pgTable(
  "materials",
  {
    id: primaryId,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    loggedByUserId: uuid("logged_by_user_id")
      .notNull()
      .references(() => users.id),
    description: text("description").notNull(),
    /**
     * Exact decimal, not float: quantities are multiplied by unit cost to reach
     * money, so binary rounding error would leak into job costs. `numeric` is
     * the right tool here even though money itself is integer cents.
     */
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: text("unit"),
    /** Nullable — the field never waits on the office to know a price. */
    unitCostCents: cents("unit_cost_cents"),
    /** S3 key for the receipt photo; Phase 2 wires the upload. */
    photoS3Key: text("photo_s3_key"),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    index("materials_job_idx").on(t.jobId),
    index("materials_company_idx").on(t.companyId),
  ],
);
