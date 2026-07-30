import {
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { companies } from "./companies";
import { crews } from "./crews";
import { customers } from "./customers";
import { jobStatus } from "./enums";

/**
 * A unit of work at a location. Archived, never deleted (SPEC §4) — job costing
 * and payroll history both reference jobs indefinitely.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: primaryId,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    customerId: uuid("customer_id").references(() => customers.id),
    /**
     * Assignment. SPEC §5 and §6 promise a worker "sees today's assigned jobs"
     * and a foreman closes out "their crew's jobs", but §4's table list linked
     * jobs to nobody. Assigning at the crew level (rather than per worker) makes
     * both of those a direct query and reuses crew_members, which exists for
     * exactly this grouping.
     *
     * Nullable: a job can be created before it is staffed.
     */
    crewId: uuid("crew_id").references(() => crews.id),
    address: text("address"),
    /**
     * Coordinates are floats by design — this is physical position, not money,
     * and no arithmetic depends on exactness. Geocoding provider (Mapbox vs
     * Google) is still open in DECISIONS.md, due Phase 2.
     */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    status: jobStatus("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("jobs_company_idx").on(t.companyId),
    index("jobs_crew_idx").on(t.crewId),
    index("jobs_status_idx").on(t.companyId, t.status),
  ],
);
