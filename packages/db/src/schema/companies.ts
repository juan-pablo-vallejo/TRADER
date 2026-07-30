import { text } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";

/**
 * One seeded row in v1 (SPEC §4). Exists now so every tenant-scoped table can
 * carry `company_id NOT NULL` — the seam multi-tenancy attaches to later,
 * without a backfill. RLS is deferred until a second tenant onboards.
 */
export const companies = pgTable("companies", {
  id: primaryId,
  name: text("name").notNull(),
  /**
   * IANA zone, e.g. "America/New_York". Drives `work_date` derivation: SPEC §3
   * computes it server-side from the clock-in timestamp in this zone, and it is
   * never user-editable. Deliberately not stored as a column anywhere.
   */
  timezone: text("timezone").notNull().default("America/New_York"),
  ...timestamps,
});
