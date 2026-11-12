import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  time,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { jobs } from "./jobs";
import { createdAt, id, updatedAt } from "./shared";
import { users } from "./users";

// A dated plan: this person is expected on this job, on this day, between these times
// (PRD, Jobs and location; ARCHITECTURE, Office authority: dated assignments, V1-D07). It is
// planning only. Nothing that judges or counts labor reads this table — not push authority,
// validation, the fold, approvals, closeouts, pay or invoices — and a row here creates no
// crew_members row and widens no read. Written by the office (api assignments/write.ts), read
// by `assignment.list` and `assignment.mine`.
//
// work_date is the calendar day in companies.timezone as the office wrote it: a business key,
// never derived from an instant. expected_start and expected_end are wall-clock times on that
// day in the same zone, with no zone of their own: the server never turns them into an
// instant, never compares them with now() and never computes a duration, so a daylight-saving
// change cannot move a plan — a time that does not exist, or happens twice, on such a day is
// kept and shown as written.
//
// Unlike a fact table a plan is edited and removed: updated_at, an UPDATE and a DELETE grant
// (migration 0031), and no append-only guard. Nothing references a row.
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
    createdAt,
    updatedAt,
  },
  (t) => [
    // Composite, so the person and the job belong to the row's company (invariant 4).
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
    // One plan per person, job and day; several jobs in a day are several rows. Leading with
    // the person and the day, it is also the index of a person's own read.
    unique("job_assignments_user_id_work_date_job_id_unique").on(
      t.userId,
      t.workDate,
      t.jobId,
    ),
    // The office read: a company's plans over a range of days.
    index("job_assignments_company_id_work_date_idx").on(t.companyId, t.workDate),
    // A plan lies within its day: an overnight shift is not one row.
    check("job_assignments_end_after_start", sql`${t.expectedEnd} > ${t.expectedStart}`),
  ],
);
