import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { crews } from "./crews";
import { customers } from "./customers";
import { jobStatus } from "./enums";
import { createdAt, id, updatedAt } from "./shared";

// A unit of work at a location. Jobs belong to a customer and are assigned to a crew (PRD, Jobs
// and location). Never deleted: labor, materials and invoices reference them indefinitely.
export const jobs = pgTable(
  "jobs",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    customerId: uuid("customer_id").notNull(),
    // Assigned at the crew level so a worker's jobs and a foreman's closeout are one query over
    // crew_members. Nullable: a job can exist before it is staffed.
    crewId: uuid("crew_id"),
    name: text("name").notNull(),
    address: text("address"),
    // Where the work is, for the approval rule's "outside the job's radius" (PRD, Office
    // approval). Floats: physical position, no arithmetic depends on exactness. All three set or
    // all three null; a job without a location can only flag a missing stamp.
    locationLat: doublePrecision("location_lat"),
    locationLng: doublePrecision("location_lng"),
    locationRadiusM: integer("location_radius_m"),
    status: jobStatus("status").notNull().default("open"),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("jobs_company_id_id_unique").on(t.companyId, t.id),
    // Composite, so a job's customer and crew belong to its company (invariant 4). A NULL
    // crew_id leaves that reference unchecked (MATCH SIMPLE).
    foreignKey({
      name: "jobs_company_id_customer_id_fk",
      columns: [t.companyId, t.customerId],
      foreignColumns: [customers.companyId, customers.id],
    }),
    foreignKey({
      name: "jobs_company_id_crew_id_fk",
      columns: [t.companyId, t.crewId],
      foreignColumns: [crews.companyId, crews.id],
    }),
    // Office job lists (Stage 4); a customer's jobs; a crew's jobs (Stage 5 snapshot).
    index("jobs_company_id_status_idx").on(t.companyId, t.status),
    index("jobs_customer_id_idx").on(t.customerId),
    index("jobs_crew_id_idx").on(t.crewId),
    check("jobs_name_not_blank", sql`btrim(${t.name}) <> ''`),
    check(
      "jobs_location_complete",
      sql`(${t.locationLat} IS NULL) = (${t.locationLng} IS NULL) AND (${t.locationLat} IS NULL) = (${t.locationRadiusM} IS NULL)`,
    ),
    check("jobs_location_lat_range", sql`${t.locationLat} BETWEEN -90 AND 90`),
    check("jobs_location_lng_range", sql`${t.locationLng} BETWEEN -180 AND 180`),
    check("jobs_location_radius_m_positive", sql`${t.locationRadiusM} > 0`),
  ],
);
