// assignment.create, update, remove and decide: the weekly schedule's writers (PRD, Weekly
// schedule; ARCHITECTURE, 2026-11-15 shift rules; TASKS S3). A shift is one person on one job
// on one day between two times. These writers touch job_assignments, shift_overrides and
// shift_override_history and nothing else: they never read or write crew membership, so an
// admin may schedule any active person of the company on any job of the company that is not
// archived, whatever their crews and whatever their role.
//
// Every write is judged over the person's whole day before anything is written (day.ts,
// judgeDay): two shifts that overlap need an admin's decision — which one holds the shared
// time, and why — and a day that would not resolve, or that would change what admitted a
// clock-in already made, is refused with its reasons and writes nothing. A shift a clock-in
// has locked is not changed or removed here at all.
//
// The day and the times are kept as written (schema, job-assignments.ts): no instant, no
// duration, no comparison with today. A shift lies within its day, so the end is after the
// start.
//
// Ids are the browser's (UUIDv7): a `create` sent again finds its shift and answers
// `duplicate`, writing nothing; the same id with other contents is `id_conflict`.
//
// Lock order (ARCHITECTURE, Concurrency): `create` takes the job FOR SHARE, then the caller
// and the person FOR SHARE in id order — what a push takes, so it never waits on one, and an
// archival or a deactivation committed while it waited is seen. `update`, `remove` and
// `decide` re-read the caller. All of them then take the day's lock (day.ts), in day order
// where there are two, and only then a shift's or an override's row. No field-write lock and
// no worker lock: a shift is not labor.
//
// An override's creation, change and removal each leave a history entry in the same
// transaction — also when it goes because its shifts no longer overlap, or because one of
// them is removed. Consumed by routers/assignment.ts.
import { jobAssignments, jobs, shiftOverrides } from "@trader/db/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { lockUsersShare } from "../crews/lock";
import {
  type Day,
  type DayOverride,
  type DayShift,
  judgeDay,
  loadDay,
  lockPersonDays,
  overlaps,
  recordOverrideHistory,
  refusalSchema,
  refused,
} from "./day";

// The days one `create` may plan: two working weeks.
export const MAX_DAYS = 14;

// A wall-clock time to the minute, 24-hour, as `<input type="time">` writes it.
export const wallTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// A calendar day a plan can be on. This century: `z.iso.date()` alone admits year 0000, which
// Postgres has no date for, and a typed year of 0206 is a slip, not a plan.
export const workDay = z.iso
  .date()
  .refine((day) => day >= "2000-01-01" && day <= "2099-12-31", {
    message: "A day between 2000 and 2099.",
  });

// Both are HH:MM, so text order is time order.
const endsAfterStart = (v: { expectedStart: string; expectedEnd: string }) =>
  v.expectedEnd > v.expectedStart;
const END_AFTER_START = {
  message: "The end must be after the start.",
  path: ["expectedEnd"],
};

// An admin's decision about the overlap between the shift being written and another shift of
// the same person and day: which of the two holds the time they share, and why.
export const decision = z.strictObject({
  overrideId: z.uuid(),
  otherId: z.uuid(),
  holder: z.enum(["this", "other"]),
  reason: z.string().trim().min(1).max(500),
});
const decisions = z
  .array(decision)
  .max(10)
  .refine((d) => new Set(d.map((x) => x.otherId)).size === d.length, {
    message: "One decision per shift.",
  })
  .default([]);

export const createInput = z
  .strictObject({
    userId: z.uuid(),
    jobId: z.uuid(),
    expectedStart: wallTime,
    expectedEnd: wallTime,
    days: z
      .array(z.strictObject({ id: z.uuid(), workDate: workDay, decisions }))
      .min(1)
      .max(MAX_DAYS)
      .refine((days) => new Set(days.map((d) => d.workDate)).size === days.length, {
        message: "A day is named once.",
      })
      .refine((days) => new Set(days.map((d) => d.id)).size === days.length, {
        message: "A shift id is used once.",
      }),
  })
  .refine(endsAfterStart, END_AFTER_START);

