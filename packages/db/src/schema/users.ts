import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { cents, primaryId, timestamps } from "./_shared.js";
import { companies } from "./companies.js";
import { userRole } from "./enums.js";

/**
 * A person in the system. Authentication lives in Clerk; this table holds the
 * domain facts Clerk does not own — company, role, pay rate.
 *
 * Rows are created just-in-time on a user's first authenticated request (see
 * packages/api context), defaulting to `worker`. Clerk webhooks are the eventual
 * provisioning path but need a deployed endpoint plus signature verification.
 */
export const users = pgTable(
  "users",
  {
    id: primaryId,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    /** Clerk's subject claim. The join between auth and domain. */
    clerkUserId: text("clerk_user_id").notNull().unique(),
    role: userRole("role").notNull().default("worker"),
    name: text("name").notNull(),
    phone: text("phone"),
    /**
     * Admin-visible only (SPEC §5: a worker cannot see others' pay).
     *
     * Open risk, due by Phase 2 (SPEC §8): this is mutable, so editing it
     * retroactively changes historical job costs. Effective-dated rates or a
     * rate snapshot taken at session time must replace this before payroll
     * history is trusted.
     */
    payRateCents: cents("pay_rate_cents"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("users_company_idx").on(t.companyId)],
);
