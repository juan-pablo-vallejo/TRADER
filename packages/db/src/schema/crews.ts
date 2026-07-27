import { index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared.js";
import { companies } from "./companies.js";
import { users } from "./users.js";

/**
 * A crew groups workers under a foreman (SPEC §4). Kept relational precisely so
 * a worker's crew can change without rewriting history — membership is a row
 * with its own lifetime, not a column on the worker.
 */
export const crews = pgTable(
  "crews",
  {
    id: primaryId,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    foremanId: uuid("foreman_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("crews_company_idx").on(t.companyId)],
);

/**
 * Crew membership.
 *
 * `company_id` is carried here even though it is derivable through `crew_id`.
 * It is the stated RLS seam (SPEC §4): when policies arrive, every tenant-scoped
 * table needs the column locally or each policy has to join to find it. Free now,
 * awkward to add later.
 */
export const crewMembers = pgTable(
  "crew_members",
  {
    id: primaryId,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    crewId: uuid("crew_id")
      .notNull()
      .references(() => crews.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [
    unique("crew_members_crew_user_unq").on(t.crewId, t.userId),
    index("crew_members_user_idx").on(t.userId),
  ],
);
