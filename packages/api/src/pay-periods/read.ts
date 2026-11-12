// payPeriod.read (PRD, Office review: a reconciliation view lists, for a pay period, every
// worker's approved hours by day and job, everything still unresolved, and every adjustment
// the period carries from earlier ones; ARCHITECTURE, Accounting and exports). One period:
//   - `approved`, its own hours per worker, job and work date;
//   - `adjustments`, the signed lines it carries from earlier closed periods;
//   - `unresolved`, the cells on its dates with a session waiting, rejected or still open.
// For a closed period the first two are the lines its close stored, read back and never
// derived again: they are what the payroll export prints, and they are the same answer
// whatever is approved, corrected or repaired afterwards. For an open period they are what a
// close would store now (lines.ts over the one derivation) — a preview that moves with the
// ledger. Adjustments join the next period to close, so an open period that is not the
// earliest open one previews none and names the period that will carry them. `unresolved` is
// always the ledger as it stands: on a closed period it is what will still arrive as an
// adjustment; what the closer acknowledged is on `period.closed`.
//
// Hours are integer hundredths; every total is a sum of lines, added here and never rounded
// again. Names are today's. Plain reads under RLS: no lock, no write, no audit row; the
// calendar and its lines are one statement (periods.ts), the ledger another, which may be
// newer. Consumed by routers/pay-period.ts.
import { jobs, users } from "@trader/db/schema";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { companyZone } from "../labor/day-hours";
import { companyDayHours } from "./close";
import { closeLines, lineOrder, unresolvedIn, type Line } from "./lines";
import { period, readCalendar, type Period } from "./periods";

export const readInput = z.strictObject({ periodId: z.uuid() });

const named = z.strictObject({ id: z.uuid(), name: z.string() });
const line = z.strictObject({
  worker: named,
  job: named,
  workDate: z.iso.date(),
  // Hundredths of an hour. Positive in `approved`; signed in `adjustments`.
  hundredths: z.number().int(),
});

export const readOutput = z.strictObject({
  // The zone every work date here was judged in.
  timezone: z.string(),
  period,
  approved: z.strictObject({
    // By work date, then worker id, then job id.
    cells: z.array(line),
    // Each worker with a cell above and the sum of their cells, by name then id.
    workers: z.array(z.strictObject({ worker: named, hundredths: z.number().int() })),
    total: z.number().int(),
  }),
  adjustments: z.strictObject({
    // By work date, then worker id, then job id. In no total above.
    lines: z.array(line),
    // Signed.
    total: z.number().int(),
    // An open period that is not the next to close: the period that will carry them.
    carriedBy: period.nullable(),
  }),
  unresolved: z.strictObject({
    cells: z.array(
      z.strictObject({
        worker: named,
        job: named,
        workDate: z.iso.date(),
        pendingHundredths: z.number().int(),
        pendingSessions: z.number().int(),
        rejectedSessions: z.number().int(),
        openSessions: z.number().int(),
      }),
    ),
    // What a close must acknowledge: the sums of the cells' waiting and open sessions.
    pendingSessions: z.number().int(),
    openSessions: z.number().int(),
  }),
});

export type ReadOutput = z.infer<typeof readOutput>;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sum(lines: readonly { hundredths: number }[]): number {
  const total = lines.reduce((n, l) => n + l.hundredths, 0);
  if (!Number.isSafeInteger(total)) {
    throw new Error("a total of hours is a whole number of hundredths");
  }
  return total;
}

export async function readPeriod(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof readInput>,
): Promise<ReadOutput> {
  const { periods, lines } = await readCalendar(tx);
  const target = periods.find((p) => p.id === input.periodId);
  // Another tenant's period, under RLS, is not visible: the gate's answer.
  if (target === undefined) throw forbidden();
  const timezone = await companyZone(tx, user.companyId);
  const cells = await companyDayHours(tx, timezone);

  let own: Line[];
  let carried: Line[];
  let carriedBy: Period | null = null;
  if (target.closed !== null) {
    const stored = lines.filter((l) => l.periodId === target.id).sort(lineOrder);
    own = stored.filter((l) => l.workDate >= target.startsOn);
    carried = stored.filter((l) => l.workDate < target.startsOn);
  } else {
    const preview = closeLines(
      cells,
      lines,
      target,
      periods.filter((p) => p.closed !== null),
    );
    own = preview.own;
    const next = periods.find((p) => p.closed === null);
    if (next === undefined || next.id === target.id) {
      carried = preview.adjustments;
    } else {
      carried = [];
      carriedBy = next;
    }
  }

  const waiting = cells
    .filter(
      (c) =>
        c.workDate >= target.startsOn &&
        c.workDate <= target.endsOn &&
        c.pendingSessions + c.rejectedSessions + c.openSessions > 0,
    )
    .sort(
      (a, b) =>
        compare(a.workDate, b.workDate) ||
        compare(a.workerId, b.workerId) ||
        compare(a.jobId, b.jobId),
    );

  const everyone = [...own, ...carried, ...waiting];
  const names = async (table: typeof users | typeof jobs, ids: string[]) =>
    new Map(
      ids.length === 0
        ? []
        : (
            await tx
              .select({ id: table.id, name: table.name })
              .from(table)
              .where(inArray(table.id, ids))
          ).map((r) => [r.id, r.name] as const),
    );
  const workerNames = await names(users, [...new Set(everyone.map((l) => l.workerId))]);
  const jobNames = await names(jobs, [...new Set(everyone.map((l) => l.jobId))]);
  const nameOf = (of: Map<string, string>, id: string) => {
    const name = of.get(id);
    if (name === undefined) throw new Error(`a referenced row is not visible: ${id}`);
    return { id, name };
  };
  const shown = (l: Line) => ({
    worker: nameOf(workerNames, l.workerId),
    job: nameOf(jobNames, l.jobId),
    workDate: l.workDate,
    hundredths: l.hundredths,
  });

  const workers = [...new Set(own.map((l) => l.workerId))]
    .map((id) => ({
      worker: nameOf(workerNames, id),
      hundredths: sum(own.filter((l) => l.workerId === id)),
    }))
    .sort(
      (a, b) =>
        compare(a.worker.name.toLowerCase(), b.worker.name.toLowerCase()) ||
        compare(a.worker.id, b.worker.id),
    );

  return {
    timezone,
    period: target,
    approved: { cells: own.map(shown), workers, total: sum(own) },
    adjustments: { lines: carried.map(shown), total: sum(carried), carriedBy },
    unresolved: {
      cells: waiting.map((c) => ({
        worker: nameOf(workerNames, c.workerId),
        job: nameOf(jobNames, c.jobId),
        workDate: c.workDate,
        pendingHundredths: c.pendingHundredths,
        pendingSessions: c.pendingSessions,
        rejectedSessions: c.rejectedSessions,
        openSessions: c.openSessions,
      })),
      ...unresolvedIn(cells, target),
    },
  };
}
