// assignment.list and assignment.mine (PRD, Jobs and location; ARCHITECTURE, Office authority:
// dated assignments, V1-D07; DESIGN, Assignment row).
//
// `list` is the office's: the company's plans over a range of days, each with whether the
// planned person could clock in on that job as things stand now. That answer is push
// authority's own — `mayStartOn` (sync/scope.ts), asked of the planned person from the rows
// this read joins — so the office is never told something the phone's push would contradict.
// `blockedBy` says which fact stands in the way, in the order push meets them: a deactivated
// person cannot push at all; an archived job takes no clock-in from anyone; otherwise it is
// the crew — the job has none, its crew is deactivated, or the person is not on it. The flag
// is read without locks and is true of the moment of the read: it follows the next membership
// change at the next read. It never blocks a write (write.ts).
//
// `mine` is the caller's own plans and takes no person in its input, so there is nothing to
// ask about anyone else. It carries what a worker needs to turn up — the day, the times, the
// job's name and address — and nothing the office decides by: no flag, no customer, no status,
// no coordinates. It widens no other read: the job's ledger, its crew and its other workers
// stay where they were.
//
// Both ranges are inclusive calendar days, as written (schema, job-assignments.ts), and
// bounded. Plain reads under RLS. Consumed by routers/assignment.ts; `ownAssignments` is also
// what the pull extension reads (TASKS, Stage 5).
import {
  crewMembers,
  crews,
  jobAssignments,
  jobs,
  jobStatus,
  users,
} from "@trader/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { mayStartOn } from "../sync/scope";
import { toWallTime, wallTime, workDay } from "./write";

// The longest range one read covers: any month.
export const MAX_RANGE_DAYS = 31;
// A bound, not a page: 31 days of a 30-person company on two jobs a day is under it.
export const LIST_LIMIT = 2000;

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

const range = { from: workDay, to: workDay };
const bounded = (v: { from: string; to: string }) => {
  const days = dayNumber(v.to) - dayNumber(v.from);
  return days >= 0 && days < MAX_RANGE_DAYS;
};
const RANGE = {
  message: `A range runs forward and covers at most ${MAX_RANGE_DAYS} days.`,
  path: ["to"],
};

export const listInput = z
  .strictObject({ ...range, userId: z.uuid().optional(), jobId: z.uuid().optional() })
  .refine(bounded, RANGE);

export const mineInput = z.strictObject(range).refine(bounded, RANGE);

const BLOCKED_BY = ["worker_inactive", "job_archived", "crew"] as const;

export const listOutput = z.array(
  z.strictObject({
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
  }),
);

export const mineOutput = z.array(
  z.strictObject({
    id: z.uuid(),
    workDate: z.iso.date(),
    expectedStart: wallTime,
    expectedEnd: wallTime,
    job: z.strictObject({
      id: z.uuid(),
      name: z.string(),
      address: z.string().nullable(),
    }),
  }),
);

export async function listAssignments(
  tx: Tx,
  input: z.infer<typeof listInput>,
): Promise<z.infer<typeof listOutput>> {
  // A filter naming a person or a job that is missing or another tenant's is the one answer
  // every office procedure gives, never an empty list that could be read as "nothing planned".
  if (input.userId !== undefined) {
    const [row] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId));
    if (row === undefined) throw forbidden();
  }
  if (input.jobId !== undefined) {
    const [row] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.id, input.jobId));
    if (row === undefined) throw forbidden();
  }

  const rows = await tx
    .select({
      id: jobAssignments.id,
      workDate: jobAssignments.workDate,
      expectedStart: jobAssignments.expectedStart,
      expectedEnd: jobAssignments.expectedEnd,
      workerId: users.id,
      workerName: users.name,
      workerRole: users.role,
      workerDeactivatedAt: users.deactivatedAt,
      jobId: jobs.id,
      jobName: jobs.name,
      jobStatus: jobs.status,
      crewId: crews.id,
      crewForemanUserId: crews.foremanUserId,
      crewDeactivatedAt: crews.deactivatedAt,
      memberUserId: crewMembers.userId,
    })
    .from(jobAssignments)
    .innerJoin(users, eq(users.id, jobAssignments.userId))
    .innerJoin(jobs, eq(jobs.id, jobAssignments.jobId))
    .leftJoin(crews, eq(crews.id, jobs.crewId))
    // The planned person's own membership of the job's crew: at most one row.
    .leftJoin(
      crewMembers,
      and(
        eq(crewMembers.crewId, jobs.crewId),
        eq(crewMembers.userId, jobAssignments.userId),
      ),
    )
    .where(
      and(
        gte(jobAssignments.workDate, input.from),
        lte(jobAssignments.workDate, input.to),
        input.userId === undefined ? undefined : eq(jobAssignments.userId, input.userId),
        input.jobId === undefined ? undefined : eq(jobAssignments.jobId, input.jobId),
      ),
    )
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
    // The scope push would lock for this person on this job (sync/scope.ts, lockPushScope):
    // the crew only when the job has one and it is active.
    const admitted =
      active &&
      mayStartOn(
        {
          role: r.workerRole,
          jobArchived,
          place: null,
          crew:
            r.crewId !== null &&
            r.crewForemanUserId !== null &&
            r.crewDeactivatedAt === null
              ? {
                  foremanUserId: r.crewForemanUserId,
                  members: new Set(r.memberUserId === null ? [] : [r.memberUserId]),
                }
              : null,
          workerActive: active,
          workerAdmin: r.workerRole === "admin",
        },
        { id: r.workerId },
      );
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
          : jobArchived
            ? ("job_archived" as const)
            : ("crew" as const),
    };
  });
}

export async function ownAssignments(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof mineInput>,
): Promise<z.infer<typeof mineOutput>> {
  const rows = await tx
    .select({
      id: jobAssignments.id,
      workDate: jobAssignments.workDate,
      expectedStart: jobAssignments.expectedStart,
      expectedEnd: jobAssignments.expectedEnd,
      jobId: jobs.id,
      jobName: jobs.name,
      jobAddress: jobs.address,
    })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobs.id, jobAssignments.jobId))
    .where(
      and(
        eq(jobAssignments.userId, user.id),
        gte(jobAssignments.workDate, input.from),
        lte(jobAssignments.workDate, input.to),
      ),
    )
    .orderBy(
      asc(jobAssignments.workDate),
      asc(jobAssignments.expectedStart),
      asc(jobAssignments.id),
    );
  return rows.map((r) => ({
    id: r.id,
    workDate: r.workDate,
    expectedStart: toWallTime(r.expectedStart),
    expectedEnd: toWallTime(r.expectedEnd),
    job: { id: r.jobId, name: r.jobName, address: r.jobAddress },
  }));
}
