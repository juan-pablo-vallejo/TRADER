// assignment.week: the office's week, Monday to Sunday. Each shift says whether the planned
// person could clock in on that job as things stand now, and which fact stands in the way,
// in the order push meets them: a deactivated person cannot push at all; an archived job
// takes no clock-in from anyone. The flag is read without locks and is true of the moment of
// the read. It never blocks a write (write.ts). Plain reads under RLS.
import { companies, jobAssignments, jobs, jobStatus, users } from "@trader/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { toWallTime, wallTime, workDay } from "./write";

// A bound, not a page: a week of a 30-person company on two jobs a day is far under it.
export const LIST_LIMIT = 2000;

const BLOCKED_BY = ["worker_inactive", "job_archived"] as const;

const planned = z.strictObject({
  id: z.uuid(),
  workDate: z.iso.date(),
  expectedStart: wallTime,
  expectedEnd: wallTime,
  worker: z.strictObject({ id: z.uuid(), name: z.string(), active: z.boolean() }),
  job: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    status: z.enum(jobStatus.enumValues),
  }),
  // Whether a clock-in by this person on this job would be admitted now.
  mayClockIn: z.boolean(),
  // What stands in the way when it would not; null when it would.
  blockedBy: z.enum(BLOCKED_BY).nullable(),
});

// Every shift of the days from `from` to `to`, inclusive, as the week shows them.
async function plannedShifts(
  tx: Tx,
  from: string,
  to: string,
): Promise<z.infer<typeof planned>[]> {
  const rows = await tx
    .select({
      id: jobAssignments.id,
      workDate: jobAssignments.workDate,
      expectedStart: jobAssignments.expectedStart,
      expectedEnd: jobAssignments.expectedEnd,
      workerId: users.id,
      workerName: users.name,
      workerDeactivatedAt: users.deactivatedAt,
      jobId: jobs.id,
      jobName: jobs.name,
      jobStatus: jobs.status,
    })
    .from(jobAssignments)
    .innerJoin(users, eq(users.id, jobAssignments.userId))
    .innerJoin(jobs, eq(jobs.id, jobAssignments.jobId))
    .where(and(gte(jobAssignments.workDate, from), lte(jobAssignments.workDate, to)))
    .orderBy(
      asc(jobAssignments.workDate),
      asc(jobAssignments.expectedStart),
      asc(users.name),
      asc(jobAssignments.id),
    )
    .limit(LIST_LIMIT);

  return rows.map((r) => {
    const active = r.workerDeactivatedAt === null;
    const jobArchived = r.jobStatus === "archived";
    const admitted = active && !jobArchived;
    return {
      id: r.id,
      workDate: r.workDate,
      expectedStart: toWallTime(r.expectedStart),
      expectedEnd: toWallTime(r.expectedEnd),
      worker: { id: r.workerId, name: r.workerName, active },
      job: { id: r.jobId, name: r.jobName, status: r.jobStatus },
      mayClockIn: admitted,
      blockedBy: admitted
        ? null
        : !active
          ? ("worker_inactive" as const)
          : ("job_archived" as const),
    };
  });
}

// A week, with whether a clock-in has locked each shift.
const isMonday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 1;

export const weekInput = z.strictObject({
  weekStart: workDay.refine(isMonday, { message: "A week starts on a Monday." }),
});

const shiftRow = planned.extend({
  locked: z.boolean(),
  // The Copy Last Week that made it, for that copy's undo; null for a shift made by hand.
  copyId: z.uuid().nullable(),
});

export const weekOutput = z.strictObject({
  weekStart: z.iso.date(),
  // The company's zone: the days and hours are its wall clock's, and stamps are read in it.
  timezone: z.string(),
  // The seven days, Monday first.
  days: z.array(z.iso.date()).length(7),
  shifts: z.array(shiftRow),
});

const dayAfter = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function weekAssignments(
  tx: Tx,
  input: z.infer<typeof weekInput>,
): Promise<z.infer<typeof weekOutput>> {
  const days = Array.from({ length: 7 }, (_, n) => dayAfter(input.weekStart, n));
  const from = days[0]!;
  const to = days[6]!;
  const rows = await plannedShifts(tx, from, to);
  const marks = await tx
    .select({
      id: jobAssignments.id,
      lockedAt: jobAssignments.lockedAt,
      copyId: jobAssignments.copyId,
    })
    .from(jobAssignments)
    .where(and(gte(jobAssignments.workDate, from), lte(jobAssignments.workDate, to)));
  const markOf = new Map(marks.map((m) => [m.id, m]));
  const [company] = await tx.select({ timezone: companies.timezone }).from(companies);
  if (company === undefined) throw new Error("the caller's company is not visible");
  return {
    weekStart: input.weekStart,
    timezone: company.timezone,
    days,
    shifts: rows.map((r) => ({
      ...r,
      locked: markOf.get(r.id)?.lockedAt != null,
      copyId: markOf.get(r.id)?.copyId ?? null,
    })),
  };
}
