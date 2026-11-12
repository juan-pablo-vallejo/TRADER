// How the reconciliation screen lays out `labor.hours`' answer (PRD, Office review and job
// cost: every worker's approved hours by day and job, and everything still unresolved).
// Pure, and no arithmetic: each person's total and the range's are the server's `workers`
// and `totals` (labor/day-hours.ts); this module only places cells — a cell with approved
// hours under its person, a cell with anything waiting, rejected or open in the list kept
// apart. One cell can be in both: its approved hours count, and something of that day does
// not. Consumed by reconciliation-screen.tsx.
import type { AppRouter } from "@trader/api";
import type { inferRouterOutputs } from "@trpc/server";

export type Hours = inferRouterOutputs<AppRouter>["labor"]["hours"];
export type Cell = Hours["cells"][number];

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
