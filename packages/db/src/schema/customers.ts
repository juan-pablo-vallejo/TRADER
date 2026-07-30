import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { companies } from "./companies";

/**
 * The contractor's customers. SPEC §4 notes the future client-portal login
 * attaches here, which is why this is a first-class table in v1 rather than a
 * name field on a job.
 */
export const customers = pgTable(
  "customers",
  {
    id: primaryId,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("customers_company_idx").on(t.companyId)],
);
