// One job's day for its closeout: the sessions folded onto (job, work date), the receipt mark
// of each worker who has one, and the materials logged on it. Built only from the existing
// fold (deriveSessions) and workDate: there is no second derivation of sessions or dates.
// The caller holds the company's field-write lock exclusive (labor/timeline.ts), so no writer
// is in flight and every worker's ledger is read whole and consistent. Consumed by submit.ts.
import { materials, workSessionEvents } from "@trader/db/schema";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";

import type { Tx } from "../context";
import { newestStamp, readWorkerEvents } from "../labor/timeline";
import {
  workDate as workDateOf,
  deriveSessions,
  type DerivedSession,
} from "../labor/work-date";

export type DaySession = { workerId: string; session: DerivedSession };

export type JobDay = {
  sessions: DaySession[];
  // Workers with at least one session on the day, in id order, each with the newest receipt
  // stamp of their ledger: their events stamped at or before it are what the day was built
  // from (receipt stamps rise per worker, ARCHITECTURE row 185).
  workers: { workerId: string; ledgerThrough: Date }[];
  materialIds: string[];
};

// A window around the day, in the zone, wide enough to hold it under any offset: SQL only
// narrows the candidates, and the exact date comes from workDate below.
const windowStart = (day: string, timeZone: string) =>
  sql`((${day}::date - 1)::timestamp at time zone ${timeZone})`;
const windowEnd = (day: string, timeZone: string) =>
  sql`((${day}::date + 2)::timestamp at time zone ${timeZone})`;

export async function gatherJobDay(
  tx: Tx,
  day: { jobId: string; workDate: string; timeZone: string },
): Promise<JobDay> {
  const { jobId, workDate, timeZone } = day;

  // Every session on the job has an effective `started` naming the job (decision D5: a
  // session's job is its effective start's), at its effective instant (D1), so these workers
  // are all that can have one on the day.
  const effective = sql`case when ${workSessionEvents.clockSkewed}
    then ${workSessionEvents.serverTimestamp} else ${workSessionEvents.clientTimestamp} end`;
  const candidates = await tx
    .selectDistinct({ workerId: workSessionEvents.workerId })
    .from(workSessionEvents)
    .where(
      and(
        eq(workSessionEvents.jobId, jobId),
        eq(workSessionEvents.type, "started"),
        gte(effective, windowStart(workDate, timeZone)),
        lt(effective, windowEnd(workDate, timeZone)),
      ),
    )
    .orderBy(asc(workSessionEvents.workerId));

  const sessions: DaySession[] = [];
  const workers: JobDay["workers"] = [];
  for (const { workerId } of candidates) {
    const events = await readWorkerEvents(tx, workerId);
    const kept = deriveSessions(events, timeZone).filter(
      (s) => s.jobId === jobId && s.workDate === workDate,
    );
    if (kept.length === 0) continue;
    for (const session of kept) sessions.push({ workerId, session });
    const ledgerThrough = newestStamp(events);
    if (ledgerThrough === null) throw new Error("unreachable: a session has events");
    workers.push({ workerId, ledgerThrough });
  }

  // Device time is business time (PRD, Labor): a material's day is its logged_at's.
  const logged = await tx
    .select({ id: materials.id, loggedAt: materials.loggedAt })
    .from(materials)
    .where(
      and(
        eq(materials.jobId, jobId),
        gte(materials.loggedAt, windowStart(workDate, timeZone)),
        lt(materials.loggedAt, windowEnd(workDate, timeZone)),
      ),
    );
  const materialIds = logged
    .filter((m) => workDateOf(m.loggedAt, timeZone) === workDate)
    .map((m) => m.id)
    .sort();

  return { sessions, workers, materialIds };
}
