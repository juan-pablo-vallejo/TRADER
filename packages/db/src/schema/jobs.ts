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
import { customers } from "./customers";
import { jobStatus } from "./enums";
import { createdAt, id, updatedAt } from "./shared";

// A unit of work at a location. Jobs belong to a customer. Never deleted: labor and invoices
// reference them indefinitely.
export const jobs = pgTable(
  "jobs",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    customerId: uuid("customer_id").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    // Where the work is, for the `location` flag's "outside the job's radius". Floats: physical position, no arithmetic depends on exactness. All three set or
    // all three null; a job without a location can only flag a missing stamp.
    locationLat: doublePrecision("location_lat"),
    locationLng: doublePrecision("location_lng"),
    locationRadiusM: integer("location_radius_m"),
    // The office's notes for the crew: the phone shows them on the job, from the last pull.
    notes: text("notes"),
    status: jobStatus("status").notNull().default("open"),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("jobs_company_id_id_unique").on(t.companyId, t.id),
    // The target of invoices' (company_id, customer_id, job_id) foreign key: an invoice is to
    // the job's customer, and the customer is immutable once an invoice exists.
    unique("jobs_company_id_customer_id_id_unique").on(t.companyId, t.customerId, t.id),
    // Composite, so a job's customer belongs to its company.
    foreignKey({
      name: "jobs_company_id_customer_id_fk",
      columns: [t.companyId, t.customerId],
      foreignColumns: [customers.companyId, customers.id],
    }),
    // Office job lists; a customer's jobs.
    index("jobs_company_id_status_idx").on(t.companyId, t.status),
    index("jobs_customer_id_idx").on(t.customerId),
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
