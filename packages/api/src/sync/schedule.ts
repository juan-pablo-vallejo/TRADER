// A clock-in judged by the weekly schedule (ARCHITECTURE, 2026-11-15: schedule authority, a
// shift is locked by its punch, a start captured offline that the schedule no longer admits;
// TASKS S4). Enforcement is the company's own setting, written only by the database's owner
// (migration 0041) and read here in the record's transaction: a client neither sets it nor is
// believed about it. Off, nothing below `scheduleEnforced` runs and push never reads a shift.
//
// A start is placed by reading its recorded instant as a day and a minute on the company's
// wall clock; the shift's own times are never turned into instants (2026-11-15, shift rules).
// It is admitted when that person's day resolves and the minute is inside a shift's eligible
// time, or at most fifteen minutes before the next one (eligibility.ts, admitStart) — and the
// shift is on the job the start names. A day that does not resolve admits nothing.
//
// The day's lock (assignments/day.ts) is taken after the scope's row locks and the worker's
// timeline lock, and held to the end of the record's transaction: the schedule a start was
// admitted on is the schedule its shift is locked under, and an office write to that day
// either committed before this read or waits and is judged against the lock.
// Consumed by sync/labor.ts and sync/pull.ts.
import { companies } from "@trader/db/schema";
import { sql } from "drizzle-orm";

import { loadDay, lockPersonDays } from "../assignments/day";
import { admitStart, resolveDay } from "../assignments/eligibility";
import type { Tx } from "../core/context";

export async function scheduleEnforced(tx: Tx): Promise<boolean> {
  // One row: the tenant's own, under row-level security.
  const [company] = await tx
    .select({ enforced: companies.scheduleEnforced })
    .from(companies);
  if (company === undefined) throw new Error("the caller's company is not visible");
  return company.enforced;
}

export type StartJudgement = { admitted: true; shiftId: string } | { admitted: false };

export async function judgeStart(
  tx: Tx,
  workerId: string,
  jobId: string,
  clientTimestamp: Date,
): Promise<StartJudgement> {
  const { rows } = await tx.execute<{ day: string; minute: string }>(sql`
    select to_char(${clientTimestamp.toISOString()}::timestamptz at time zone c.timezone,
        'YYYY-MM-DD') as day,
      to_char(${clientTimestamp.toISOString()}::timestamptz at time zone c.timezone,
        'HH24:MI') as minute
    from companies c
  `);
  const at = rows[0];
  if (at === undefined) throw new Error("the caller's company is not visible");
  await lockPersonDays(tx, workerId, [at.day]);
  const day = await loadDay(tx, workerId, at.day);
  const resolved = resolveDay(day.shifts, day.overrides);
  if (resolved.result !== "resolved") return { admitted: false };
  const admission = admitStart(resolved, at.minute);
  if (admission.result === "none" || admission.jobId !== jobId)
    return { admitted: false };
  return { admitted: true, shiftId: admission.shiftId };
}

// Once: a second start on a shift already locked leaves the first lock as it is. The database
// holds the rest — the event is a `started` of the shift's own person on its own job (0041).
export async function lockShift(tx: Tx, shiftId: string, eventId: string) {
  await tx.execute(sql`
    update job_assignments set locked_at = now(), locked_by_event_id = ${eventId}
    where id = ${shiftId} and locked_at is null
  `);
}
