// How the Hours screen lays out `labor.hours`' answer, and which dates it asks for. Pure,
// and no arithmetic on hours: every figure shown is a field of the server's answer
// (labor/day-hours.ts: a cell, a person's day, a person's sum, a day's sum, the total).
// This module only places them: a person's days into the columns of a week, a cell with
// hours under its person in a list, a cell with a session still open in the strip above.
import type { AppRouter } from "@trader/api";
import type { inferRouterOutputs } from "@trpc/server";

import { addDays } from "../../format";
import { mondayOf } from "../schedule/schedule-view";

type Outputs = inferRouterOutputs<AppRouter>;
export type Hours = Outputs["labor"]["hours"];
export type Cell = Hours["cells"][number];
export type Day = Hours["workers"][number]["days"][number];

// The longest range the server reads at once (labor/ledger.ts).
export const MAX_RANGE_DAYS = 31;

// What the address holds (use-url-filters.ts). `range` is a preset or `dates`, and then
// `from` and `to` are the dates; `flagged` is "1" for flagged only. The plain address is
// this week, everything. `person` narrows the screen to one person's hours (their id), as
// the link in their panel on People does.
export const HOURS_FILTERS = { range: "this", from: "", to: "", flagged: "", person: "" };
type HoursFilters = typeof HOURS_FILTERS;

// A person and a day in the address: the day panel a cell opens. Both or neither.
export const DAY_FILTERS = { who: "", day: "" };

// The panel the address asks for, or null: a person's id and a date, both well formed.
export function panelOf(
  filters: typeof DAY_FILTERS,
): { workerId: string; day: string } | null {
  return /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(filters.who) &&
    isDay(filters.day)
    ? { workerId: filters.who, day: filters.day }
    : null;
}

export type Range = { from: string; to: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value: string) =>
  DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

// Monday to Sunday around a day.
export function weekOf(day: string): Range {
  const from = mondayOf(day);
  return { from, to: addDays(from, 6) };
}

// The dates the address asks for, or null when it asks for none the server would read:
// dates that are not dates, a range that runs backward, or one past the bound. An unknown
// preset is this week, as the plain address is.
export function rangeOf(filters: HoursFilters, today: string): Range | null {
  if (filters.range === "last") return weekOf(addDays(today, -7));
  if (filters.range !== "dates") return weekOf(today);
  const { from, to } = filters;
  if (!isDay(from) || !isDay(to)) return null;
  if (from > to || to > addDays(from, MAX_RANGE_DAYS - 1)) return null;
  return { from, to };
}

// Every day of a range, in order.
export function daysIn(range: Range): string[] {
  const days: string[] = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) days.push(day);
  return days;
}

// A week is drawn as a table of people by days: any seven days in a row.
export const isWeek = (range: Range) => addDays(range.from, 6) === range.to;

export type WeekRow = {
  worker: Cell["worker"];
  // The person's sum for the range, as the server answered it.
  hundredths: number;
  // One per day of the range, in order: the server's figure for that day, or null for a
  // day with nothing of theirs.
  days: (Day | null)[];
};

// Each person of the answer as a row of the week, in the server's order (by name).
export function weekRows(answer: Hours, days: readonly string[]): WeekRow[] {
  return answer.workers.map((w) => ({
    worker: w.worker,
    hundredths: w.hundredths,
    days: days.map((day) => w.days.find((d) => d.workDate === day) ?? null),
  }));
}

// The closing row: the server's sum for each day of the range, or null for a day with
// nothing.
export function weekTotals(
  answer: Hours,
  days: readonly string[],
): (Hours["days"][number] | null)[] {
  return days.map((day) => answer.days.find((d) => d.workDate === day) ?? null);
}

// The cells with hours, for a range that is not a week: by person (the server's order, by
// name), then by work date and job.
export function listRows(answer: Hours): Cell[] {
  const order = new Map(answer.workers.map((w, index) => [w.worker.id, index]));
  return answer.cells
    .filter((c) => c.hundredths > 0)
    .map((cell, index) => ({ cell, index }))
    .sort(
      (a, b) =>
        (order.get(a.cell.worker.id) ?? 0) - (order.get(b.cell.worker.id) ?? 0) ||
        a.index - b.index,
    )
    .map(({ cell }) => cell);
}

// The cells with a session still on the clock, in the server's order: none of an open
// session's time is in any figure yet.
export function stillOpen(answer: Hours): Cell[] {
  return answer.cells.filter((c) => c.openSessions > 0);
}
