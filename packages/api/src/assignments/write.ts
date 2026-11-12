// assignment.create, update and remove (PRD, Jobs and location; ARCHITECTURE, Office
// authority: dated assignments, V1-D07). A dated assignment plans a person's day — a job, a
// calendar day and an expected start and end — and is planning only: these writers touch
// job_assignments and nothing else. They never read or write crew membership, so an admin may
// plan any active person of the company on any job of the company that is not archived,
// whatever their crews and whatever their role; whether that person could clock in there is
// the read's to report (list.ts), never a reason to refuse.
//
// The day and the times are kept as written (schema, job-assignments.ts): no instant, no
// duration, no comparison with today. A plan lies within its day, so the end is after the
// start.
//
// Lock order (ARCHITECTURE, Concurrency): `create` takes the job FOR SHARE, then the caller
// and the person FOR SHARE in id order — what a push takes, so it never waits on one, and an
// archival or a deactivation committed while it waited is seen. `update` and `remove` re-read
// the caller, then take the plan's own row, which is last in the order and taken by nothing
// else. No field-write lock and no worker lock: a plan is not labor.
//
// `create` is one statement over a set of days with ON CONFLICT DO NOTHING on the plan's
// natural key: a day already planned for that person and job is left exactly as it is and
// counted, so a retry after a lost response answers `unchanged` and writes nothing. Consumed
// by routers/assignment.ts.
import { jobAssignments, jobs } from "@trader/db/schema";
import { DrizzleQueryError, eq } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { lockUsersShare } from "../crews/lock";

// The days one `create` may plan: two working weeks.
export const MAX_DAYS = 14;

// A wall-clock time to the minute, 24-hour, as `<input type="time">` writes it.
export const wallTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// Both are HH:MM, so text order is time order.
const endsAfterStart = (v: { expectedStart: string; expectedEnd: string }) =>
  v.expectedEnd > v.expectedStart;
const END_AFTER_START = {
  message: "The end must be after the start.",
  path: ["expectedEnd"],
};

export const createInput = z
  .strictObject({
    userId: z.uuid(),
    jobId: z.uuid(),
    workDates: z
      .array(z.iso.date())
      .min(1)
      .max(MAX_DAYS)
      .refine((days) => new Set(days).size === days.length, {
        message: "A day is named once.",
      }),
    expectedStart: wallTime,
    expectedEnd: wallTime,
  })
  .refine(endsAfterStart, END_AFTER_START);

export const updateInput = z
  .strictObject({
    assignmentId: z.uuid(),
    workDate: z.iso.date(),
    expectedStart: wallTime,
    expectedEnd: wallTime,
  })
  .refine(endsAfterStart, END_AFTER_START);

export const removeInput = z.strictObject({ assignmentId: z.uuid() });

export type CreateInput = z.infer<typeof createInput>;
export type UpdateInput = z.infer<typeof updateInput>;
export type RemoveInput = z.infer<typeof removeInput>;

export const createOutput = z.discriminatedUnion("result", [
  // `created` days were planned now; `existing` were already planned and are untouched.
  z.strictObject({
    result: z.literal("created"),
    created: z.number().int().positive(),
    existing: z.number().int().nonnegative(),
  }),
  // Every day was already planned for this person on this job. Nothing is written.
  z.strictObject({ result: z.literal("unchanged") }),
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["user_inactive", "job_archived"]),
  }),
]);

export const updateOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated") }),
  z.strictObject({ result: z.literal("unchanged") }),
  // The person is already planned on this job on the day asked for.
  z.strictObject({ result: z.literal("rejected"), code: z.literal("already_planned") }),
]);

export const removeOutput = z.strictObject({ result: z.enum(["removed", "unchanged"]) });

const NATURAL_KEY = "job_assignments_user_id_work_date_job_id_unique";

// Postgres writes a `time` back with seconds.
export const toWallTime = (stored: string) => stored.slice(0, 5);

export async function createAssignments(
  tx: Tx,
  user: AppUser,
  input: CreateInput,
): Promise<z.infer<typeof createOutput>> {
  const [job] = await tx
    .select({ id: jobs.id, status: jobs.status })
    .from(jobs)
    .where(eq(jobs.id, input.jobId))
    .for("share");
  // A missing id and another tenant's (invisible under RLS) are one answer.
  if (job === undefined) throw forbidden();
  const person = (await lockUsersShare(tx, user, [input.userId])).get(input.userId)!;
  if (person.deactivatedAt !== null) return { result: "rejected", code: "user_inactive" };
  if (job.status === "archived") return { result: "rejected", code: "job_archived" };

  const created = await tx
    .insert(jobAssignments)
    .values(
      input.workDates.map((workDate) => ({
        companyId: user.companyId,
        userId: person.id,
        jobId: job.id,
        workDate,
        expectedStart: input.expectedStart,
        expectedEnd: input.expectedEnd,
      })),
    )
    // The natural key is named: any other violation is a defect and must be raised.
    .onConflictDoNothing({
      target: [jobAssignments.userId, jobAssignments.workDate, jobAssignments.jobId],
    })
    .returning({ id: jobAssignments.id });
  if (created.length === 0) return { result: "unchanged" };
  return {
    result: "created",
    created: created.length,
    existing: input.workDates.length - created.length,
  };
}

// The day and the times only: the person and the job of a plan never change, so moving a plan
// to another job is a removal and a new plan. Allowed whatever has become of the job or the
// person since: it grants nothing, and the read shows what stands in the way.
export async function updateAssignment(
  tx: Tx,
  user: AppUser,
  input: UpdateInput,
): Promise<z.infer<typeof updateOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const [row] = await tx
    .select({
      id: jobAssignments.id,
      workDate: jobAssignments.workDate,
      expectedStart: jobAssignments.expectedStart,
      expectedEnd: jobAssignments.expectedEnd,
    })
    .from(jobAssignments)
    .where(eq(jobAssignments.id, input.assignmentId))
    .for("no key update");
  // Missing, removed meanwhile, or another tenant's: one answer.
  if (row === undefined) throw forbidden();
  if (
    row.workDate === input.workDate &&
    toWallTime(row.expectedStart) === input.expectedStart &&
    toWallTime(row.expectedEnd) === input.expectedEnd
  ) {
    return { result: "unchanged" };
  }
  try {
    // A savepoint: a plan already on that day for the same person and job is an answer, and
    // must not abort the caller's transaction.
    await tx.transaction((sp) =>
      sp
        .update(jobAssignments)
        .set({
          workDate: input.workDate,
          expectedStart: input.expectedStart,
          expectedEnd: input.expectedEnd,
        })
        .where(eq(jobAssignments.id, row.id)),
    );
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : undefined;
    const pg = cause as { code?: string; constraint?: string } | undefined;
    if (pg?.code === "23505" && pg.constraint === NATURAL_KEY) {
      return { result: "rejected", code: "already_planned" };
    }
    throw error;
  }
  return { result: "updated" };
}

// A plan that is not there — never made, already removed, or another tenant's and so
// invisible — is `unchanged`: a retry is harmless and the answer says nothing of other
// companies.
export async function removeAssignment(
  tx: Tx,
  user: AppUser,
  input: RemoveInput,
): Promise<z.infer<typeof removeOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const removed = await tx
    .delete(jobAssignments)
    .where(eq(jobAssignments.id, input.assignmentId))
    .returning({ id: jobAssignments.id });
  return { result: removed.length === 0 ? "unchanged" : "removed" };
}
