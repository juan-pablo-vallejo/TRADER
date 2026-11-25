// Copy Last Week.
// The week before `weekStart` is the source; every shift of it is offered on the same weekday
// of the target week, and each is either created or left out with its reason. Nothing is
// written by the preview. A confirmation names the preview it saw by its fingerprint: under
// the caller's, the people's and the jobs' row locks and every affected day's lock the plan is
// worked out again, and unless it is the plan that was previewed nothing is written and the
// new preview is the answer. What is confirmed is written in one statement, in the call's one
// transaction: all of it or none.
//
// What is left out: a shift of a deactivated person or on an archived job; the exact shift
// already in the target week; and any shift that would overlap one already there or one
// copied before it, or that would change what admitted a clock-in already made on that day. Within a person's
// day, shifts are taken in start, end and id order, so of two that overlapped in the source
// week the earlier one is copied.
//
// A copy is known by the browser's id for it, stored on every row it creates
// (shifts.copy_id): a confirmation sent again finds its rows and creates nothing.
// Undo removes every row of the copy, or none when a clock-in has locked any of them.
import { createHash } from "node:crypto";

import { shifts, jobs, users } from "@trader/db/schema";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { lockActiveSelf, lockUsersShare } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { type Day, dayOf, type DayShift, judgeDay, loadDays, lockDays } from "./day";
import { toWallTime, wallTime, workDay } from "./write";
import { byName } from "../core/order";
import { addDays, isMonday } from "../contract/calendar";

// The week being filled; its source is the week before it.
const weekStart = workDay.refine(isMonday, { message: "A week starts on a Monday." });

export const copyPreviewInput = z.strictObject({ weekStart });
export const copyConfirmInput = z.strictObject({
  copyId: z.uuid({ version: "v7" }),
  weekStart,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});
export const copyUndoInput = z.strictObject({ copyId: z.uuid() });

const LEFT_OUT = [
  "user_inactive",
  "job_archived",
  "duplicate",
  "overlap",
  "started",
] as const;

const offered = {
  sourceId: z.uuid(),
  worker: z.strictObject({ id: z.uuid(), name: z.string() }),
  job: z.strictObject({ id: z.uuid(), name: z.string() }),
  workDate: z.iso.date(),
  expectedStart: wallTime,
  expectedEnd: wallTime,
};

export const copyPreview = z.strictObject({
  weekStart: z.iso.date(),
  sourceWeekStart: z.iso.date(),
  create: z.array(z.strictObject(offered)),
  leftOut: z.array(z.strictObject({ ...offered, reason: z.enum(LEFT_OUT) })),
  // Of everything above that decides what a confirmation writes.
  fingerprint: z.string(),
});

export const copyConfirmOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("copied"), created: z.number().int().positive() }),
  // This copy was already made: nothing is written again.
  z.strictObject({
    result: z.literal("duplicate"),
    created: z.number().int().positive(),
  }),
  // The preview offers nothing to create.
  z.strictObject({ result: z.literal("nothing") }),
  // The plan is no longer the one previewed: nothing is written; this is the plan now.
  z.strictObject({ result: z.literal("stale"), preview: copyPreview }),
]);

export const copyUndoOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("undone"), removed: z.number().int().positive() }),
  // No shift carries this copy's id: never made, or already undone.
  z.strictObject({ result: z.literal("unchanged") }),
  // `locked`: someone has clocked in on a shift of the copy. `stale`: a shift of the copy
  // moved to another day while this call waited. Nothing is removed.
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["locked", "stale"]),
    shiftId: z.uuid(),
  }),
]);

type Preview = z.infer<typeof copyPreview>;
type Offered = Preview["create"][number];

function fingerprintOf(create: Offered[], leftOut: Preview["leftOut"]): string {
  const line = (o: Offered) =>
    [o.worker.id, o.job.id, o.workDate, o.expectedStart, o.expectedEnd].join(" ");
  return createHash("sha256")
    .update(
      JSON.stringify({
        create: create.map(line),
        leftOut: leftOut.map((o) => `${line(o)} ${o.reason}`),
      }),
    )
    .digest("hex");
}

