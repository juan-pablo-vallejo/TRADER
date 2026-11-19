// The Hours screen's layout of a `labor.hours` answer: which cells stand
// under a person and which stand apart. The totals shown are the server's, carried as given.
import { describe, expect, it } from "vitest";

import {
  hoursByPerson,
  stillOpen,
  type Cell,
  type Hours,
} from "../src/app/hours/hours-view";

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
  hundredths: 0,
  openSessions: 0,
  flags: [],
  ...figures,
});

// As the server orders it: cells by date, worker, job; workers by name. Tom's total is given
// as 999 where his cells come to 800, to show it is carried, not recomputed.
const answer: Hours = {
  timezone: "America/New_York",
  cells: [
    cell(ana, J, "2026-10-05", { hundredths: 200 }),
    cell(ana, K, "2026-10-05", { hundredths: 350, openSessions: 1 }),
    cell(tom, J, "2026-10-05", { hundredths: 800 }),
    cell(ana, J, "2026-10-06", { hundredths: 850, flags: ["offline", "corrected"] }),
    cell(tom, J, "2026-10-06", { openSessions: 1 }),
  ],
  workers: [
    { worker: ana, hundredths: 1400, openSessions: 1 },
    { worker: tom, hundredths: 999, openSessions: 1 },
  ],
  totals: { hundredths: 2399, openSessions: 2 },
};

describe("the Hours screen's layout", () => {
  it("puts each person's cells with hours under them, with the server's total", () => {
    const people = hoursByPerson(answer);
    expect(people.map((p) => [p.worker.name, p.hundredths])).toEqual([
      ["Ana", 1400],
      ["Tom", 999],
    ]);
    expect(
      people.map((p) => p.cells.map((c) => [c.workDate, c.job.name, c.hundredths])),
    ).toEqual([
      [
        ["2026-10-05", "Kitchen", 200],
        ["2026-10-05", "Porch", 350],
        ["2026-10-06", "Kitchen", 850],
      ],
      [["2026-10-05", "Kitchen", 800]],
    ]);
    // A flagged day counts like any other, and its flags come through as answered.
    expect(people[0]!.cells[2]!.flags).toEqual(["offline", "corrected"]);
  });

  it("keeps a day with no hours yet out of the hours, and a person with none", () => {
    const openOnly: Hours = {
      ...answer,
      cells: [answer.cells[4]!],
      workers: [{ ...answer.workers[1]!, hundredths: 0 }],
    };
    expect(hoursByPerson(openOnly)).toEqual([]);
    expect(stillOpen(openOnly)).toEqual([answer.cells[4]]);
  });

  it("lists apart every cell with a session still open, in the server's order", () => {
    expect(stillOpen(answer).map((c) => [c.worker.name, c.job.name, c.workDate])).toEqual(
      [
        ["Ana", "Porch", "2026-10-05"],
        ["Tom", "Kitchen", "2026-10-06"],
      ],
    );
    // A cell can be in both: its ended sessions count, and the open one does not yet.
    expect(hoursByPerson(answer)[0]!.cells).toContain(answer.cells[1]);
  });

  it("is empty for an answer with no cells", () => {
    const none: Hours = {
      ...answer,
      cells: [],
      workers: [],
      totals: { hundredths: 0, openSessions: 0 },
    };
    expect(hoursByPerson(none)).toEqual([]);
    expect(stillOpen(none)).toEqual([]);
  });
});
