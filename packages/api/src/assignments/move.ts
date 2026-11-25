// assignment.endEarly and assignment.moveToday: what an admin does when someone has to be
// somewhere else mid-day. Under schedule enforcement a second shift cannot be planned while
// the first still covers the same hours, and a shift someone clocked in on was locked whole.
// Its end may now move earlier (migration 0002), and these two procedures are the only
// writers that do it.
//
// `endEarly`: one shift and its new end. Earlier than the end it has, after its start, and,
// for a shift a clock-in has locked, after that clock-in's minute. Nothing else about the
// shift changes.
//
// `moveToday`: a person, a job and a minute of the company's today. The shift that covers
// the minute ends at it, and a new one on the other job runs from it to the old end: both or
// neither. With no shift covering the minute there is nothing to end and no end to inherit,
// so the caller names one (`expectedEnd`) and the person simply gets the new shift. A shift
// that would end the minute it starts is removed instead, unless a clock-in has locked it.
//
// Neither writes a clock event, and neither reads one beyond what every schedule write
// already reads: the minute of the clock-in that locked a shift (day.ts). Hours are the
// ledger's and are untouched: someone still on the clock stays on the clock on the first
// job until they switch on their phone, which the second shift now admits.
//
// Every write is judged over the person's whole day first (day.ts, judgeDay), under the
// same locks in the same order as write.ts. Consumed by routers/assignment.ts.
import { companies, jobAssignments, jobs } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { lockUsersShare } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { workDate } from "../labor/work-date";
import {
  type DayShift,
  judgeDay,
  loadDay,
  lockPersonDays,
  refusalSchema,
  refused,
} from "./day";
import { lockShift, toWallTime, wallTime } from "./write";

export const endEarlyInput = z.strictObject({
  assignmentId: z.uuid(),
  expectedEnd: wallTime,
});

export type EndEarlyInput = z.infer<typeof endEarlyInput>;

export const endEarlyOutput = z.union([
  z.strictObject({ result: z.enum(["updated", "unchanged"]) }),
  z.strictObject({
    result: z.literal("rejected"),
    // `not_earlier`: the end asked for is later than the one the shift has. `stale`: the
    // shift moved to another day while this call waited; read it again.
    code: z.enum(["not_earlier", "stale"]),
  }),
  // `schedule` with `invalid_interval`: the end is not after the start. `authorization`:
  // it is not after the clock-in that locked the shift.
  ...refusalSchema,
]);

export async function endShiftEarly(
  tx: Tx,
  user: AppUser,
  input: EndEarlyInput,
): Promise<z.infer<typeof endEarlyOutput>> {
  const held = await lockShift(tx, user, input.assignmentId);
  // Missing, removed meanwhile, or another tenant's: one answer.
  if (held.state === "gone") throw forbidden();
  if (held.state === "stale") return { result: "rejected", code: "stale" };
  const { row } = held;
  const end = toWallTime(row.expectedEnd);
  if (input.expectedEnd === end) return { result: "unchanged" };
  // Both are HH:MM, so text order is time order.
  if (input.expectedEnd > end) return { result: "rejected", code: "not_earlier" };

  const day = await loadDay(tx, row.userId, row.workDate);
  const judged = judgeDay({
    shifts: day.shifts.map((s) =>
      s.id === row.id ? { ...s, end: input.expectedEnd } : s,
    ),
  });
  if (!judged.ok) return refused(judged.refusal);

  await tx
    .update(jobAssignments)
    .set({ expectedEnd: input.expectedEnd })
    .where(eq(jobAssignments.id, row.id));
  return { result: "updated" };
}

export const moveTodayInput = z
  .strictObject({
    // The new shift's id, made by the client: a resend finds it and writes nothing.
    id: z.uuid({ version: "v7" }),
    userId: z.uuid(),
    jobId: z.uuid(),
    // The minute of the company's today the person moves at.
    at: wallTime,
    // Read only when no shift covers the minute: then there is no end to inherit.
    expectedEnd: wallTime.optional(),
  })
  .refine((v) => v.expectedEnd === undefined || v.expectedEnd > v.at, {
    message: "The end must be after the minute of the move.",
    path: ["expectedEnd"],
  });

export type MoveTodayInput = z.infer<typeof moveTodayInput>;

const moved = z.strictObject({
  id: z.uuid(),
  workDate: z.iso.date(),
  expectedStart: wallTime,
  expectedEnd: wallTime,
});

