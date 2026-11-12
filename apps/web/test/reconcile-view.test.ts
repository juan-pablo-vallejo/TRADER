// The reconciliation screen's layout of a `labor.hours` answer (PRD, Office review and job
// cost: approved hours by day and job, and everything still unresolved): which cells stand
// under a person and which stand apart. The totals shown are the server's, carried as given.
import { describe, expect, it } from "vitest";

import {
  approvedByPerson,
  unresolved,
  type Cell,
  type Hours,
} from "../src/app/reconciliation/reconcile-view";

const ana = { id: "00000000-0000-7000-8000-00000000000a", name: "Ana" };
const tom = { id: "00000000-0000-7000-8000-00000000000b", name: "Tom" };
const J = { id: "00000000-0000-7000-8000-0000000000f1", name: "Kitchen" };
const K = { id: "00000000-0000-7000-8000-0000000000f2", name: "Porch" };

const cell = (
  worker: Cell["worker"],
  job: Cell["job"],
  workDate: string,
  figures: Partial<Cell> = {},
): Cell => ({
  worker,
  job,
  workDate,
  approvedHundredths: 0,
  pendingHundredths: 0,
  pendingSessions: 0,
  rejectedSessions: 0,
  openSessions: 0,
  ...figures,
});

// As the server orders it: cells by date, worker, job; workers by name. Tom's total is given
// as 999 where his cells come to 800, to show it is carried, not recomputed.
const answer: Hours = {
  timezone: "America/New_York",
  cells: [
    cell(ana, J, "2026-10-05", { approvedHundredths: 200 }),
    cell(ana, K, "2026-10-05", { approvedHundredths: 350, rejectedSessions: 1 }),
    cell(tom, J, "2026-10-05", { approvedHundredths: 800 }),
    cell(ana, J, "2026-10-06", { pendingHundredths: 850, pendingSessions: 1 }),
    cell(tom, J, "2026-10-06", { openSessions: 1 }),
  ],
  workers: [
    {
      worker: ana,
      approvedHundredths: 550,
      pendingHundredths: 850,
      pendingSessions: 1,
      rejectedSessions: 1,
      openSessions: 0,
    },
    {
      worker: tom,
      approvedHundredths: 999,
      pendingHundredths: 0,
      pendingSessions: 0,
      rejectedSessions: 0,
      openSessions: 1,
    },
  ],
  totals: {
    approvedHundredths: 1549,
    pendingHundredths: 850,
    pendingSessions: 1,
    rejectedSessions: 1,
    openSessions: 1,
  },
};

describe("the reconciliation's layout", () => {
  it("puts each person's cells with approved hours under them, with the server's total", () => {
    const people = approvedByPerson(answer);
    expect(people.map((p) => [p.worker.name, p.approvedHundredths])).toEqual([
      ["Ana", 550],
      ["Tom", 999],
    ]);
    expect(
      people.map((p) =>
        p.cells.map((c) => [c.workDate, c.job.name, c.approvedHundredths]),
      ),
    ).toEqual([
      [
        ["2026-10-05", "Kitchen", 200],
        ["2026-10-05", "Porch", 350],
      ],
      [["2026-10-05", "Kitchen", 800]],
    ]);
  });

  it("keeps a day with nothing approved out of the approved hours, and a person with none", () => {
    const pendingOnly: Hours = {
      ...answer,
      cells: [answer.cells[3]!],
      workers: [{ ...answer.workers[0]!, approvedHundredths: 0 }],
    };
    expect(approvedByPerson(pendingOnly)).toEqual([]);
    expect(unresolved(pendingOnly)).toEqual([answer.cells[3]]);
  });

  it("lists apart every cell with something waiting, rejected or open, in the server's order", () => {
    expect(
      unresolved(answer).map((c) => [c.worker.name, c.job.name, c.workDate]),
    ).toEqual([
      ["Ana", "Porch", "2026-10-05"],
      ["Ana", "Kitchen", "2026-10-06"],
      ["Tom", "Kitchen", "2026-10-06"],
    ]);
    // A cell can be in both: its approved hours count, and a rejected session does not.
    expect(approvedByPerson(answer)[0]!.cells).toContain(answer.cells[1]);
  });

  it("is empty for an answer with no cells", () => {
    const none: Hours = {
      ...answer,
      cells: [],
      workers: [],
      totals: { ...answer.totals, approvedHundredths: 0 },
    };
    expect(approvedByPerson(none)).toEqual([]);
    expect(unresolved(none)).toEqual([]);
  });
});
