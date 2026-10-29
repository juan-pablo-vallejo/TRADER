import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { createdAt, id, updatedAt } from "./shared";
import { users } from "./users";

// The pay calendar: what a worker's hour is worth from a given day, and the periods the office
// closes (PRD, Labor; ARCHITECTURE decisions: effective-dated rates, immutable closed periods,
// no pay calculation in V1). Both are office rows. Dates here are work dates — calendar days
// in companies.timezone, the same days work_date is derived in — never instants.

// One row per rate change. A rate applies from effective_from until the next row for the same
// worker: no end date, so two rows can never overlap, and the unique below is the whole
// guarantee that one worker has one rate on one day. The rate in force on day D is the row
// with the greatest effective_from ≤ D; none means unpriced. Mutable through the ORM: no pay
// is computed in V1 (the export is hours), and a change to a rate a closed period relied on is
// a Stage 4 rule plus an audit_log entry, not a database guard.
export const payRates = pgTable(
  "pay_rates",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    userId: uuid("user_id").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    // Integer minor units with the currency beside them (invariant 3). integer: ±2³¹ cents is
    // $21.4 M per hour; a sum that could exceed it is line 5's decision, not a rate's.
    hourlyRateCents: integer("hourly_rate_cents").notNull(),
    // ISO 4217, upper case, stated by every insert (zod supplies USD at the boundary); no
    // default, so a row never implies a currency it was not given.
    currency: text("currency").notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("pay_rates_company_id_id_unique").on(t.companyId, t.id),
    unique("pay_rates_company_id_user_id_effective_from_unique").on(
      t.companyId,
      t.userId,
      t.effectiveFrom,
    ),
    // Composite, so a rate belongs to a worker of its company (invariant 4).
    foreignKey({
      name: "pay_rates_company_id_user_id_fk",
      columns: [t.companyId, t.userId],
      foreignColumns: [users.companyId, users.id],
    }),
    check("pay_rates_hourly_rate_cents_nonnegative", sql`${t.hourlyRateCents} >= 0`),
    check("pay_rates_currency_iso_4217", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

// An inclusive range of work dates the office approves, corrects and exports as one (PRD,
// Goal 2). "Closed" is closed_at IS NOT NULL, derived like deactivated_at (invariant 7).
// Migration 0004 adds what drizzle-kit cannot express: periods of one company never overlap
// (an exclusion constraint over daterange(starts_on, ends_on, '[]')), a closed row refuses
// UPDATE and DELETE, and a period closes only as it stands and only when no earlier period of
// the company is still open. Gaps are not a database rule: the first period has no
// predecessor, and contiguity is enforced where periods are created (Stage 4).
//
// An event is never refused or clamped for falling inside a closed period. Its period is
// derived (Stage 3): the earliest period of its company with ends_on ≥ work_date and
// (closed_at IS NULL or closed_at > server_timestamp). Because periods close in order, that
// answer never changes once the period is closed — a late entry has its work_date in the
// closed period and its membership in the next open one, which is the PRD's "adjustment".
export const payPeriods = pgTable(
  "pay_periods",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id"),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("pay_periods_company_id_id_unique").on(t.companyId, t.id),
    // Composite, so the closer is a user of the period's company (invariant 4).
    foreignKey({
      name: "pay_periods_company_id_closed_by_user_id_fk",
      columns: [t.companyId, t.closedByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    check("pay_periods_ends_on_after_starts_on", sql`${t.endsOn} >= ${t.startsOn}`),
    check(
      "pay_periods_closed_complete",
      sql`(${t.closedAt} IS NULL) = (${t.closedByUserId} IS NULL)`,
    ),
  ],
);
