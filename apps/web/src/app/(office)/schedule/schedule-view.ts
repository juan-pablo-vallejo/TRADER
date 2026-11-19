// What the Weekly Schedule screen works out from `assignment.week` before it draws anything.
// Pure: no React, no request. This module only groups what the server answered and puts a
// refusal into words. The server judges every save. Consumed by schedule-screen.tsx,
// shift-dialog.tsx and copy-dialog.tsx.
import type { AppRouter } from "@trader/api";
import type { Issue } from "@trader/api/eligibility";
import type { inferRouterOutputs } from "@trpc/server";

import { addDays } from "../../format";
import { strings } from "../../strings";

type Outputs = inferRouterOutputs<AppRouter>["assignment"];
export type Week = Outputs["week"];
export type WeekShift = Week["shifts"][number];
export type CopyPreview = Outputs["copyPreview"];
export type { Issue };

const s = strings.schedule;

// The Monday of the week `day` is in. Calendar arithmetic in UTC: no zone can move it.
export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

export const hoursOf = (shift: { expectedStart: string; expectedEnd: string }) =>
  `${shift.expectedStart}–${shift.expectedEnd}`;

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
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
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
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
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

// A refusal in words. `label` names a shift by what the office sees: its jobsite and hours.
export function issueText(issue: Issue, label: (shiftId: string) => string): string {
  switch (issue.code) {
    case "duplicate_shift":
      return s.issue.duplicate;
    case "overlap":
      return s.issue.overlap(
        label(issue.shiftIds[0]),
        label(issue.shiftIds[1]),
        `${issue.start}–${issue.end}`,
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
  refusal: Refusal,
  label: (shiftId: string) => string,
): string {
  switch (refusal.code) {
    case "schedule":
      return refusal.issues.map((issue) => issueText(issue, label)).join(" ");
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

export const leftOutText = (reason: CopyPreview["leftOut"][number]["reason"]): string =>
  s.leftOut[reason];

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
