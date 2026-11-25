// The Hours screen's layout of a `labor.hours` answer and the dates it asks for: a week as
// people by days, a longer range as a list, open sessions apart, and the range the address
// names. Every figure is the server's, carried as given.
import { addDays, MAX_RANGE_DAYS } from "@trader/api/contract";
import { describe, expect, it } from "vitest";

import {
  daysIn,
  HOURS_FILTERS,
  isWeek,
  listRows,
  rangeOf,
  stillOpen,
  weekOf,
  weekRows,
  weekTotals,
  type Cell,
  type Hours,
} from "../src/app/(office)/hours/hours-view";
import { readFilters, writeFilters } from "../src/app/use-url-filters";

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
  flaggedEntries: 0,
  flags: [],
  ...figures,
});
const day = (workDate: string, hundredths: number, o: Partial<Cell> = {}) => ({
  workDate,
  hundredths,
  openSessions: 0,
  flaggedEntries: 0,
  flags: [] as Cell["flags"],
  ...o,
});

// As the server orders it: cells by date, worker, job; workers by name. Tom's sums are
// given as 999 where his cells come to 800, to show they are carried, not recomputed.
const answer: Hours = {
  timezone: "America/New_York",
  cells: [
    cell(ana, J, "2026-10-05", { hundredths: 200 }),
    cell(ana, K, "2026-10-05", { hundredths: 350, openSessions: 1 }),
    cell(tom, J, "2026-10-05", { hundredths: 800 }),
    cell(ana, J, "2026-10-06", {
      hundredths: 850,
      flags: ["offline", "corrected"],
      flaggedEntries: 2,
    }),
    cell(tom, J, "2026-10-06", { openSessions: 1 }),
  ],
  workers: [
    {
      worker: ana,
      hundredths: 1400,
      openSessions: 1,
      flaggedEntries: 2,
      days: [
        day("2026-10-05", 550, { openSessions: 1 }),
        day("2026-10-06", 850, { flags: ["offline", "corrected"], flaggedEntries: 2 }),
      ],
    },
    {
      worker: tom,
      hundredths: 999,
      openSessions: 1,
      flaggedEntries: 0,
      days: [day("2026-10-05", 999), day("2026-10-06", 0, { openSessions: 1 })],
    },
  ],
  days: [
    { workDate: "2026-10-05", hundredths: 1350, openSessions: 1, flaggedEntries: 0 },
    { workDate: "2026-10-06", hundredths: 850, openSessions: 1, flaggedEntries: 2 },
  ],
  totals: { hundredths: 2399, openSessions: 2, flaggedEntries: 2 },
};

describe("a week of hours", () => {
  const week = weekOf("2026-10-07");
  const days = daysIn(week);

  it("is Monday to Sunday around a day", () => {
    expect(week).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(weekOf("2026-10-05")).toEqual(week);
    expect(weekOf("2026-10-11")).toEqual(week);
    expect(days).toHaveLength(7);
    expect(isWeek(week)).toBe(true);
    expect(isWeek({ from: "2026-10-05", to: "2026-10-10" })).toBe(false);
    expect(isWeek({ from: "2026-10-07", to: "2026-10-13" })).toBe(true);
  });

  it("puts each person's days in the week's columns, with the server's figures", () => {
    const rows = weekRows(answer, days);
    expect(rows.map((r) => [r.worker.name, r.hundredths])).toEqual([
      ["Ana", 1400],
      ["Tom", 999],
    ]);
    expect(rows.map((r) => r.days.map((d) => d?.hundredths ?? null))).toEqual([
      [550, 850, null, null, null, null, null],
      [999, 0, null, null, null, null, null],
    ]);
    // A day's flags are the server's, in its order.
    expect(rows[0]!.days[1]!.flags).toEqual(["offline", "corrected"]);
  });

  it("closes with the server's sum of each day", () => {
    expect(weekTotals(answer, days).map((d) => d?.hundredths ?? null)).toEqual([
      1350,
      850,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("a longer range", () => {
  it("lists the cells with hours by person, then date and job", () => {
    expect(listRows(answer).map((c) => [c.worker.name, c.workDate, c.job.name])).toEqual([
      ["Ana", "2026-10-05", "Kitchen"],
      ["Ana", "2026-10-05", "Porch"],
      ["Ana", "2026-10-06", "Kitchen"],
      ["Tom", "2026-10-05", "Kitchen"],
    ]);
  });

  it("sets sessions still open apart, whether or not the cell has hours", () => {
    expect(stillOpen(answer).map((c) => [c.worker.name, c.workDate, c.job.name])).toEqual(
      [
        ["Ana", "2026-10-05", "Porch"],
        ["Tom", "2026-10-06", "Kitchen"],
      ],
    );
  });
});

describe("the dates the address asks for", () => {
  const TODAY = "2026-10-07";
  const filters = (over: Partial<typeof HOURS_FILTERS> = {}) => ({
    ...HOURS_FILTERS,
    ...over,
  });

  it("is this week for the plain address, and last week by its name", () => {
    expect(rangeOf(filters(), TODAY)).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(rangeOf(filters({ range: "last" }), TODAY)).toEqual({
      from: "2026-09-28",
      to: "2026-10-04",
    });
    // A preset nobody made is the plain screen, not an error.
    expect(rangeOf(filters({ range: "someday" }), TODAY)).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
    });
  });

  it("is the dates named, up to the bound, and nothing for dates the server would refuse", () => {
    const dates = (from: string, to: string) =>
      rangeOf(filters({ range: "dates", from, to }), TODAY);
    const last = addDays("2026-10-01", MAX_RANGE_DAYS - 1);
    expect(dates("2026-10-01", last)).toEqual({ from: "2026-10-01", to: last });
    expect(dates("2026-10-01", "2026-10-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-01",
    });
    expect(dates("2026-10-01", addDays(last, 1))).toBeNull();
    expect(dates("2026-10-02", "2026-10-01")).toBeNull();
    expect(dates("", "2026-10-01")).toBeNull();
    expect(dates("2026-13-40", "2026-10-01")).toBeNull();
    expect(dates("yesterday", "today")).toBeNull();
  });

  it("survives a reload: the address written is the address read", () => {
    const chosen = filters({
      range: "dates",
      from: "2026-10-01",
      to: "2026-10-14",
      flagged: "1",
    });
    const query = writeFilters(HOURS_FILTERS, chosen);
    expect(query).toBe("?range=dates&from=2026-10-01&to=2026-10-14&flagged=1");
    expect(readFilters(HOURS_FILTERS, new URLSearchParams(query))).toEqual(chosen);
    // The plain screen is the plain address.
    expect(writeFilters(HOURS_FILTERS, filters())).toBe("");
    expect(readFilters(HOURS_FILTERS, new URLSearchParams(""))).toEqual(filters());
    // What the address holds that is no filter of this screen is not read.
    expect(readFilters(HOURS_FILTERS, new URLSearchParams("?who=x&range=last"))).toEqual(
      filters({ range: "last" }),
    );
  });
});
