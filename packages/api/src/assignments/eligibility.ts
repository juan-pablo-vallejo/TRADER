// A person's shifts on one day, and when a start is admitted on one. Pure: no database, no
// clock, no zone. One person's shifts on one calendar day go in; the day in time order comes
// out, or every reason the day is refused.
//
// A shift is a start and an end on the day's wall clock, to the minute, the start included
// and the end excluded: two shifts that touch do not overlap. Two shifts that overlap are
// refused: one person is on one job at a time.
//
// Times are wall-clock minutes and never instants: a caller places a recorded start by
// reading it as a date and a time in the company's zone and dropping its seconds, which
// loses nothing because every bound here is a whole minute. The repeated hour of a clock
// change is therefore eligible through both passes and the skipped hour never occurs.
//
// A start is admitted by the shift it falls in. At a minute outside every shift, it is
// admitted on the shift that starts next that day when that is at most 15 minutes away
// (`admitStart`). That is leave to start and nothing more: it gives back no time, so the
// session begins when the start was recorded, and it never looks past the day's end at the
// next day's shifts.
//
// The answer does not depend on the order of the shifts.

import { EARLY_MINUTES } from "../contract/clock";

// One person's shift on one day. `start` and `end` are HH:MM on a 24-hour clock.
export type Shift = { id: string; jobId: string; start: string; end: string };

export type Issue =
  | { code: "duplicate_shift_id"; shiftId: string }
  // The end is not after the start: an empty shift, or one across midnight.
  | { code: "invalid_interval"; shiftId: string }
  // The same job, start and end twice.
  | { code: "duplicate_shift"; shiftIds: [string, string] }
  // Two shifts share the time from `start` to `end`.
  | { code: "overlap"; shiftIds: [string, string]; start: string; end: string };

type Segment = { start: string; end: string; shiftId: string; jobId: string };

export type ResolvedDay = {
  result: "resolved";
  // Every shift, in time order.
  timeline: Segment[];
};

export type DayResolution = ResolvedDay | { result: "rejected"; issues: Issue[] };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(time: string): number {
  if (!TIME.test(time)) throw new Error(`a time is HH:MM on a 24-hour clock: ${time}`);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

const two = (n: number) => String(n).padStart(2, "0");
const toTime = (minutes: number) =>
  `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const pairOf = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

// The order issues are answered in: by kind, then by time, then by the shifts named.
const CODES: readonly Issue["code"][] = [
  "duplicate_shift_id",
  "invalid_interval",
  "duplicate_shift",
  "overlap",
];

function sortKey(issue: Issue): string[] {
  const kind = two(CODES.indexOf(issue.code));
  switch (issue.code) {
    case "duplicate_shift_id":
    case "invalid_interval":
      return [kind, "", issue.shiftId];
    case "duplicate_shift":
      return [kind, "", ...issue.shiftIds];
    case "overlap":
      return [kind, issue.start, ...issue.shiftIds];
  }
}

function issueOrder(a: Issue, b: Issue): number {
  const x = sortKey(a);
  const y = sortKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const order = compare(x[i] ?? "", y[i] ?? "");
    if (order !== 0) return order;
  }
  return 0;
}

// Sorted, and each said once: the same fault found twice is one issue.
function rejected(issues: Issue[]): DayResolution {
  const seen = new Set<string>();
  const once = [...issues].sort(issueOrder).filter((issue) => {
    const key = JSON.stringify(issue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { result: "rejected", issues: once };
}

type Placed = { id: string; jobId: string; from: number; to: number };

const overlap = (a: Placed, b: Placed) => a.from < b.to && b.from < a.to;

export function resolveDay(shifts: readonly Shift[]): DayResolution {
  // By start, end and id: the order of the input is gone from here on.
  const placed: Placed[] = shifts
    .map((s) => ({
      id: s.id,
      jobId: s.jobId,
      from: toMinutes(s.start),
      to: toMinutes(s.end),
    }))
    .sort((a, b) => a.from - b.from || a.to - b.to || compare(a.id, b.id));

  // 1. Each shift on its own.
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const s of placed) {
    if (seen.has(s.id)) issues.push({ code: "duplicate_shift_id", shiftId: s.id });
    seen.add(s.id);
    if (s.to <= s.from) issues.push({ code: "invalid_interval", shiftId: s.id });
  }
  for (const [i, a] of placed.entries()) {
    for (const b of placed.slice(i + 1)) {
      if (a.id !== b.id && a.jobId === b.jobId && a.from === b.from && a.to === b.to) {
        issues.push({ code: "duplicate_shift", shiftIds: pairOf(a.id, b.id) });
      }
    }
  }
  if (issues.length > 0) return rejected(issues);

  // 2. No two share a minute.
  for (const [i, a] of placed.entries()) {
    for (const b of placed.slice(i + 1)) {
      if (overlap(a, b)) {
        issues.push({
          code: "overlap",
          shiftIds: pairOf(a.id, b.id),
          start: toTime(Math.max(a.from, b.from)),
          end: toTime(Math.min(a.to, b.to)),
        });
      }
    }
  }
  if (issues.length > 0) return rejected(issues);

  return {
    result: "resolved",
    timeline: placed.map((s) => ({
      start: toTime(s.from),
      end: toTime(s.to),
      shiftId: s.id,
      jobId: s.jobId,
    })),
  };
}

type StartAdmission =
  // The start falls in this shift.
  | { result: "scheduled"; shiftId: string; jobId: string }
  // It falls in none, and this one starts next, `minutesEarly` from now: 1 to 15.
  | { result: "early"; shiftId: string; jobId: string; minutesEarly: number }
  | { result: "none" };

// Whether a start at `at`, HH:MM on the day that was resolved, is admitted, and on which
// shift. The seconds of the recorded time are dropped by the caller, never rounded up.
export function admitStart(day: ResolvedDay, at: string): StartAdmission {
  const minute = toMinutes(at);
  // In time order: the first shift that has not ended is the one `at` is in, or the next.
  const segment = day.timeline.find((s) => toMinutes(s.end) > minute);
  if (segment === undefined) return { result: "none" };
  const { shiftId, jobId } = segment;
  const minutesEarly = toMinutes(segment.start) - minute;
  if (minutesEarly <= 0) return { result: "scheduled", shiftId, jobId };
  if (minutesEarly <= EARLY_MINUTES)
    return { result: "early", shiftId, jobId, minutesEarly };
  return { result: "none" };
}
