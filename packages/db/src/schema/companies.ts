import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text } from "drizzle-orm/pg-core";

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
    // Whether a clock-in is judged by the weekly schedule. Off unless the database's owner
    // turns it on: the application role may read it and has no UPDATE on this column (the
    // baseline migration's grants), so no request, and no client, can change who may clock in.
    scheduleEnforced: boolean("schedule_enforced").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [
    check("companies_name_not_blank", sql`btrim(${t.name}) <> ''`),
    check("companies_timezone_not_blank", sql`btrim(${t.timezone}) <> ''`),
  ],
);
