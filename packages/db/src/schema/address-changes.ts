// Each time the office changed the address a person signs in with: which one, from what
// to what, by whom and when. Append-only, so who could sign in as a person at any moment
// can be read back. A change of the email and a change of the number are two rows. An
// address added has no `old_value`, one removed has no `new_value`; a row always says
// something changed. Written by people.setEmail and people.setSignInPhone and by nothing
// else (packages/api, people/address.ts). Guards and tenancy are hand-written in the
// migration (drizzle-kit never sees them).
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { createdAt, id } from "./shared";
import { users } from "./users";

export const addressChanges = pgTable(
  "address_changes",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    userId: uuid("user_id").notNull(),
    // Which address: the email, or the number they sign in with.
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedByUserId: uuid("changed_by_user_id").notNull(),
    createdAt,
  },
  (t) => [
    unique("address_changes_company_id_id_unique").on(t.companyId, t.id),
    foreignKey({
      name: "address_changes_company_id_user_id_fk",
      columns: [t.companyId, t.userId],
      foreignColumns: [users.companyId, users.id],
    }),
    foreignKey({
      name: "address_changes_company_id_changed_by_user_id_fk",
      columns: [t.companyId, t.changedByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    index("address_changes_user_id_idx").on(t.userId),
    check("address_changes_field", sql`${t.field} IN ('email', 'sign_in_phone')`),
    check("address_changes_changed", sql`${t.oldValue} IS DISTINCT FROM ${t.newValue}`),
    // Nobody changes their own: an admin's addresses are not the office's to change.
    check("address_changes_not_own", sql`${t.userId} <> ${t.changedByUserId}`),
  ],
);