export const updateInput = z
  .strictObject({
    assignmentId: z.uuid(),
    workDate: workDay,
    expectedStart: wallTime,
    expectedEnd: wallTime,
    decisions,
  })
  .refine(endsAfterStart, END_AFTER_START);

export const removeInput = z.strictObject({ assignmentId: z.uuid() });

export const decideInput = z.strictObject({
  overrideId: z.uuid(),
  holderId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
});

export type CreateInput = z.infer<typeof createInput>;
export type UpdateInput = z.infer<typeof updateInput>;
export type RemoveInput = z.infer<typeof removeInput>;
export type DecideInput = z.infer<typeof decideInput>;

const dayKey = { id: z.uuid(), workDate: z.iso.date() };

export const createOutput = z.discriminatedUnion("result", [
  // One answer per day asked for, in day order. A refused day writes nothing and leaves the
  // other days as they are answered.
  z.strictObject({
    result: z.literal("planned"),
    days: z.array(
      z.union([
        z.strictObject({ ...dayKey, result: z.literal("created") }),
        // This id is already this shift: a resend. Nothing is written.
        z.strictObject({ ...dayKey, result: z.literal("duplicate") }),
        z.strictObject({
          ...dayKey,
          result: z.literal("rejected"),
          code: z.literal("id_conflict"),
        }),
        ...refusalSchema.map((r) => r.extend(dayKey)),
      ]),
    ),
  }),
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["user_inactive", "job_archived"]),
  }),
]);

// `locked`: a clock-in was admitted on this shift; attendance is corrected in the labor
// ledger. `stale`: the shift moved to another day while this call waited; read it again.
const lockedOrStale = z.strictObject({
  result: z.literal("rejected"),
  code: z.enum(["locked", "stale"]),
});

export const updateOutput = z.union([
  z.strictObject({ result: z.enum(["updated", "unchanged"]) }),
  lockedOrStale,
  ...refusalSchema,
]);

export const removeOutput = z.union([
  z.strictObject({ result: z.enum(["removed", "unchanged"]) }),
  lockedOrStale,
  ...refusalSchema,
]);

export const decideOutput = z.union([
  z.strictObject({ result: z.enum(["updated", "unchanged"]) }),
  ...refusalSchema,
]);

// Postgres writes a `time` back with seconds.
export const toWallTime = (stored: string) => stored.slice(0, 5);

const byId = (shifts: DayShift[]) => new Map(shifts.map((s) => [s.id, s]));

type Decision = z.infer<typeof decision>;

const overrideOf = (shiftId: string, d: Decision): DayOverride => ({
  id: d.overrideId,
  holderId: d.holder === "this" ? shiftId : d.otherId,
  yieldingId: d.holder === "this" ? d.otherId : shiftId,
  reason: d.reason,
});

async function insertOverrides(
  tx: Tx,
  user: AppUser,
  day: Pick<Day, "userId" | "workDate">,
  created: DayOverride[],
  shifts: ReadonlyMap<string, DayShift>,
) {
  if (created.length === 0) return;
  const inserted = await tx
    .insert(shiftOverrides)
    .values(
      created.map((o) => ({
        id: o.id,
        companyId: user.companyId,
        holderId: o.holderId,
        yieldingId: o.yieldingId,
        reason: o.reason,
        createdBy: user.id,
      })),
    )
    // The id is named: an override id already taken is refused, any other violation raised.
    .onConflictDoNothing({ target: shiftOverrides.id })
    .returning({ id: shiftOverrides.id });
  if (inserted.length !== created.length) throw forbidden();
  for (const o of created)
    await recordOverrideHistory(tx, user, "created", day, o, shifts);
}

