// The pay calendar the office keeps (PRD, Labor: the office closes a pay period; ARCHITECTURE,
// Accounting and exports, Pay-period close; 2026-11-12 pay periods): payPeriod.list, open and
// update. A period is an inclusive range of work dates of at most 31 days, so it always fits
// the reads that take a range (labor/ledger.ts). Periods are contiguous: the first may start
// anywhere, and every later one starts the day after the latest ends — the database refuses
// overlap and a period earlier than a closed one (0004, 0036), and leaves gaps to this file.
// The application role cannot delete a period, so a mistyped date is repaired by `update`:
// only the latest period, only while it is open; a later period keeps its start.
//
// Every writer here, and the close, takes the company's pay-period lock (0036,
// lock_pay_periods) after the caller's own row and before its first read of the calendar, so
// two openers, or an opener and a closer, never judge the same calendar at once. Lock order:
// the caller's users row, this lock, then period rows; never the field-write lock. No audit
// row: V1's audited set is closed (V1-D20). Consumed by routers/pay-period.ts, close.ts and
// read.ts.
import { payPeriodLines, payPeriods, users } from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { workDay } from "../assignments/write";
import { serverClock } from "../core/clock";
import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { companyZone } from "../labor/day-hours";
import { RANGE_REFUSAL, rangeWithinBound } from "../labor/ledger";
import { assertReadCommitted } from "../labor/timeline";
import { workDate } from "../labor/work-date";
import type { Line } from "./lines";

export const period = z.strictObject({
  id: z.uuid(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  // Null while open. A closed period never changes (0004).
  closed: z
    .strictObject({
      at: z.date(),
      by: z.strictObject({ id: z.uuid(), name: z.string() }),
      // What the closer acknowledged: sessions on the period's dates that still waited for
      // approval, and sessions that counted but had no clock-out, at the close.
      unresolved: z.strictObject({
        pendingSessions: z.number().int(),
        openSessions: z.number().int(),
      }),
    })
    .nullable(),
});

export type Period = z.infer<typeof period>;

// One opener or closer per company at a time, to the end of the transaction (0036).
export async function lockPayPeriods(tx: Tx, user: AppUser): Promise<void> {
  await tx.execute(sql`select public.lock_pay_periods(${user.companyId}::uuid)`);
}

// The company's whole calendar and every line its closes stored, oldest period first, read in
// ONE statement: a reader with no lock must never see a period closed without its lines, or
// the lines of a period it read as open, and READ COMMITTED gives each statement its own
// snapshot.
export async function readCalendar(
  tx: Tx,
): Promise<{ periods: Period[]; lines: (Line & { periodId: string })[] }> {
  const rows = await tx
    .select({
      id: payPeriods.id,
      startsOn: payPeriods.startsOn,
      endsOn: payPeriods.endsOn,
      closedAt: payPeriods.closedAt,
      closedById: payPeriods.closedByUserId,
      closedByName: users.name,
      pending: payPeriods.unresolvedPendingSessions,
      open: payPeriods.unresolvedOpenSessions,
      line: {
        workerId: payPeriodLines.workerId,
        jobId: payPeriodLines.jobId,
        workDate: payPeriodLines.workDate,
        hundredths: payPeriodLines.hundredths,
      },
    })
    .from(payPeriods)
    .leftJoin(users, eq(users.id, payPeriods.closedByUserId))
    .leftJoin(payPeriodLines, eq(payPeriodLines.periodId, payPeriods.id))
    .orderBy(asc(payPeriods.startsOn));

  const periods = new Map<string, Period>();
  const lines: (Line & { periodId: string })[] = [];
  for (const r of rows) {
    if (!periods.has(r.id)) {
      let closed: Period["closed"] = null;
      if (r.closedAt !== null) {
        if (
          r.closedById === null ||
          r.closedByName === null ||
          r.pending === null ||
          r.open === null
        ) {
          throw new Error("a closed pay period names its closer and its counts");
        }
        closed = {
          at: r.closedAt,
          by: { id: r.closedById, name: r.closedByName },
          unresolved: { pendingSessions: r.pending, openSessions: r.open },
        };
      }
      periods.set(r.id, { id: r.id, startsOn: r.startsOn, endsOn: r.endsOn, closed });
    }
    if (r.line !== null) lines.push({ periodId: r.id, ...r.line });
  }
  return { periods: [...periods.values()], lines };
}

// The day after `day`, a calendar day with no zone.
export function nextDay(day: string): string {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

// Today's work date in the company's zone, by the server's clock.
export async function companyToday(tx: Tx, user: AppUser) {
  const timezone = await companyZone(tx, user.companyId);
  return { timezone, today: workDate(await serverClock(tx), timezone) };
}

export const listOutput = z.strictObject({
  // The zone the periods' dates are days of, and today in it.
  timezone: z.string(),
  today: z.iso.date(),
  // Newest first.
  periods: z.array(period),
});

export async function listPeriods(
  tx: Tx,
  user: AppUser,
): Promise<z.infer<typeof listOutput>> {
  const { periods } = await readCalendar(tx);
  return { ...(await companyToday(tx, user)), periods: periods.reverse() };
}

const bounds = { startsOn: workDay, endsOn: workDay };
const withinBound = (v: { startsOn: string; endsOn: string }) =>
  rangeWithinBound({ from: v.startsOn, to: v.endsOn });
const BOUND_REFUSAL = { ...RANGE_REFUSAL, path: ["endsOn"] };

export const openInput = z.strictObject(bounds).refine(withinBound, BOUND_REFUSAL);

// Not the day after the latest period ends; `expectedStartsOn` is that day.
const notContiguous = z.strictObject({
  result: z.literal("rejected"),
  code: z.literal("not_contiguous"),
  expectedStartsOn: z.iso.date(),
});

export const openOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("opened"), period }),
  // A period with exactly these dates already stands: the same request, sent again.
  z.strictObject({ result: z.literal("exists"), period }),
  notContiguous,
]);

