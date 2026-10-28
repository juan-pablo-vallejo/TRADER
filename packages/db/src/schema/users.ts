import { sql } from "drizzle-orm";
import { check, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { userRole } from "./enums";
import { createdAt, deactivatedAt, id, updatedAt } from "./shared";

// A person with their own login. Authentication lives behind the identity adapter; this table
// holds the facts the provider does not own: company, role, roster state.
export const users = pgTable(
  "users",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    // What the identity adapter hands the API: the provider's subject, not a Clerk id. NULL
    // until the invited person first signs in. Globally unique, so one login is one company and
    // the tenant is resolved from this single lookup (invariant 6); a person at two contractors
    // is two logins, and relaxing this is a constraint drop and a decision.
    identitySubject: text("identity_subject"),
    // The invitation join key (PRD, Access: invitation-only) and what the roster shows. Unique
    // per company without regard to case; stored as given.
    email: text("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    role: userRole("role").notNull().default("worker"),
    deactivatedAt,
    createdAt,
    updatedAt,
  },
  (t) => [
    // Line 7's RLS and every composite foreign key that carries company_id rest on this pair.
    unique("users_company_id_id_unique").on(t.companyId, t.id),
    unique("users_identity_subject_unique").on(t.identitySubject),
    uniqueIndex("users_company_id_lower_email_idx").on(
      t.companyId,
      sql`lower(${t.email})`,
    ),
    check("users_name_not_blank", sql`btrim(${t.name}) <> ''`),
    check("users_email_not_blank", sql`btrim(${t.email}) <> ''`),
  ],
);
