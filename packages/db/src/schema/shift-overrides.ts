import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  time,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { jobAssignments } from "./job-assignments";
import { jobs } from "./jobs";
import { createdAt, id, updatedAt } from "./shared";
import { users } from "./users";

// An admin's decision about two shifts of one person that overlap on one day: the holder is
// the shift to clock in on through the time they share, the other yields it (ARCHITECTURE,
// 2026-11-15, shift rules; api assignments/eligibility.ts reads these as `Override`). Working
// state, not a fact: it is changed and removed, and it goes when either shift goes (ON DELETE
// CASCADE) — a locked shift is never removed, so its overrides stay. What happened to it is
// kept in shift_override_history, which outlives it.
//
// Whether an override is needed, sufficient, circular, or would change what authorized a
// clock-in already made is judged by the writers over the person's whole day; the database
// holds only what one row can prove: two different shifts of one company, one person and one
// day (migration 0041's trigger), one decision per pair, a reason.
export const shiftOverrides = pgTable(
  "shift_overrides",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    holderId: uuid("holder_id").notNull(),
    yieldingId: uuid("yielding_id").notNull(),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    foreignKey({
      name: "shift_overrides_company_id_holder_id_fk",
      columns: [t.companyId, t.holderId],
      foreignColumns: [jobAssignments.companyId, jobAssignments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "shift_overrides_company_id_yielding_id_fk",
      columns: [t.companyId, t.yieldingId],
      foreignColumns: [jobAssignments.companyId, jobAssignments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "shift_overrides_company_id_created_by_fk",
      columns: [t.companyId, t.createdBy],
      foreignColumns: [users.companyId, users.id],
    }),
    // One decision per pair, whichever way round it is written.
    uniqueIndex("shift_overrides_pair_unique").on(
      sql`least(${t.holderId}, ${t.yieldingId})`,
      sql`greatest(${t.holderId}, ${t.yieldingId})`,
    ),
    index("shift_overrides_company_id_yielding_id_idx").on(t.companyId, t.yieldingId),
    check("shift_overrides_two_shifts", sql`${t.holderId} <> ${t.yieldingId}`),
    check("shift_overrides_reason_not_blank", sql`btrim(${t.reason}) <> ''`),
  ],
);

// What became of every overlap override: its creation, each change and its removal, one row
// each, never edited or deleted (ARCHITECTURE, 2026-11-15, overlap overrides keep a history).
// A table of its own, not audit_log actions: each entry carries both shifts as they stood, as
// columns the office reads, and it is written for nothing else in the schedule. Append-only
// by migration 0041 (0002's guard); no updated_at.
//
// override_id and the two shift ids have no foreign key: the entry outlives them. The person,
// the actor and the jobs keep theirs — none of them is ever deleted once it has history.
export const shiftOverrideHistory = pgTable(
  "shift_override_history",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    overrideId: uuid("override_id").notNull(),
    action: text("action").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    reason: text("reason").notNull(),
    // The person both shifts are for, and their day.
    userId: uuid("user_id").notNull(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    holderShiftId: uuid("holder_shift_id").notNull(),
    holderJobId: uuid("holder_job_id").notNull(),
    holderStart: time("holder_start").notNull(),
    holderEnd: time("holder_end").notNull(),
    yieldingShiftId: uuid("yielding_shift_id").notNull(),
    yieldingJobId: uuid("yielding_job_id").notNull(),
    yieldingStart: time("yielding_start").notNull(),
    yieldingEnd: time("yielding_end").notNull(),
    createdAt,
  },
  (t) => [
    foreignKey({
      name: "shift_override_history_company_id_actor_user_id_fk",
      columns: [t.companyId, t.actorUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    foreignKey({
      name: "shift_override_history_company_id_user_id_fk",
      columns: [t.companyId, t.userId],
      foreignColumns: [users.companyId, users.id],
    }),
    foreignKey({
      name: "shift_override_history_company_id_holder_job_id_fk",
      columns: [t.companyId, t.holderJobId],
      foreignColumns: [jobs.companyId, jobs.id],
    }),
    foreignKey({
      name: "shift_override_history_company_id_yielding_job_id_fk",
      columns: [t.companyId, t.yieldingJobId],
      foreignColumns: [jobs.companyId, jobs.id],
    }),
    check(
      "shift_override_history_action",
      sql`${t.action} IN ('created', 'changed', 'removed')`,
    ),
    check("shift_override_history_reason_not_blank", sql`btrim(${t.reason}) <> ''`),
    // One person's day, and one override's story.
    index("shift_override_history_company_id_user_id_work_date_idx").on(
      t.companyId,
      t.userId,
      t.workDate,
    ),
    index("shift_override_history_company_id_override_id_idx").on(
      t.companyId,
      t.overrideId,
    ),
  ],
);
