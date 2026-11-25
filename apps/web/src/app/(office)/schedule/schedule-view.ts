// What the Weekly Schedule screen works out from `assignment.week` before it draws anything.
// Pure: no React, no request. This module only groups what the server answered and puts a
// refusal into words. The server judges every save.
import type { AppRouter } from "@trader/api";
import type { Issue } from "@trader/api/eligibility";
import type { inferRouterOutputs } from "@trpc/server";

import type { Catalog } from "../../i18n/en";
import type { Formatters } from "../../format";
import { compareNames, instantToWall, isDay, mondayOf } from "@trader/api/contract";

type Outputs = inferRouterOutputs<AppRouter>["assignment"];
export type Week = Outputs["week"];
export type WeekShift = Week["shifts"][number];
export type CopyPreview = Outputs["copyPreview"];
export type { Issue };

// The schedule's place, kept in the address (use-url-filters.ts) as Hours keeps its own: a
// reload, Back or a pasted link shows the same week, day, view and person. This week, by
// employee and everyone are the defaults, so the plain address is the plain screen.
export type View = "employee" | "jobsite";
export const SCHEDULE_FILTERS = { week: "", day: "", view: "employee", who: "" };
type ScheduleFilters = typeof SCHEDULE_FILTERS;

export function scheduleOf(
  filters: ScheduleFilters,
  today: string,
): { weekStart: string; selected: string; view: View; only: string } {
  const thisWeek = mondayOf(today);
  const weekStart =
    isDay(filters.week) && mondayOf(filters.week) === filters.week
      ? filters.week
      : thisWeek;
  // Narrow shows one day: the one named, else today in this week, else the week's Monday.
  const inWeek = isDay(filters.day) && mondayOf(filters.day) === weekStart;
  const selected = inWeek ? filters.day : weekStart === thisWeek ? today : weekStart;
  return {
    weekStart,
    selected,
    view: filters.view === "jobsite" ? "jobsite" : "employee",
    only: filters.who,
  };
}

// A week as the address writes it: this week is no week at all.
export function weekFilter(weekStart: string, today: string): string {
  return weekStart === mondayOf(today) ? "" : weekStart;
}

// The day and the minute it is now on a zone's wall clock: what "today's column" and "the
// time now" mean on a schedule written on the company's clock, wherever the browser is.
export function nowIn(
  timeZone: string,
  at: Date = new Date(),
): { day: string; minute: string } {
  const wall = instantToWall(at, timeZone);
  return { day: wall.slice(0, 10), minute: wall.slice(11, 16) };
}

const minutesOf = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// The hours a new shift opens with. Any other day, the usual day. Today, once the usual
// start has passed: from the next quarter hour to the usual end, or two hours on when that
// has passed too, and never past the day's last minute.
export function offeredTimes(
  day: string,
  now: { day: string; minute: string },
  usual = { start: "07:00", end: "15:30" },
): { start: string; end: string } {
  if (day !== now.day || now.minute <= usual.start) return usual;
  const start = Math.min(23 * 60 + 45, Math.ceil(minutesOf(now.minute) / 15) * 15);
  const end =
    timeOf(start) < usual.end ? usual.end : timeOf(Math.min(23 * 60 + 59, start + 120));
  return { start: timeOf(start), end };
}

// One person's shifts of the week, day by day, each day's in time order: what stands
// beside the shift form, so an overlap is seen before it is saved.
export function personWeek(
  week: Week,
  userId: string,
): { day: string; shifts: WeekShift[] }[] {
  return week.days.map((day) => ({
    day,
    shifts: week.shifts
      .filter((shift) => shift.worker.id === userId && shift.workDate === day)
      .sort(
        (a, b) =>
          (a.expectedStart < b.expectedStart
            ? -1
            : a.expectedStart > b.expectedStart
              ? 1
              : 0) || (a.id < b.id ? -1 : 1),
      ),
  }));
}

export const hoursOf = (
  shift: { expectedStart: string; expectedEnd: string },
  f: Pick<Formatters, "span">,
) => f.span(shift.expectedStart, shift.expectedEnd);

export type Row = {
  id: string;
  name: string;
  // Each day's shifts, by start, end and id.
  days: Map<string, WeekShift[]>;
};

