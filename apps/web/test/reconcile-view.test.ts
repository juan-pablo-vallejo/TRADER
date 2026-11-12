// The reconciliation screen's layout of a `labor.hours` answer (PRD, Office review and job
// cost: approved hours by day and job, and everything still unresolved): which cells stand
// under a person and which stand apart. The totals shown are the server's, carried as given.
import { describe, expect, it } from "vitest";

import {
  approvedByPerson,
  DATES,
  defaultChoice,
  periodByPerson,
  unresolved,
  type Calendar,
  type Cell,
  type Hours,
  type PeriodRead,
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

describe("a pay period's own hours", () => {
  const line = (
    worker: Cell["worker"],
    job: Cell["job"],
    workDate: string,
    hundredths: number,
  ) => ({ worker, job, workDate, hundredths });

  // As the server orders it: lines by date, worker, job; workers by name. Tom's sum is given
  // as 999 where his lines come to 800, to show it is carried, not recomputed.
  const read: PeriodRead = {
    timezone: "America/New_York",
    period: {
      id: "00000000-0000-7000-8000-0000000000a1",
      startsOn: "2026-10-05",
      endsOn: "2026-10-11",
      closed: null,
    },
    approved: {
      cells: [
        line(ana, J, "2026-10-05", 200),
        line(ana, K, "2026-10-05", 600),
        line(tom, J, "2026-10-05", 800),
        line(ana, J, "2026-10-06", 650),
      ],
      workers: [
        { worker: ana, hundredths: 1450 },
        { worker: tom, hundredths: 999 },
      ],
      total: 2449,
    },
    adjustments: {
      lines: [line(tom, K, "2026-09-30", -50)],
      total: -50,
      carriedBy: null,
    },
    unresolved: { cells: [], pendingSessions: 0, openSessions: 0 },
  };

  it("stand under each person in the server's order, with the server's sums", () => {
    expect(periodByPerson(read)).toEqual([
      {
        worker: ana,
        approvedHundredths: 1450,
        cells: [
          { workDate: "2026-10-05", job: J, approvedHundredths: 200 },
          { workDate: "2026-10-05", job: K, approvedHundredths: 600 },
          { workDate: "2026-10-06", job: J, approvedHundredths: 650 },
        ],
      },
      {
        worker: tom,
        approvedHundredths: 999,
        cells: [{ workDate: "2026-10-05", job: J, approvedHundredths: 800 }],
      },
    ]);
  });

  it("never take in an adjustment line", () => {
    const shown = JSON.stringify(periodByPerson(read));
    expect(shown).not.toContain("2026-09-30");
    expect(shown).not.toContain("-50");
  });
});

describe("what the view opens on", () => {
  const dana = { id: "00000000-0000-7000-8000-00000000000d", name: "Dana" };
  const period = (n: number, startsOn: string, endsOn: string, closed = false) => ({
    id: `00000000-0000-7000-8000-0000000000b${n}`,
    startsOn,
    endsOn,
    closed: closed
      ? {
          at: new Date("2026-11-03T15:00:00Z"),
          by: dana,
          unresolved: { pendingSessions: 0, openSessions: 0 },
        }
      : null,
  });
  // Newest first, as the server answers.
  const calendar = (...periods: ReturnType<typeof period>[]): Calendar => ({
    timezone: "America/New_York",
    today: "2026-11-12",
    periods,
  });
  const W1 = period(1, "2026-10-26", "2026-11-01", true);
  const W2 = period(2, "2026-11-02", "2026-11-08");
  const W3 = period(3, "2026-11-09", "2026-11-15");

  it("is the next period to close: the earliest still open", () => {
    expect(defaultChoice(calendar(W3, W2, W1), null)).toBe(W2.id);
  });

  it("is the latest period when none is open, and a range of dates when there is none", () => {
    expect(defaultChoice(calendar(W1), null)).toBe(W1.id);
    expect(defaultChoice(calendar(), null)).toBe(DATES);
  });

  it("is the period the address names, when the calendar has it", () => {
    expect(defaultChoice(calendar(W3, W2, W1), W1.id)).toBe(W1.id);
    expect(defaultChoice(calendar(W3, W2, W1), crypto.randomUUID())).toBe(W2.id);
  });
});
