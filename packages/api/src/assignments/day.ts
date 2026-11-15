// One person's scheduled day as the writers and push see it (ARCHITECTURE, 2026-11-15 shift
// rules; TASKS S3, S4): its shifts, the overlap overrides among them, and — for a shift a
// clock-in has locked — the minute that clock-in was recorded at, on the company's wall
// clock. Every write to a day and every start judged against one holds that day's lock, so
// the day a writer validated is the day it writes and the day a start was admitted on is the
// day it locked.
//
// `judgeDay` is the whole rule a write must pass: the day resolves (eligibility.ts: no
// undecided overlap, no circle, no shift left without time), and every start already admitted
// would still be admitted on the same shift (a shift is locked by its punch: "nor may any
// other write … alter what authorized that start"). The database holds only what one row can
// prove (migration 0041); this is where the rest is held.
//
// Lock order: a day's lock is taken after any row lock on jobs, users or companies and after
// the field-write and worker locks, and before any job_assignments or shift_overrides row.
// Several days are taken in day order. Consumed by write.ts, copy.ts, list.ts and
// sync/schedule.ts.
import { shiftOverrideHistory } from "@trader/db/schema";
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { admitStart, type Issue, type ResolvedDay, resolveDay } from "./eligibility";

export type DayShift = {
  id: string;
  jobId: string;
  // HH:MM.
  start: string;
  end: string;
  // HH:MM of the clock-in that locked it, on the company's wall clock; null while unlocked.
  lockedStart: string | null;
};

export type DayOverride = {
  id: string;
  holderId: string;
  yieldingId: string;
  reason: string;
};

export type Day = {
  userId: string;
  workDate: string;
  shifts: DayShift[];
  overrides: DayOverride[];
};

// Exclusive, to the end of the transaction, in day order. Keyed on the person, whose id is
// unique across companies, under a prefix of its own.
export async function lockPersonDays(tx: Tx, userId: string, workDates: string[]) {
  await lockDays(
    tx,
    workDates.map((workDate) => ({ userId, workDate })),
  );
}

// The same lock for several people at once, in one order for every caller — by person, then
// by day — so two calls over the same days never wait on each other.
export async function lockDays(tx: Tx, days: { userId: string; workDate: string }[]) {
  const keys = [
    ...new Set(days.map((d) => `shift-day:${d.userId}:${d.workDate}`)),
  ].sort();
  for (const key of keys) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
}

const dayKey = (userId: string, workDate: string) => `${userId} ${workDate}`;

// Every scheduled day in a range of dates, by person and day; `userIds` narrows it. A day
// with no shift is absent: `dayOf` answers an empty one.
export async function loadDays(
  tx: Tx,
  from: string,
  to: string,
  userIds?: string[],
): Promise<Map<string, Day>> {
  const people =
    userIds === undefined
      ? sql``
      : sql`and a.user_id in (${sql.join(
          userIds.map((id) => sql`${id}`),
          sql`, `,
        )})`;
  const days = new Map<string, Day>();
  if (userIds !== undefined && userIds.length === 0) return days;
  const at = (userId: string, workDate: string) => {
    const key = dayKey(userId, workDate);
    let day = days.get(key);
    if (day === undefined) {
      day = { userId, workDate, shifts: [], overrides: [] };
      days.set(key, day);
    }
    return day;
  };
  const shifts = await tx.execute<{
    id: string;
    user_id: string;
    work_date: string;
    job_id: string;
    start: string;
    end: string;
    locked_start: string | null;
  }>(sql`
    select a.id, a.user_id, a.work_date::text as work_date, a.job_id,
      to_char(a.expected_start, 'HH24:MI') as start,
      to_char(a.expected_end, 'HH24:MI') as "end",
      case when a.locked_at is null then null
        else to_char(e.client_timestamp at time zone c.timezone, 'HH24:MI') end as locked_start
    from job_assignments a
    join companies c on c.id = a.company_id
    left join work_session_events e on e.id = a.locked_by_event_id
    where a.work_date between ${from} and ${to} ${people}
    order by a.id
  `);
  for (const r of shifts.rows) {
    at(r.user_id, r.work_date).shifts.push({
      id: r.id,
      jobId: r.job_id,
      start: r.start,
      end: r.end,
      lockedStart: r.locked_start,
    });
  }
  const overrides = await tx.execute<{
    id: string;
    user_id: string;
    work_date: string;
    holder_id: string;
    yielding_id: string;
    reason: string;
  }>(sql`
    select o.id, a.user_id, a.work_date::text as work_date, o.holder_id, o.yielding_id,
      o.reason
    from shift_overrides o
    join job_assignments a on a.id = o.holder_id
    where a.work_date between ${from} and ${to} ${people}
    order by o.id
  `);
  for (const r of overrides.rows) {
    at(r.user_id, r.work_date).overrides.push({
      id: r.id,
      holderId: r.holder_id,
      yieldingId: r.yielding_id,
      reason: r.reason,
    });
  }
  return days;
}

