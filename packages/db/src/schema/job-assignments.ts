import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { jobs } from "./jobs";
import { createdAt, id, updatedAt } from "./shared";
import { users } from "./users";
import { workSessionEvents } from "./work-session-events";

// A dated plan: this person is expected on this job, on this day, between these times.
// Nothing that counts labor reads this table — not the fold or invoices; the push reads it
// only where the company's schedule is enforced (api sync/schedule.ts). A row here widens no
// read but one: the planned person sees that job's name and
// address. Written by the office (api assignments/write.ts), read by `assignment.list` and
// `assignment.mine`.
//
// work_date is the calendar day in companies.timezone as the office wrote it: a business key,
// never derived from an instant. expected_start and expected_end are wall-clock times on that
// day in the same zone, with no zone of their own: the server never turns them into an
// instant, never compares them with now() and never computes a duration, so a daylight-saving
// change cannot move a plan — a time that does not exist, or happens twice, on such a day is
// kept and shown as written.
//
// Unlike a fact table a plan is edited and removed: updated_at, an UPDATE and a DELETE grant
// (the baseline migration), and no append-only guard — until a clock-in is admitted on it.
//
// A row is a shift. A person may have several in a day, on one job or several; only the
// exact duplicate is refused here, and two that overlap are refused by the writers (api
// assignments/eligibility.ts). locked_at and locked_by_event_id are the punch lock: set
// once, by the push that admits a `started` on the shift, to that event; from then the row's
// day, times and job never change and it is never removed (a trigger). copy_id marks the
// rows one Copy Last Week created, so the copy is undone whole.
export const jobAssignments = pgTable(
  "job_assignments",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    userId: uuid("user_id").notNull(),
    jobId: uuid("job_id").notNull(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    expectedStart: time("expected_start").notNull(),
    expectedEnd: time("expected_end").notNull(),
    copyId: uuid("copy_id"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedByEventId: uuid("locked_by_event_id"),
    createdAt,
    updatedAt,
  },
  (t) => [
    // Composite, so the person and the job belong to the row's company (invariant 5).
    foreignKey({
      name: "job_assignments_company_id_user_id_fk",
      columns: [t.companyId, t.userId],
      foreignColumns: [users.companyId, users.id],
    }),
    foreignKey({
      name: "job_assignments_company_id_job_id_fk",
      columns: [t.companyId, t.jobId],
      foreignColumns: [jobs.companyId, jobs.id],
    }),
    unique("job_assignments_company_id_id_unique").on(t.companyId, t.id),
    // The event that locked the shift belongs to the row's company (invariant 5).
    foreignKey({
      name: "job_assignments_company_id_locked_by_event_id_fk",
      columns: [t.companyId, t.lockedByEventId],
      foreignColumns: [workSessionEvents.companyId, workSessionEvents.id],
    }),
    // The same shift twice is refused; the same job twice in a day at other times is two
    // shifts. Leading with the person and the day, it is also the index of a person's day.
    unique("job_assignments_exact_shift_unique").on(
      t.userId,
      t.workDate,
      t.jobId,
      t.expectedStart,
      t.expectedEnd,
    ),
    // One Copy Last Week's rows, for its resend and its undo.
    index("job_assignments_company_id_copy_id_idx").on(t.companyId, t.copyId),
    check(
      "job_assignments_lock_complete",
      sql`(${t.lockedAt} IS NULL) = (${t.lockedByEventId} IS NULL)`,
    ),
    // The office read: a company's plans over a range of days.
    index("job_assignments_company_id_work_date_idx").on(t.companyId, t.workDate),
    // A plan lies within its day: an overnight shift is not one row.
    check("job_assignments_end_after_start", sql`${t.expectedEnd} > ${t.expectedStart}`),
  ],
);
