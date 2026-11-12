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
import { jobs } from "./jobs";
import { createdAt, id, updatedAt } from "./shared";
import { users } from "./users";

// The pay calendar: what a worker's hour is worth from a given day, and the periods the office
// closes (PRD, Labor; ARCHITECTURE decisions: effective-dated rates, immutable closed periods,
// no pay calculation in V1). Both are office rows. Dates here are work dates — calendar days
// in companies.timezone, the same days work_date is derived in — never instants.

// One row per rate change. A rate applies from effective_from until the next row for the same
// worker: no end date, so two rows can never overlap, and the unique below is the whole
// guarantee that one worker has one rate on one day. The rate in force on day D is the row
// with the greatest effective_from ≤ D; none means unpriced. Insert-only for the application
// role (0027; ARCHITECTURE, roster API). No pay is computed in V1: a closed period stores
// hours and reads no rate, so a rate dated inside one is accepted and changes nothing a close
// stored — only job cost to date (ARCHITECTURE, 2026-11-12 pay periods).
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
// the company is still open. Migration 0036 adds the rest: a period is inserted open, never
// lies earlier than a closed one, and closes only with its unresolved counts stated. Gaps are
// not a database rule: the first period has no predecessor, and contiguity is enforced where
// periods are created (the API's payPeriod.open).
//
// An event is never refused or clamped for falling inside a closed period. What a close
// counted as the period's hours is what it stored in pay_period_lines below; anything
// approved, corrected or repaired afterwards is the difference the next close finds and
// stores as an adjustment (ARCHITECTURE, Late adjustments). No instant is compared with
// closed_at to decide membership.
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
    // What the closer acknowledged (V1-D03): the sessions on the period's dates that still
    // waited for approval, and those that counted but had no clock-out, as the server counted
    // them under the close's lock. NULL while open; 0036 requires both on the closing update.
    unresolvedPendingSessions: integer("unresolved_pending_sessions"),
    unresolvedOpenSessions: integer("unresolved_open_sessions"),
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
    // One-directional, so a row closed before these columns existed stays legal; the closing
    // update's own requirement is 0036's trigger.
    check(
      "pay_periods_unresolved_only_when_closed",
      sql`${t.closedAt} IS NOT NULL OR (${t.unresolvedPendingSessions} IS NULL AND ${t.unresolvedOpenSessions} IS NULL)`,
    ),
    check(
      "pay_periods_unresolved_nonnegative",
      sql`${t.unresolvedPendingSessions} >= 0 AND ${t.unresolvedOpenSessions} >= 0`,
    ),
  ],
);

// What a close exported, and so the basis every later close subtracts (ARCHITECTURE, Late
// adjustments; V1-D03): one row per worker, job and work date, in hundredths of an hour — the
// rounded daily figure of the one derivation (V1-D13), never milliseconds and never money. A
// row whose work_date lies inside its period is that period's own hours; one whose work_date
// is before the period's starts_on is an adjustment, signed: the difference between the
// approved figure at this close and the sum of every earlier row for the same worker, job and
// date. No column says which: the dates do. Append-only, and written only in the transaction
// that closes the period (0035, 0036). Consumed by the API's payPeriod.close and read.
export const payPeriodLines = pgTable(
  "pay_period_lines",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    periodId: uuid("period_id").notNull(),
    workerId: uuid("worker_id").notNull(),
    jobId: uuid("job_id").notNull(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    // Signed. Positive for a period's own hours (0036); never zero.
    hundredths: integer("hundredths").notNull(),
    createdAt,
  },
  (t) => [
    unique("pay_period_lines_company_id_id_unique").on(t.companyId, t.id),
    // One line per worker, job and date in a period: an adjustment is one signed figure.
    unique("pay_period_lines_period_id_worker_id_job_id_work_date_unique").on(
      t.periodId,
      t.workerId,
      t.jobId,
      t.workDate,
    ),
    // Composite, so the period, the worker and the job belong to the row's company
    // (invariant 4).
    foreignKey({
      name: "pay_period_lines_company_id_period_id_fk",
      columns: [t.companyId, t.periodId],
      foreignColumns: [payPeriods.companyId, payPeriods.id],
    }),
    foreignKey({
      name: "pay_period_lines_company_id_worker_id_fk",
      columns: [t.companyId, t.workerId],
      foreignColumns: [users.companyId, users.id],
    }),
    foreignKey({
      name: "pay_period_lines_company_id_job_id_fk",
      columns: [t.companyId, t.jobId],
      foreignColumns: [jobs.companyId, jobs.id],
    }),
    check("pay_period_lines_hundredths_nonzero", sql`${t.hundredths} <> 0`),
  ],
);
