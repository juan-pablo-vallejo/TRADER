// payPeriod.close (PRD, Labor: an admin may close a period while entries in it still wait for
// approval, once shown what is unresolved and having acknowledged it; a closed period and its
// export are immutable; ARCHITECTURE, Accounting and exports: Pay-period close, Late
// adjustments; V1-D03). One transaction, in this order:
//   1. the caller, re-read under lock (core/locks.ts), then the company's pay-period lock, so
//      one close runs at a time and reads what every earlier close committed;
//   2. the calendar and every stored line, in one statement (periods.ts);
//   3. the refusals that need no ledger: closed already, an earlier period still open, a
//      last day that has not passed in the company's zone;
//   4. the ledger of every worker with its decisions, in one statement, through the one
//      derivation (labor/day-hours.ts): what is approved, and what is unresolved on the
//      period's dates;
//   5. the acknowledgment, judged against step 4's counts: required when anything is
//      unresolved, and equal to the counts or the close writes nothing and answers them;
//   6. the lines (lines.ts) and then the closing update, stamped by the server's clock after
//      every lock.
// Membership is that one read: what it saw approved is the period's, and whatever commits
// after it — an approval, a correction, a repair, a late push — is the difference the next
// close finds and stores as an adjustment. So this takes no field-write lock and holds up no
// push and no decision; nothing is compared with closed_at. A rate is never read: a close
// stores hours, and V1 computes no pay. No audit row (V1-D20): the row names its closer.
// Consumed by routers/pay-period.ts.
import { payPeriodLines, payPeriods, workSessionEvents } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { serverClock } from "../core/clock";
import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { readDayHours } from "../labor/day-hours";
import type { DayCell } from "../labor/hours";
import { assertReadCommitted } from "../labor/timeline";
import { closeLines, unresolvedIn } from "./lines";
import { companyToday, lockPayPeriods, period, readCalendar } from "./periods";

const counts = z.strictObject({
  pendingSessions: z.number().int().min(0),
  openSessions: z.number().int().min(0),
});

export const closeInput = z.strictObject({
  periodId: z.uuid(),
  // What the admin was shown and ticked. Absent when nothing was unresolved.
  acknowledged: counts.optional(),
});

export const closeOutput = z.discriminatedUnion("result", [
  z.strictObject({
    result: z.literal("closed"),
    period,
    // How many lines the close stored.
    lines: z.strictObject({ own: z.number().int(), adjustments: z.number().int() }),
  }),
  z.discriminatedUnion("code", [
    // Closed before this call got the lock — by another admin, or by this request sent
    // twice. The standing close is the answer.
    z.strictObject({
      result: z.literal("rejected"),
      code: z.literal("already_closed"),
      period,
    }),
    // Periods close in order; `period` is the earliest still open.
    z.strictObject({
      result: z.literal("rejected"),
      code: z.literal("earlier_open"),
      period,
    }),
    // Its last day is today or later in the company's zone.
    z.strictObject({
      result: z.literal("rejected"),
      code: z.literal("not_ended"),
      today: z.iso.date(),
    }),
    // Something is unresolved and the call acknowledged nothing.
    z.strictObject({
      result: z.literal("rejected"),
      code: z.literal("unacknowledged"),
      unresolved: counts,
    }),
    // What was acknowledged is not what is unresolved now.
    z.strictObject({
      result: z.literal("rejected"),
      code: z.literal("unresolved_changed"),
      unresolved: counts,
    }),
  ]),
]);

export type CloseResult = z.infer<typeof closeOutput>;

// Every cell of every worker the caller's company has an event for, in one committed state.
export async function companyDayHours(tx: Tx, timeZone: string): Promise<DayCell[]> {
  const workers = await tx
    .selectDistinct({ id: workSessionEvents.workerId })
    .from(workSessionEvents);
  return readDayHours(
    tx,
    workers.map((w) => w.id),
    timeZone,
  );
}

// Rows per INSERT: six parameters each, far under the protocol's 65,535.
const BATCH = 1000;

export async function closePeriod(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof closeInput>,
): Promise<CloseResult> {
  await assertReadCommitted(tx, "payPeriod.close");
  await lockActiveSelf(tx, user, "admin");
  await lockPayPeriods(tx, user);

  const { periods, lines } = await readCalendar(tx);
  const target = periods.find((p) => p.id === input.periodId);
  // Another tenant's period, under RLS, is not visible: the gate's answer.
  if (target === undefined) throw forbidden();
  if (target.closed !== null) {
    return { result: "rejected", code: "already_closed", period: target };
  }
  const earlier = periods.find((p) => p.closed === null);
  if (earlier !== undefined && earlier.id !== target.id) {
    return { result: "rejected", code: "earlier_open", period: earlier };
  }
  const { timezone, today } = await companyToday(tx, user);
  if (target.endsOn >= today) return { result: "rejected", code: "not_ended", today };

  const cells = await companyDayHours(tx, timezone);
  const unresolved = unresolvedIn(cells, target);
  const given = input.acknowledged;
  if (given === undefined) {
    if (unresolved.pendingSessions + unresolved.openSessions > 0) {
      return { result: "rejected", code: "unacknowledged", unresolved };
    }
  } else if (
    given.pendingSessions !== unresolved.pendingSessions ||
    given.openSessions !== unresolved.openSessions
  ) {
    return { result: "rejected", code: "unresolved_changed", unresolved };
  }

  const { own, adjustments } = closeLines(
    cells,
    lines,
    target,
    periods.filter((p) => p.closed !== null),
  );
  const rows = [...own, ...adjustments].map((l) => ({
    companyId: user.companyId,
    periodId: target.id,
    workerId: l.workerId,
    jobId: l.jobId,
    workDate: l.workDate,
    hundredths: l.hundredths,
  }));
  for (let at = 0; at < rows.length; at += BATCH) {
    await tx.insert(payPeriodLines).values(rows.slice(at, at + BATCH));
  }
  await tx
    .update(payPeriods)
    .set({
      closedAt: await serverClock(tx),
      closedByUserId: user.id,
      unresolvedPendingSessions: unresolved.pendingSessions,
      unresolvedOpenSessions: unresolved.openSessions,
    })
    .where(eq(payPeriods.id, target.id));

  const closed = (await readCalendar(tx)).periods.find((p) => p.id === target.id);
  if (closed === undefined) throw new Error("the closed pay period is not visible");
  return {
    result: "closed",
    period: closed,
    lines: { own: own.length, adjustments: adjustments.length },
  };
}