// The plan as the database stands. Read-only: the caller decides what is locked first.
async function planCopy(tx: Tx, target: string): Promise<Preview> {
  const source = addDays(target, -7);
  const rows = await tx
    .select({
      id: shifts.id,
      workDate: shifts.workDate,
      expectedStart: shifts.expectedStart,
      expectedEnd: shifts.expectedEnd,
      userId: users.id,
      userName: users.name,
      deactivatedAt: users.deactivatedAt,
      jobId: jobs.id,
      jobName: jobs.name,
      jobStatus: jobs.status,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .innerJoin(jobs, eq(jobs.id, shifts.jobId))
    .where(and(gte(shifts.workDate, source), lte(shifts.workDate, addDays(source, 6))))
    // One person's day together, its shifts in the order they are taken in.
    .orderBy(
      asc(byName(users.name)),
      asc(users.id),
      asc(shifts.workDate),
      asc(shifts.expectedStart),
      asc(shifts.expectedEnd),
      asc(shifts.id),
    );

  const days = await loadDays(tx, target, addDays(target, 6));
  // Each target day as it will stand once the shifts taken so far are created.
  const standing = new Map<string, Pick<Day, "shifts">>();
  const create: Offered[] = [];
  const leftOut: Preview["leftOut"] = [];
  for (const r of rows) {
    const workDate = addDays(r.workDate, 7);
    const offer: Offered = {
      sourceId: r.id,
      worker: { id: r.userId, name: r.userName },
      job: { id: r.jobId, name: r.jobName },
      workDate,
      expectedStart: toWallTime(r.expectedStart),
      expectedEnd: toWallTime(r.expectedEnd),
    };
    const out = (reason: (typeof LEFT_OUT)[number]) => leftOut.push({ ...offer, reason });
    if (r.deactivatedAt !== null) {
      out("user_inactive");
      continue;
    }
    if (r.jobStatus === "archived") {
      out("job_archived");
      continue;
    }
    const key = `${r.userId} ${workDate}`;
    const day = standing.get(key) ?? dayOf(days, r.userId, workDate);
    const shift: DayShift = {
      // The source's id stands in for the row not yet made: unique within the day.
      id: r.id,
      jobId: r.jobId,
      start: offer.expectedStart,
      end: offer.expectedEnd,
      lockedStart: null,
    };
    if (
      day.shifts.some(
        (s) => s.jobId === shift.jobId && s.start === shift.start && s.end === shift.end,
      )
    ) {
      out("duplicate");
      continue;
    }
    const after = { shifts: [...day.shifts, shift] };
    const judged = judgeDay(after);
    if (!judged.ok) {
      out(judged.refusal.code === "started" ? "started" : "overlap");
      continue;
    }
    standing.set(key, after);
    create.push(offer);
  }
  return {
    weekStart: target,
    sourceWeekStart: source,
    create,
    leftOut,
    fingerprint: fingerprintOf(create, leftOut),
  };
}

export async function previewCopy(
  tx: Tx,
  input: z.infer<typeof copyPreviewInput>,
): Promise<Preview> {
  return planCopy(tx, input.weekStart);
}

export async function confirmCopy(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof copyConfirmInput>,
): Promise<z.infer<typeof copyConfirmOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const made = () => tx.$count(shifts, eq(shifts.copyId, input.copyId));

  // What the plan reads is held still before it is worked out for the write: the jobs and
  // the people FOR SHARE, in id order, then every day it may touch.
  const seen = await planCopy(tx, input.weekStart);
  const offers = [...seen.create, ...seen.leftOut];
  const jobIds = [...new Set(offers.map((o) => o.job.id))].sort();
  if (jobIds.length > 0) {
    await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(inArray(jobs.id, jobIds))
      .orderBy(asc(jobs.id))
      .for("share");
  }
  await lockUsersShare(tx, user, [...new Set(offers.map((o) => o.worker.id))]);
  await lockDays(
    tx,
    offers.map((o) => ({ userId: o.worker.id, workDate: o.workDate })),
  );
  // This copy already made: before this call, or by the same confirmation committing while
  // this one waited. Asked under the locks, so the two are one case.
  const meanwhile = await made();
  if (meanwhile > 0) return { result: "duplicate", created: meanwhile };

  const plan = await planCopy(tx, input.weekStart);
  if (plan.fingerprint !== input.fingerprint) return { result: "stale", preview: plan };
  if (plan.create.length === 0) return { result: "nothing" };
  await tx.insert(shifts).values(
    plan.create.map((o) => ({
      companyId: user.companyId,
      userId: o.worker.id,
      jobId: o.job.id,
      workDate: o.workDate,
      expectedStart: o.expectedStart,
      expectedEnd: o.expectedEnd,
      copyId: input.copyId,
    })),
  );
  return { result: "copied", created: plan.create.length };
}

export async function undoCopy(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof copyUndoInput>,
): Promise<z.infer<typeof copyUndoOutput>> {
  await lockActiveSelf(tx, user, "admin");
  const read = () =>
    tx
      .select({
        id: shifts.id,
        userId: shifts.userId,
        workDate: shifts.workDate,
        lockedAt: shifts.lockedAt,
      })
      .from(shifts)
      .where(eq(shifts.copyId, input.copyId))
      .orderBy(asc(shifts.id));
  const seen = await read();
  if (seen.length === 0) return { result: "unchanged" };
  await lockDays(tx, seen);
  // Again, under the days' locks and each row's own: a shift moved to another day since, or
  // locked by a clock-in, is seen as it now is.
  const rows = await read().for("no key update");
  if (rows.length === 0) return { result: "unchanged" };
  // A shift of the copy moved to a day whose lock this call does not hold.
  const held = new Set(seen.map((r) => `${r.id} ${r.workDate}`));
  const moved = rows.find((r) => !held.has(`${r.id} ${r.workDate}`));
  if (moved !== undefined)
    return { result: "rejected", code: "stale", shiftId: moved.id };
  const locked = rows.find((r) => r.lockedAt !== null);
  if (locked !== undefined)
    return { result: "rejected", code: "locked", shiftId: locked.id };

  // Removing shifts takes nothing from the ones that stay, so no clock-in already admitted
  // is touched and the day still resolves. Nothing is judged here.
  const copied = rows.map((r) => r.id);
  await tx.delete(shifts).where(inArray(shifts.id, copied));
  return { result: "undone", removed: rows.length };
}
