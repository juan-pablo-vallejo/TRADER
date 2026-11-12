// How the reconciliation screen lays out `labor.hours`' answer (PRD, Office review and job
// cost: every worker's approved hours by day and job, and everything still unresolved).
// Pure, and no arithmetic: each person's total and the range's are the server's `workers`
// and `totals` (labor/day-hours.ts); this module only places cells — a cell with approved
// hours under its person, a cell with anything waiting, rejected or open in the list kept
// apart. One cell can be in both: its approved hours count, and something of that day does
// not.
//
// The same layout serves a pay period (`payPeriod.read`): its own hours arrive as lines per
// worker, job and work date with the server's per-person sums and total, and are placed
// under each person exactly as a range's cells are. Which period the view opens on is
// worked out here from the calendar. Consumed by reconciliation-screen.tsx.
import type { AppRouter } from "@trader/api";
import type { inferRouterOutputs } from "@trpc/server";

type Outputs = inferRouterOutputs<AppRouter>;
export type Hours = Outputs["labor"]["hours"];
export type Cell = Hours["cells"][number];
export type PeriodRead = Outputs["payPeriod"]["read"];
export type Calendar = Outputs["payPeriod"]["list"];

// What the approved table shows of a cell, whichever read it came from.
export type ApprovedCell = Pick<Cell, "workDate" | "job" | "approvedHundredths">;
export type PersonView = {
  worker: Cell["worker"];
  approvedHundredths: number;
  cells: ApprovedCell[];
};
// What the list kept apart shows of a cell.
export type UnresolvedCell = Omit<Cell, "approvedHundredths">;

export type PersonHours = {
  worker: Cell["worker"];
  // The server's sum of this person's cells, as answered.
  approvedHundredths: number;
  // Their cells with approved hours, in the server's order: by work date, then job.
  cells: Cell[];
};

// Each person with approved hours in the range, in the server's order (by name).
export function approvedByPerson(answer: Hours): PersonHours[] {
  return answer.workers
    .filter((w) => w.approvedHundredths > 0)
    .map((w) => ({
      worker: w.worker,
      approvedHundredths: w.approvedHundredths,
      cells: answer.cells.filter(
        (c) => c.worker.id === w.worker.id && c.approvedHundredths > 0,
      ),
    }));
}

// The cells with something that is in no approved figure, in the server's order.
export function unresolved(answer: Hours): Cell[] {
  return answer.cells.filter(
    (c) => c.pendingSessions > 0 || c.rejectedSessions > 0 || c.openSessions > 0,
  );
}

// A period's own hours under each person, in the server's order: `workers` by name, each
// person's lines by work date then job. The sums are the server's, carried as given.
export function periodByPerson(read: PeriodRead): PersonView[] {
  return read.approved.workers.map((w) => ({
    worker: w.worker,
    approvedHundredths: w.hundredths,
    cells: read.approved.cells
      .filter((c) => c.worker.id === w.worker.id)
      .map((c) => ({
        workDate: c.workDate,
        job: c.job,
        approvedHundredths: c.hundredths,
      })),
  }));
}

// The view's other mode: a range of work dates, not a period.
export const DATES = "dates";

// What the view opens on: the period the address names when the calendar has it; otherwise
// the next period to close — the earliest still open, the one the office is working — or,
// with none open, the latest; with no period at all, a range of dates. `periods` is newest
// first.
export function defaultChoice(calendar: Calendar, asked: string | null): string {
  if (asked !== null && calendar.periods.some((p) => p.id === asked)) return asked;
  const open = [...calendar.periods].reverse().find((p) => p.closed === null);
  return open?.id ?? calendar.periods[0]?.id ?? DATES;
}