// Removed with their history, as the shifts stood before the write.
async function removeOverrides(
  tx: Tx,
  user: AppUser,
  day: Pick<Day, "userId" | "workDate">,
  removed: DayOverride[],
  before: ReadonlyMap<string, DayShift>,
) {
  if (removed.length === 0) return;
  for (const o of removed)
    await recordOverrideHistory(tx, user, "removed", day, o, before);
  await tx.delete(shiftOverrides).where(
    inArray(
      shiftOverrides.id,
      removed.map((o) => o.id),
    ),
  );
}

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

  const asked = [...input.days].sort((a, b) => (a.workDate < b.workDate ? -1 : 1));
  await lockPersonDays(
    tx,
    person.id,
    asked.map((d) => d.workDate),
  );

  const days: Extract<z.infer<typeof createOutput>, { result: "planned" }>["days"] = [];
  for (const { id, workDate, decisions: decided } of asked) {
    const key = { id, workDate };
    const [existing] = await tx
      .select({
        userId: jobAssignments.userId,
        jobId: jobAssignments.jobId,
        workDate: jobAssignments.workDate,
        expectedStart: jobAssignments.expectedStart,
        expectedEnd: jobAssignments.expectedEnd,
      })
      .from(jobAssignments)
      .where(eq(jobAssignments.id, id));
    if (existing !== undefined) {
      const same =
        existing.userId === person.id &&
        existing.jobId === job.id &&
        existing.workDate === workDate &&
        toWallTime(existing.expectedStart) === input.expectedStart &&
        toWallTime(existing.expectedEnd) === input.expectedEnd;
      days.push(
        same
          ? { ...key, result: "duplicate" }
          : { ...key, result: "rejected", code: "id_conflict" },
      );
      continue;
    }

    const day = await loadDay(tx, person.id, workDate);
    const shift: DayShift = {
      id,
      jobId: job.id,
      start: input.expectedStart,
      end: input.expectedEnd,
      lockedStart: null,
    };
    const created = decided.map((d) => overrideOf(id, d));
    const after = {
      shifts: [...day.shifts, shift],
      overrides: [...day.overrides, ...created],
    };
    const judged = judgeDay(after);
    if (!judged.ok) {
      days.push({ ...key, ...refused(judged.refusal) });
      continue;
    }
    const inserted = await tx
      .insert(jobAssignments)
      .values({
        id,
        companyId: user.companyId,
        userId: person.id,
        jobId: job.id,
        workDate,
        expectedStart: input.expectedStart,
        expectedEnd: input.expectedEnd,
      })
      // The id is named: taken by a row this tenant cannot see, it is refused; the exact
      // shift was judged above, and any other violation is a defect and must be raised.
      .onConflictDoNothing({ target: jobAssignments.id })
      .returning({ id: jobAssignments.id });
    if (inserted.length === 0) {
      days.push({ ...key, result: "rejected", code: "id_conflict" });
      continue;
    }
    await insertOverrides(tx, user, day, created, byId(after.shifts));
    days.push({ ...key, result: "created" });
  }
  return { result: "planned", days };
}

// The caller re-read, the shift read, its days locked, and the shift read again under its row
// lock. `gone` is a shift that is not there — never made, removed meanwhile, or another
// tenant's and so invisible.
async function lockShift(tx: Tx, user: AppUser, assignmentId: string, alsoDay?: string) {
  await lockActiveSelf(tx, user, "admin");
  const read = () =>
    tx
      .select({
        id: jobAssignments.id,
        userId: jobAssignments.userId,
        jobId: jobAssignments.jobId,
        workDate: jobAssignments.workDate,
        expectedStart: jobAssignments.expectedStart,
        expectedEnd: jobAssignments.expectedEnd,
        lockedAt: jobAssignments.lockedAt,
      })
      .from(jobAssignments)
      .where(eq(jobAssignments.id, assignmentId));
  const [seen] = await read();
  if (seen === undefined) return { state: "gone" as const };
  await lockPersonDays(
    tx,
    seen.userId,
    alsoDay === undefined ? [seen.workDate] : [seen.workDate, alsoDay],
  );
  const [row] = await read().for("no key update");
  if (row === undefined) return { state: "gone" as const };
  // Moved to a day whose lock this call does not hold.
  if (row.workDate !== seen.workDate) return { state: "stale" as const };
  return { state: "held" as const, row };
}