function rows(
  shifts: WeekShift[],
  key: (shift: WeekShift) => { id: string; name: string },
): Row[] {
  const byId = new Map<string, Row>();
  const ordered = [...shifts].sort(
    (a, b) =>
      a.expectedStart.localeCompare(b.expectedStart) ||
      a.expectedEnd.localeCompare(b.expectedEnd) ||
      a.id.localeCompare(b.id),
  );
  for (const shift of ordered) {
    const { id, name } = key(shift);
    let row = byId.get(id);
    if (row === undefined) {
      row = { id, name, days: new Map() };
      byId.set(id, row);
    }
    row.days.set(shift.workDate, [...(row.days.get(shift.workDate) ?? []), shift]);
  }
  return [...byId.values()].sort(
    (a, b) => compareNames(a.name, b.name) || a.id.localeCompare(b.id),
  );
}

// One row per employee with a shift in the week, and every other active employee beneath
// them in name order, so a week can be started from an empty row.
export function byEmployee(
  shifts: WeekShift[],
  people: { id: string; name: string; active: boolean }[],
): Row[] {
  const scheduled = rows(shifts, (shift) => shift.worker);
  const seen = new Set(scheduled.map((r) => r.id));
  const idle = people
    .filter((p) => p.active && !seen.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, days: new Map<string, WeekShift[]>() }));
  return [...scheduled, ...idle].sort(
    (a, b) => compareNames(a.name, b.name) || a.id.localeCompare(b.id),
  );
}

export const byJobsite = (shifts: WeekShift[]): Row[] =>
  rows(shifts, (shift) => shift.job);

// How many different people a jobsite has on a day.
export const peopleOn = (row: Row, day: string) =>
  new Set((row.days.get(day) ?? []).map((shift) => shift.worker.id)).size;

// The other shifts of that person and day a shift at these hours would overlap, with the
// time each shares with it. Both are HH:MM, so text order is time order; ends are excluded.
export function overlapsWith(
  shift: { id: string; start: string; end: string },
  others: WeekShift[],
): { other: WeekShift; start: string; end: string }[] {
  return others
    .filter(
      (o) =>
        o.id !== shift.id && shift.start < o.expectedEnd && o.expectedStart < shift.end,
    )
    .map((other) => ({
      other,
      start: shift.start > other.expectedStart ? shift.start : other.expectedStart,
      end: shift.end < other.expectedEnd ? shift.end : other.expectedEnd,
    }));
}

// The schedule's words, in the language of whoever is reading: handed in, since nothing
// here is a component.
export type Words = Catalog["schedule"];

// A refusal in words. `label` names a shift by what the office sees: its jobsite and hours.
export function issueText(
  s: Words,
  issue: Issue,
  label: (shiftId: string) => string,
  f: Pick<Formatters, "span">,
): string {
  switch (issue.code) {
    case "duplicate_shift":
      return s.issue.duplicate;
    case "overlap":
      return s.issue.overlap(
        label(issue.shiftIds[0]),
        label(issue.shiftIds[1]),
        f.span(issue.start, issue.end),
      );
    case "duplicate_shift_id":
    case "invalid_interval":
      return s.issue.changed;
  }
}

export type Refusal =
  | { code: "schedule"; issues: Issue[] }
  | { code: "authorization"; shiftId: string }
  | { code: "locked" | "stale" | "id_conflict" | "user_inactive" | "job_archived" };

export function refusalText(
  s: Words,
  refusal: Refusal,
  label: (shiftId: string) => string,
  f: Pick<Formatters, "span">,
): string {
  switch (refusal.code) {
    case "schedule":
      return refusal.issues.map((issue) => issueText(s, issue, label, f)).join(" ");
    case "authorization":
      return s.refused.authorization(label(refusal.shiftId));
    case "locked":
      return s.refused.locked;
    case "stale":
    case "id_conflict":
      return s.refused.stale;
    case "user_inactive":
      return s.refused.userInactive;
    case "job_archived":
      return s.refused.jobArchived;
  }
}

export const leftOutText = (
  s: Words,
  reason: CopyPreview["leftOut"][number]["reason"],
): string => s.leftOut[reason];

// The copies that still have shifts in the week on screen: how many, and whether a clock-in
// has locked any of them — which is what decides whether the copy can be undone.
export function copiesIn(shifts: WeekShift[]): {
  copyId: string;
  count: number;
  locked: boolean;
}[] {
  const copies = new Map<string, { copyId: string; count: number; locked: boolean }>();
  for (const shift of shifts) {
    if (shift.copyId === null) continue;
    const copy = copies.get(shift.copyId) ?? {
      copyId: shift.copyId,
      count: 0,
      locked: false,
    };
    copy.count += 1;
    copy.locked ||= shift.locked;
    copies.set(shift.copyId, copy);
  }
  return [...copies.values()].sort((a, b) => a.copyId.localeCompare(b.copyId));
}