export type OpenResult = z.infer<typeof openOutput>;

async function lockCalendar(tx: Tx, user: AppUser, who: string) {
  await assertReadCommitted(tx, who);
  await lockActiveSelf(tx, user, "admin");
  await lockPayPeriods(tx, user);
  return (await readCalendar(tx)).periods;
}

export async function openPeriod(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof openInput>,
): Promise<OpenResult> {
  const periods = await lockCalendar(tx, user, "payPeriod.open");
  const same = periods.find(
    (p) => p.startsOn === input.startsOn && p.endsOn === input.endsOn,
  );
  if (same !== undefined) return { result: "exists", period: same };
  const latest = periods.at(-1);
  if (latest !== undefined && input.startsOn !== nextDay(latest.endsOn)) {
    return {
      result: "rejected",
      code: "not_contiguous",
      expectedStartsOn: nextDay(latest.endsOn),
    };
  }
  const [row] = await tx
    .insert(payPeriods)
    .values({ companyId: user.companyId, startsOn: input.startsOn, endsOn: input.endsOn })
    .returning({ id: payPeriods.id });
  if (row === undefined) throw new Error("the opened pay period was not returned");
  return {
    result: "opened",
    period: { id: row.id, startsOn: input.startsOn, endsOn: input.endsOn, closed: null },
  };
}

export const updateInput = z
  .strictObject({ periodId: z.uuid(), ...bounds })
  .refine(withinBound, BOUND_REFUSAL);

export const updateOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), period }),
  z.strictObject({ result: z.literal("unchanged"), period }),
  z.discriminatedUnion("code", [
    // A closed period never changes.
    z.strictObject({
      result: z.literal("rejected"),
      code: z.literal("closed"),
      period,
    }),
    // A later period exists: only the latest one's dates may move.
    z.strictObject({ result: z.literal("rejected"), code: z.literal("not_latest") }),
    notContiguous,
  ]),
]);

export type UpdateResult = z.infer<typeof updateOutput>;

export async function updatePeriod(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof updateInput>,
): Promise<UpdateResult> {
  const periods = await lockCalendar(tx, user, "payPeriod.update");
  const at = periods.findIndex((p) => p.id === input.periodId);
  const target = periods[at];
  // Another tenant's period, under RLS, is not visible: the gate's answer.
  if (target === undefined) throw forbidden();
  if (target.closed !== null)
    return { result: "rejected", code: "closed", period: target };
  if (at !== periods.length - 1) return { result: "rejected", code: "not_latest" };
  const previous = periods[at - 1];
  if (previous !== undefined && input.startsOn !== nextDay(previous.endsOn)) {
    return {
      result: "rejected",
      code: "not_contiguous",
      expectedStartsOn: nextDay(previous.endsOn),
    };
  }
  if (target.startsOn === input.startsOn && target.endsOn === input.endsOn) {
    return { result: "unchanged", period: target };
  }
  await tx
    .update(payPeriods)
    .set({ startsOn: input.startsOn, endsOn: input.endsOn })
    .where(eq(payPeriods.id, target.id));
  return {
    result: "updated",
    period: { ...target, startsOn: input.startsOn, endsOn: input.endsOn },
  };
}