export const dayOf = (days: Map<string, Day>, userId: string, workDate: string): Day =>
  days.get(dayKey(userId, workDate)) ?? { userId, workDate, shifts: [], overrides: [] };

export async function loadDay(tx: Tx, userId: string, workDate: string): Promise<Day> {
  return dayOf(await loadDays(tx, workDate, workDate, [userId]), userId, workDate);
}

export type DayRefusal =
  // The day does not resolve: every issue of the failing stage.
  | { code: "schedule"; issues: Issue[] }
  // The write would change what admitted a clock-in already made on `shiftId`.
  | { code: "authorization"; shiftId: string };

export type DayJudgement =
  { ok: true; resolved: ResolvedDay } | { ok: false; refusal: DayRefusal };

export function judgeDay(day: Pick<Day, "shifts" | "overrides">): DayJudgement {
  const resolved = resolveDay(day.shifts, day.overrides);
  if (resolved.result === "rejected") {
    return { ok: false, refusal: { code: "schedule", issues: resolved.issues } };
  }
  for (const shift of day.shifts) {
    if (shift.lockedStart === null) continue;
    const admission = admitStart(resolved, shift.lockedStart);
    if (admission.result === "none" || admission.shiftId !== shift.id) {
      return { ok: false, refusal: { code: "authorization", shiftId: shift.id } };
    }
  }
  return { ok: true, resolved };
}

// Both are HH:MM, so text order is time order; the end is excluded.
export const overlaps = (
  a: { start: string; end: string },
  b: { start: string; end: string },
) => a.start < b.end && b.start < a.end;

// One entry of an override's history, with both shifts as they stand in `shifts`
// (ARCHITECTURE, 2026-11-15, overlap overrides keep a history). In the caller's transaction:
// a rolled-back write leaves none.
export async function recordOverrideHistory(
  tx: Tx,
  user: AppUser,
  action: "created" | "changed" | "removed",
  day: Pick<Day, "userId" | "workDate">,
  override: DayOverride,
  shifts: ReadonlyMap<string, DayShift>,
) {
  const holder = shifts.get(override.holderId);
  const yielding = shifts.get(override.yieldingId);
  if (holder === undefined || yielding === undefined) {
    throw new Error("an override's history names two shifts of its day");
  }
  await tx.insert(shiftOverrideHistory).values({
    companyId: user.companyId,
    overrideId: override.id,
    action,
    actorUserId: user.id,
    reason: override.reason,
    userId: day.userId,
    workDate: day.workDate,
    holderShiftId: holder.id,
    holderJobId: holder.jobId,
    holderStart: holder.start,
    holderEnd: holder.end,
    yieldingShiftId: yielding.id,
    yieldingJobId: yielding.jobId,
    yieldingStart: yielding.start,
    yieldingEnd: yielding.end,
  });
}

const time = z.string();
const pair = z.tuple([z.uuid(), z.uuid()]);

// eligibility.ts's `Issue`, on the wire.
export const issueSchema = z.discriminatedUnion("code", [
  z.strictObject({ code: z.literal("duplicate_shift_id"), shiftId: z.uuid() }),
  z.strictObject({ code: z.literal("invalid_interval"), shiftId: z.uuid() }),
  z.strictObject({ code: z.literal("duplicate_shift"), shiftIds: pair }),
  z.strictObject({
    code: z.literal("override_unknown_shift"),
    holderId: z.uuid(),
    yieldingId: z.uuid(),
  }),
  z.strictObject({ code: z.literal("override_conflict"), shiftIds: pair }),
  z.strictObject({ code: z.literal("override_not_overlapping"), shiftIds: pair }),
  z.strictObject({
    code: z.literal("missing_decision"),
    shiftIds: pair,
    start: time,
    end: time,
  }),
  z.strictObject({
    code: z.literal("circular_precedence"),
    shiftIds: z.tuple([z.uuid(), z.uuid(), z.uuid()]),
    start: time,
    end: time,
  }),
  z.strictObject({ code: z.literal("no_eligible_time"), shiftId: z.uuid() }),
]);

export const refusalSchema = [
  z.strictObject({
    result: z.literal("rejected"),
    code: z.literal("schedule"),
    issues: z.array(issueSchema).min(1),
  }),
  z.strictObject({
    result: z.literal("rejected"),
    code: z.literal("authorization"),
    shiftId: z.uuid(),
  }),
] as const;

export const refused = (refusal: DayRefusal) => ({
  result: "rejected" as const,
  ...refusal,
});