export const moveTodayOutput = z.union([
  z.strictObject({
    result: z.literal("moved"),
    shift: moved,
    // The shift that covered the minute, and what became of it; null when none did.
    ended: z
      .strictObject({ id: z.uuid(), result: z.enum(["ended", "removed"]) })
      .nullable(),
  }),
  // This id is already this move's shift: a resend. Nothing is written.
  z.strictObject({ result: z.literal("duplicate"), shift: moved }),
  z.strictObject({
    result: z.literal("rejected"),
    // `same_job`: the shift covering the minute is already on that job. `end_required`: no
    // shift covers the minute and no end was given.
    code: z.enum([
      "user_inactive",
      "job_archived",
      "same_job",
      "end_required",
      "id_conflict",
    ]),
  }),
  ...refusalSchema,
]);

export async function moveToday(
  tx: Tx,
  user: AppUser,
  input: MoveTodayInput,
  now: Date = new Date(),
): Promise<z.infer<typeof moveTodayOutput>> {
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

  const [company] = await tx
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, user.companyId));
  if (company === undefined) throw new Error("the caller's company is not visible");
  const today = workDate(now, company.timezone);
  await lockPersonDays(tx, person.id, [today]);

  const [existing] = await tx
    .select({
      userId: jobAssignments.userId,
      jobId: jobAssignments.jobId,
      workDate: jobAssignments.workDate,
      expectedStart: jobAssignments.expectedStart,
      expectedEnd: jobAssignments.expectedEnd,
    })
    .from(jobAssignments)
    .where(eq(jobAssignments.id, input.id));
  if (existing !== undefined) {
    // The end is not compared: the first send took it from the shift it ended.
    const same =
      existing.userId === person.id &&
      existing.jobId === job.id &&
      existing.workDate === today &&
      toWallTime(existing.expectedStart) === input.at;
    return same
      ? {
          result: "duplicate",
          shift: {
            id: input.id,
            workDate: today,
            expectedStart: input.at,
            expectedEnd: toWallTime(existing.expectedEnd),
          },
        }
      : { result: "rejected", code: "id_conflict" };
  }

  const day = await loadDay(tx, person.id, today);
  // The start included and the end excluded, as everywhere (eligibility.ts).
  const covering = day.shifts.find((s) => s.start <= input.at && input.at < s.end);
  if (covering !== undefined && covering.jobId === job.id) {
    return { result: "rejected", code: "same_job" };
  }
  const end = covering?.end ?? input.expectedEnd;
  if (end === undefined) return { result: "rejected", code: "end_required" };

  // A move at the very minute a shift starts leaves nothing of it: it goes, unless a
  // clock-in was admitted on it, which no write may undo.
  const replaces = covering !== undefined && covering.start === input.at;
  if (replaces && covering.lockedStart !== null) {
    return refused({ code: "authorization", shiftId: covering.id });
  }
  const added: DayShift = {
    id: input.id,
    jobId: job.id,
    start: input.at,
    end,
    lockedStart: null,
  };
  const judged = judgeDay({
    shifts: [
      ...day.shifts.flatMap((s) =>
        s.id !== covering?.id ? [s] : replaces ? [] : [{ ...s, end: input.at }],
      ),
      added,
    ],
  });
  if (!judged.ok) return refused(judged.refusal);

  // The new shift first: an id held by a row this tenant cannot see is refused with nothing
  // written. The day's lock is held, so no reader of the schedule's rules sees the moment
  // between the two statements.
  const inserted = await tx
    .insert(jobAssignments)
    .values({
      id: input.id,
      companyId: user.companyId,
      userId: person.id,
      jobId: job.id,
      workDate: today,
      expectedStart: input.at,
      expectedEnd: end,
    })
    .onConflictDoNothing({ target: jobAssignments.id })
    .returning({ id: jobAssignments.id });
  if (inserted.length === 0) return { result: "rejected", code: "id_conflict" };
  if (covering !== undefined) {
    if (replaces) {
      await tx.delete(jobAssignments).where(eq(jobAssignments.id, covering.id));
    } else {
      await tx
        .update(jobAssignments)
        .set({ expectedEnd: input.at })
        .where(eq(jobAssignments.id, covering.id));
    }
  }
  return {
    result: "moved",
    shift: { id: input.id, workDate: today, expectedStart: input.at, expectedEnd: end },
    ended:
      covering === undefined
        ? null
        : { id: covering.id, result: replaces ? "removed" : "ended" },
  };
}
