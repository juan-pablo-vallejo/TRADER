// The one place labor is aggregated from the database, and labor.hours, the office's read of
// it.
//
// readDayHours folds the whole ledger of each worker named (the fold is defined over all of
// it), read in one statement, so a cell is one committed state; the cells are
// labor/hours.ts's, computed there and nowhere else. Plain reads under RLS: no lock, no
// write, and no ledger row is touched.
//
// labor.hours answers the cells of a range of work dates, for the company or one person,
// optionally on one job: hours as rounded hundredths with each cell's flags, sessions still
// open counted beside them and never inside, and the sums of those cells per worker and for
// the whole answer: a total is the sum of rounded cells and is never rounded again, so the
// Hours screen and whatever exports it read one figure and add nothing themselves. The range
// is refused past its bound, never truncated, and there is no limit, so nothing in it is
// left out.
import { entryFlag, companies, jobs, users, entries } from "@trader/db/schema";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { workDay } from "../shifts/write";
import type { Tx } from "../core/context";
import { groupBy } from "../core/group";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { readJob } from "../jobs/list";
import { sessionAccounting } from "./accounting";
import { dayHours, type DayCell } from "./hours";
import { REASON_ORDER } from "../sync/flags";
import { RANGE_REFUSAL, rangeWithinBound } from "./ledger";
import { compareNames } from "../contract/order";

// Every cell of the workers named, whatever its date or job: the caller selects.
export async function readDayHours(
  tx: Tx,
  workerIds: readonly string[],
  timeZone: string,
): Promise<DayCell[]> {
  if (workerIds.length === 0) return [];
  const rows = await tx
    .select()
    .from(entries)
    .where(inArray(entries.workerId, [...workerIds]));

  const ledgers = groupBy(rows, (r) => r.workerId);
  const flags = new Map(rows.map((r) => [r.id, r.flags]));
  return [...ledgers].flatMap(([workerId, ledger]) =>
    dayHours(workerId, sessionAccounting(ledger), timeZone, (id) => flags.get(id) ?? []),
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
    // Only the cells an entry of which carries a flag: every sum below is then of those.
    flagged: z.boolean().optional(),
  })
  .refine(rangeWithinBound, RANGE_REFUSAL);

// The figures of a cell, and of any sum of cells: integer hundredths and counts.
const figures = {
  // Hundredths of an hour: the day's milliseconds, rounded once, half-up.
  hundredths: z.number().int(),
  // Sessions with no clock-out yet: nothing of theirs is above.
  openSessions: z.number().int(),
  // Entries that carry a flag, each counted once.
  flaggedEntries: z.number().int(),
};
type Figures = { [K in keyof typeof figures]: number };

const NOTHING: Figures = { hundredths: 0, openSessions: 0, flaggedEntries: 0 };

// The sum of cells' figures. Each cell was rounded once (hours.ts); nothing is rounded here.
function sumOf(cells: readonly Figures[]): Figures {
  const sum = { ...NOTHING };
  for (const c of cells) {
    sum.hundredths += c.hundredths;
    sum.openSessions += c.openSessions;
    sum.flaggedEntries += c.flaggedEntries;
  }
  if (!Object.values(sum).every(Number.isSafeInteger)) {
    throw new Error("a total of hours is a whole number of hundredths");
  }
  return sum;
}

export const hoursOutput = z.strictObject({
  // The zone every work date here was judged in.
  timezone: z.string(),
  // By work date, then worker id, then job id.
  cells: z.array(
    z.strictObject({
      worker: z.strictObject({ id: z.uuid(), name: z.string() }),
      job: z.strictObject({ id: z.uuid(), name: z.string() }),
      workDate: z.iso.date(),
      ...figures,
      // Every flag of the entries behind the cell, in the enum's order.
      flags: z.array(z.enum(entryFlag.enumValues)),
    }),
  ),
  // Each worker with a cell above and the sum of their cells, by name then id; and that
  // sum day by day, over every job of the day, with the day's flags: a week's row.
  workers: z.array(
    z.strictObject({
      worker: z.strictObject({ id: z.uuid(), name: z.string() }),
      ...figures,
      days: z.array(
        z.strictObject({
          workDate: z.iso.date(),
          ...figures,
          flags: z.array(z.enum(entryFlag.enumValues)),
        }),
      ),
    }),
  ),
  // Every work date with a cell above and the sum of that day's cells, by date: the row
  // that closes a week.
  days: z.array(z.strictObject({ workDate: z.iso.date(), ...figures })),
  // The sum of every cell above.
  totals: z.strictObject(figures),
});

export type HoursOutput = z.infer<typeof hoursOutput>;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const listHours = (
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof hoursInput>,
): Promise<HoursOutput> => readHours(tx, user, input);

// The read itself, over any range: labor.hours bounds its own, the payroll export does not.
export async function readHours(
  tx: Tx,
  user: AppUser,
  input: {
    from: string;
    to: string;
    workerId?: string;
    jobId?: string;
    flagged?: boolean;
  },
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
            .selectDistinct({ id: entries.workerId })
            .from(entries)
            .where(
              and(
                gte(entries.clientTimestamp, sql`${input.from}::date - 1`),
                lt(entries.clientTimestamp, sql`${input.to}::date + 2`),
              ),
            )
        ).map((r) => r.id);

  const kept = (await readDayHours(tx, workerIds, timezone)).filter(
    (c) =>
      c.workDate >= input.from &&
      c.workDate <= input.to &&
      (input.jobId === undefined || c.jobId === input.jobId) &&
      (input.flagged !== true || c.flags.length > 0),
  );
  if (kept.length === 0) {
    return { timezone, cells: [], workers: [], days: [], totals: NOTHING };
  }

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

  const cells = kept
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
      hundredths: c.hundredths,
      openSessions: c.openSessions,
      flaggedEntries: c.flaggedEntries,
      flags: c.flags,
    }));
  // The days of some cells, each with the sum of its cells and the flags any of them holds.
  const byDay = (of: typeof cells) =>
    [...new Set(of.map((c) => c.workDate))].sort(compare).map((workDate) => {
      const those = of.filter((c) => c.workDate === workDate);
      return {
        workDate,
        ...sumOf(those),
        flags: REASON_ORDER.filter((f) => those.some((c) => c.flags.includes(f))),
      };
    });
  const workers = [...workerNames]
    .map(([id, name]) => {
      const theirs = cells.filter((c) => c.worker.id === id);
      return { worker: { id, name }, ...sumOf(theirs), days: byDay(theirs) };
    })
    .sort(
      (a, b) =>
        compareNames(a.worker.name, b.worker.name) || compare(a.worker.id, b.worker.id),
    );
  return {
    timezone,
    cells,
    workers,
    days: byDay(cells).map(({ flags: _, ...day }) => day),
    totals: sumOf(cells),
  };
}
