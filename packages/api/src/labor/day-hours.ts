// The one place labor is aggregated from the database (ARCHITECTURE, Accounting and exports,
// Rounding: one figure from one derivation), and labor.hours, the office's read of it.
//
// readDayHours folds the whole ledger of each worker named — the fold is defined over all of
// it — with each event's approval, read in one statement, so a cell is one committed state;
// the cells are labor/hours.ts's, computed there and nowhere else. Plain reads under RLS: no
// lock, no write, no audit row, and no ledger row is touched.
//
// labor.hours answers the cells of a range of work dates, for the company or one person,
// optionally on one job: approved hours as rounded hundredths, with what is pending, rejected
// or still open beside them and never inside. No cost and no rate (jobs/cost.ts). The range
// is refused past its bound, never truncated, and there is no limit, so nothing in it is left
// out. Consumed by routers/labor.ts and jobs/cost.ts.
import { approvals, companies, jobs, users, workSessionEvents } from "@trader/db/schema";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { workDay } from "../assignments/write";
import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { readJob } from "../jobs/list";
import { sessionApprovals, type Decision } from "./approval";
import type { LaborEvent } from "./fold";
import { dayHours, type DayCell } from "./hours";
import { RANGE_REFUSAL, rangeWithinBound } from "./ledger";

// Every cell of the workers named, whatever its date or job: the caller selects.
export async function readDayHours(
  tx: Tx,
  workerIds: readonly string[],
  timeZone: string,
): Promise<DayCell[]> {
  if (workerIds.length === 0) return [];
  const rows = await tx
    .select({
      event: workSessionEvents,
      decision: approvals.decision,
      approvalId: approvals.id,
    })
    .from(workSessionEvents)
    .leftJoin(approvals, eq(approvals.eventId, workSessionEvents.id))
    .where(inArray(workSessionEvents.workerId, [...workerIds]));

  const ledgers = new Map<
    string,
    { ledger: LaborEvent[]; decisions: Map<string, Decision> }
  >();
  for (const r of rows) {
    let w = ledgers.get(r.event.workerId);
    if (w === undefined) {
      w = { ledger: [], decisions: new Map() };
      ledgers.set(r.event.workerId, w);
    }
    w.ledger.push(r.event);
    // No approvals row is approved by default: absent from the map (approval.ts).
    if (r.approvalId !== null) w.decisions.set(r.event.id, r.decision);
  }
  return [...ledgers].flatMap(([workerId, w]) =>
    dayHours(workerId, sessionApprovals(w.ledger, w.decisions), timeZone),
  );
}

export async function companyZone(tx: Tx, companyId: string): Promise<string> {
  const [company] = await tx
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId));
  if (company === undefined) throw new Error("the caller's company is not visible");
  return company.timezone;
}

export const hoursInput = z
  .strictObject({
    from: workDay,
    to: workDay,
    workerId: z.uuid().optional(),
    jobId: z.uuid().optional(),
  })
  .refine(rangeWithinBound, RANGE_REFUSAL);

export const hoursOutput = z.strictObject({
  // The zone every work date here was judged in.
  timezone: z.string(),
  // By work date, then worker id, then job id.
  cells: z.array(
    z.strictObject({
      worker: z.strictObject({ id: z.uuid(), name: z.string() }),
      job: z.strictObject({ id: z.uuid(), name: z.string() }),
      workDate: z.iso.date(),
      // Hundredths of an hour: the day's approved milliseconds, rounded once, half-up.
      approvedHundredths: z.number().int(),
      // Waiting for a decision; in no approved figure.
      pendingHundredths: z.number().int(),
      pendingSessions: z.number().int(),
      rejectedSessions: z.number().int(),
      // Sessions that count but have no clock-out yet: nothing of theirs is above.
      openSessions: z.number().int(),
    }),
  ),
});

export type HoursOutput = z.infer<typeof hoursOutput>;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function listHours(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof hoursInput>,
): Promise<HoursOutput> {
  // A person or a job that is not visible (another tenant's, under RLS) is the one FORBIDDEN,
  // never an empty answer that could be read as "nothing recorded".
  if (input.workerId !== undefined) {
    const [worker] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.workerId));
    if (worker === undefined) throw forbidden();
  }
  if (input.jobId !== undefined && (await readJob(tx, input.jobId)) === undefined) {
    throw forbidden();
  }
  const timezone = await companyZone(tx, user.companyId);

  // Who could have a session in the range: a session starts at its effective start's
  // recorded time, so its worker has an event recorded within the range's days in any zone —
  // a day either side covers every offset. Their whole ledgers are then folded.
  const workerIds =
    input.workerId !== undefined
      ? [input.workerId]
      : (
          await tx
            .selectDistinct({ id: workSessionEvents.workerId })
            .from(workSessionEvents)
            .where(
              and(
                gte(workSessionEvents.clientTimestamp, sql`${input.from}::date - 1`),
                lt(workSessionEvents.clientTimestamp, sql`${input.to}::date + 2`),
              ),
            )
        ).map((r) => r.id);

  const kept = (await readDayHours(tx, workerIds, timezone)).filter(
    (c) =>
      c.workDate >= input.from &&
      c.workDate <= input.to &&
      (input.jobId === undefined || c.jobId === input.jobId),
  );
  if (kept.length === 0) return { timezone, cells: [] };

  const names = async (table: typeof users | typeof jobs, ids: string[]) =>
    new Map(
      (
        await tx
          .select({ id: table.id, name: table.name })
          .from(table)
          .where(inArray(table.id, ids))
      ).map((r) => [r.id, r.name]),
    );
  const workerNames = await names(users, [...new Set(kept.map((c) => c.workerId))]);
  const jobNames = await names(jobs, [...new Set(kept.map((c) => c.jobId))]);
  const named = (of: Map<string, string>, id: string) => {
    const name = of.get(id);
    if (name === undefined) throw new Error(`a referenced row is not visible: ${id}`);
    return { id, name };
  };

  return {
    timezone,
    cells: kept
      .sort(
        (a, b) =>
          compare(a.workDate, b.workDate) ||
          compare(a.workerId, b.workerId) ||
          compare(a.jobId, b.jobId),
      )
      .map((c) => ({
        worker: named(workerNames, c.workerId),
        job: named(jobNames, c.jobId),
        workDate: c.workDate,
        approvedHundredths: c.approvedHundredths,
        pendingHundredths: c.pendingHundredths,
        pendingSessions: c.pendingSessions,
        rejectedSessions: c.rejectedSessions,
        openSessions: c.openSessions,
      })),
  };
}
