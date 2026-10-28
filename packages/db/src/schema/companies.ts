import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";

import { createdAt, id, updatedAt } from "./shared";

// The tenant. One row in V1; every other table carries company_id so a second contractor is
// onboarding, not restructuring (PRD, After V1). Not tenant-scoped itself: no company_id here.
export const companies = pgTable(
  "companies",
  {
    id,
    name: text("name").notNull(),
    // IANA zone. `work_date` is derived in it (RULES) and never stored. No default: the seed and
    // the roster supply it, and a default would hide a missing value. Validity is a zod check at
    // the boundary (Intl.supportedValuesOf("timeZone")), not a database check.
    timezone: text("timezone").notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    check("companies_name_not_blank", sql`btrim(${t.name}) <> ''`),
    check("companies_timezone_not_blank", sql`btrim(${t.timezone}) <> ''`),
  ],
);
