// How the Hours screen lays out `labor.hours`' answer. Pure, and no arithmetic: each
// person's total and the range's are the server's `workers` and `totals`
// (labor/day-hours.ts); this module only places cells: a cell with hours under its person, a cell
// with a session still open in the list kept apart. One cell can be in both. Consumed by hours-screen.tsx.
import type { AppRouter } from "@trader/api";
import type { inferRouterOutputs } from "@trpc/server";

type Outputs = inferRouterOutputs<AppRouter>;
export type Hours = Outputs["labor"]["hours"];
export type Cell = Hours["cells"][number];

export type PersonHours = {
  worker: Cell["worker"];
  // The server's sum of this person's cells, as answered.
  hundredths: number;
  // Their cells with hours, in the server's order: by work date, then job.
  cells: Cell[];
};

// Each person with hours in the range, in the server's order (by name).
export function hoursByPerson(answer: Hours): PersonHours[] {
  return answer.workers
    .filter((w) => w.hundredths > 0)
    .map((w) => ({
      worker: w.worker,
      hundredths: w.hundredths,
      cells: answer.cells.filter((c) => c.worker.id === w.worker.id && c.hundredths > 0),
    }));
}

// The cells with a session still on the clock, in the server's order: none of an open
// session's time is in any figure yet.
export function stillOpen(answer: Hours): Cell[] {
  return answer.cells.filter((c) => c.openSessions > 0);
}
