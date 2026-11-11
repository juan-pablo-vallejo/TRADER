// One job's day: the sessions folded onto (job, work date), the receipt mark of each worker who
// has one, and the materials logged on it. Built only from the existing fold (deriveSessions)
// and workDate: there is no second derivation of sessions or dates. Under the company's
// field-write lock held exclusive (labor/timeline.ts; closeout.submit), no writer is in flight
// and the day is one consistent state. Without it (closeout.review), each statement reads its
// own committed state, so the whole may combine states from different moments; each worker's
// ledger is still one statement, legal on its own. Consumed by submit.ts and review.ts.
import { materials, workSessionEvents } from "@trader/db/schema";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";

import type { Tx } from "../core/context";
import { newestStamp, readWorkerEvents } from "../labor/timeline";
import {
  workDate as workDateOf,
  deriveSessions,
  type DerivedSession,
} from "../labor/work-date";

// `corrected`: a source in effect is a correction (an edited entry, PRD Office approval).
export type DaySession = {
  workerId: string;
  session: DerivedSession;
  corrected: boolean;
};

// The material facts the foreman sees. No cost: the office's (migration 0018).
export type DayMaterial = Pick<
  typeof materials.$inferSelect,
  "id" | "loggedByUserId" | "description" | "quantity" | "unit" | "loggedAt"
>;

export const dayMaterialColumns = {
  id: materials.id,
  loggedByUserId: materials.loggedByUserId,
  description: materials.description,
  quantity: materials.quantity,
  unit: materials.unit,
  loggedAt: materials.loggedAt,
};

export type JobDay = {
  sessions: DaySession[];
  // Workers with at least one session on the day, in id order, each with the newest receipt
  // stamp of their ledger: their events stamped at or before it are what the day was built
  // from (receipt stamps rise per worker, ARCHITECTURE row 185).
  workers: { workerId: string; ledgerThrough: Date }[];
  // In id order.
  materials: DayMaterial[];
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
    const corrections = new Set(
      events.filter((e) => e.correctsEventId !== null).map((e) => e.id),
    );
    for (const session of kept) {
      const corrected = session.eventSourceIds.some((id) => corrections.has(id));
      sessions.push({ workerId, session, corrected });
    }
    const ledgerThrough = newestStamp(events);
    if (ledgerThrough === null) throw new Error("unreachable: a session has events");
    workers.push({ workerId, ledgerThrough });
  }

  // Device time is business time (PRD, Labor): a material's day is its logged_at's.
  const logged = await tx
    .select(dayMaterialColumns)
    .from(materials)
    .where(
      and(
        eq(materials.jobId, jobId),
        gte(materials.loggedAt, windowStart(workDate, timeZone)),
        lt(materials.loggedAt, windowEnd(workDate, timeZone)),
      ),
    );
  const onDay = onDayInIdOrder(logged, workDate, timeZone);

  return { sessions, workers, materials: onDay };
}

// The rows whose logged_at falls on the day in the zone, in id order.
export function onDayInIdOrder(
  rows: readonly DayMaterial[],
  workDate: string,
  timeZone: string,
): DayMaterial[] {
  return rows
    .filter((m) => workDateOf(m.loggedAt, timeZone) === workDate)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Whether a closeout of `jobId` covers the instant `at`: its date judged in each closeout's
// own stored zone, never the company's current one, so a later zone change cannot move a
// record into or out of a closed day. Consumed by sync/labor.ts, sync/material.ts and
// materials/correct.ts.
export async function closedOn(tx: Tx, jobId: string, at: Date): Promise<boolean> {
  const { rows } = await tx.execute<{ closed: boolean }>(sql`
    select exists (
      select 1 from day_closeouts c
      where c.job_id = ${jobId}
        and c.work_date = (${at.toISOString()}::timestamptz at time zone c.timezone)::date
    ) as closed
  `);
  return rows[0]?.closed === true;
}