// The day and the times only: the person and the job of a shift never change, so moving a
// shift to another job is a removal and a new shift. Allowed whatever has become of the job
// or the person since: it grants nothing, and the read shows what stands in the way.
export async function updateAssignment(
  tx: Tx,
  user: AppUser,
  input: UpdateInput,
): Promise<z.infer<typeof updateOutput>> {
  const held = await lockShift(tx, user, input.assignmentId, input.workDate);
  // Missing, removed meanwhile, or another tenant's: one answer.
  if (held.state === "gone") throw forbidden();
  if (held.state === "stale") return { result: "rejected", code: "stale" };
  const { row } = held;
  const moved = row.workDate !== input.workDate;
  if (
    !moved &&
    toWallTime(row.expectedStart) === input.expectedStart &&
    toWallTime(row.expectedEnd) === input.expectedEnd &&
    input.decisions.length === 0
  ) {
    return { result: "unchanged" };
  }
  if (row.lockedAt !== null) return { result: "rejected", code: "locked" };

  const from = await loadDay(tx, row.userId, row.workDate);
  const before = byId(from.shifts);
  const shift: DayShift = {
    id: row.id,
    jobId: row.jobId,
    start: input.expectedStart,
    end: input.expectedEnd,
    lockedStart: null,
  };
  const mine = from.overrides.filter(
    (o) => o.holderId === row.id || o.yieldingId === row.id,
  );
  const others = from.overrides.filter((o) => !mine.includes(o));
  const decidedFor = new Map(input.decisions.map((d) => [d.otherId, d]));

  let removed: DayOverride[];
  const changed: DayOverride[] = [];
  let created: DayOverride[];
  let to: Day;
  let afterTo: { shifts: DayShift[]; overrides: DayOverride[] };

  if (moved) {
    // Every override of the shift goes with the day it was decided on.
    removed = mine;
    const afterFrom = {
      shifts: from.shifts.filter((s) => s.id !== row.id),
      overrides: others,
    };
    const left = judgeDay(afterFrom);
    if (!left.ok) return refused(left.refusal);
    to = await loadDay(tx, row.userId, input.workDate);
    created = input.decisions.map((d) => overrideOf(row.id, d));
    afterTo = {
      shifts: [...to.shifts, shift],
      overrides: [...to.overrides, ...created],
    };
  } else {
    to = from;
    const kept: DayOverride[] = [];
    removed = [];
    for (const o of mine) {
      const otherId = o.holderId === row.id ? o.yieldingId : o.holderId;
      const other = before.get(otherId)!;
      // The two no longer overlap: nothing is left to decide.
      if (!overlaps(shift, other)) {
        removed.push(o);
        continue;
      }
      const d = decidedFor.get(otherId);
      if (d === undefined) {
        kept.push(o);
        continue;
      }
      decidedFor.delete(otherId);
      const next = { ...overrideOf(row.id, d), id: o.id };
      if (next.holderId === o.holderId && next.reason === o.reason) kept.push(o);
      else changed.push(next);
    }
    created = [...decidedFor.values()].map((d) => overrideOf(row.id, d));
    afterTo = {
      shifts: from.shifts.map((s) => (s.id === row.id ? shift : s)),
      overrides: [...others, ...kept, ...changed, ...created],
    };
  }
  const judged = judgeDay(afterTo);
  if (!judged.ok) return refused(judged.refusal);

  await removeOverrides(tx, user, from, removed, before);
  await tx
    .update(jobAssignments)
    .set({
      workDate: input.workDate,
      expectedStart: input.expectedStart,
      expectedEnd: input.expectedEnd,
    })
    .where(eq(jobAssignments.id, row.id));
  const now = byId(afterTo.shifts);
  for (const o of changed) {
    await tx
      .update(shiftOverrides)
      .set({ holderId: o.holderId, yieldingId: o.yieldingId, reason: o.reason })
      .where(eq(shiftOverrides.id, o.id));
    await recordOverrideHistory(tx, user, "changed", to, o, now);
  }
  await insertOverrides(tx, user, to, created, now);
  return { result: "updated" };
}

