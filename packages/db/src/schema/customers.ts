import { sql } from "drizzle-orm";
import { check, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { createdAt, deactivatedAt, id, updatedAt } from "./shared";

// The contractor's customers. Jobs belong to one (PRD, Jobs and location); invoices (line 5)
// reference one.
export const customers = pgTable(
  "customers",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    deactivatedAt,
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("customers_company_id_id_unique").on(t.companyId, t.id),
    check("customers_name_not_blank", sql`btrim(${t.name}) <> ''`),
  ],
);