// A shift that is not there — never made, already removed, or another tenant's and so
// invisible — is `unchanged`: a retry is harmless and the answer says nothing of other
// companies.
export async function removeAssignment(
  tx: Tx,
  user: AppUser,
  input: RemoveInput,
): Promise<z.infer<typeof removeOutput>> {
  const held = await lockShift(tx, user, input.assignmentId);
  if (held.state === "gone") return { result: "unchanged" };
  if (held.state === "stale") return { result: "rejected", code: "stale" };
  const { row } = held;
  if (row.lockedAt !== null) return { result: "rejected", code: "locked" };

  const day = await loadDay(tx, row.userId, row.workDate);
  const mine = day.overrides.filter(
    (o) => o.holderId === row.id || o.yieldingId === row.id,
  );
  const judged = judgeDay({
    shifts: day.shifts.filter((s) => s.id !== row.id),
    overrides: day.overrides.filter((o) => !mine.includes(o)),
  });
  if (!judged.ok) return refused(judged.refusal);

  await removeOverrides(tx, user, day, mine, byId(day.shifts));
  await tx.delete(jobAssignments).where(eq(jobAssignments.id, row.id));
  return { result: "removed" };
}

// Which shift holds an overlap already decided, or why: the one change an override takes.
// It is removed only with the overlap itself — by a shift's change or removal — never alone,
// since two shifts that overlap are never left undecided.
export async function decideOverride(
  tx: Tx,
  user: AppUser,
  input: DecideInput,
): Promise<z.infer<typeof decideOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const read = () =>
    tx
      .select({ userId: jobAssignments.userId, workDate: jobAssignments.workDate })
      .from(shiftOverrides)
      .innerJoin(jobAssignments, eq(jobAssignments.id, shiftOverrides.holderId))
      .where(eq(shiftOverrides.id, input.overrideId));
  const [seen] = await read();
  // Missing, removed meanwhile, or another tenant's: one answer.
  if (seen === undefined) throw forbidden();
  await lockPersonDays(tx, seen.userId, [seen.workDate]);
  const day = await loadDay(tx, seen.userId, seen.workDate);
  const current = day.overrides.find((o) => o.id === input.overrideId);
  if (current === undefined) throw forbidden();
  // The holder is one of the override's own two shifts.
  if (input.holderId !== current.holderId && input.holderId !== current.yieldingId) {
    throw forbidden();
  }
  if (input.holderId === current.holderId && input.reason === current.reason) {
    return { result: "unchanged" };
  }
  const next: DayOverride = {
    id: current.id,
    holderId: input.holderId,
    yieldingId:
      input.holderId === current.holderId ? current.yieldingId : current.holderId,
    reason: input.reason,
  };
  const judged = judgeDay({
    shifts: day.shifts,
    overrides: day.overrides.map((o) => (o.id === next.id ? next : o)),
  });
  if (!judged.ok) return refused(judged.refusal);
  await tx
    .update(shiftOverrides)
    .set({ holderId: next.holderId, yieldingId: next.yieldingId, reason: next.reason })
    .where(eq(shiftOverrides.id, next.id));
  await recordOverrideHistory(tx, user, "changed", day, next, byId(day.shifts));
  return { result: "updated" };
}
