// Which shift is eligible, and when (PRD, Weekly schedule; ARCHITECTURE, Office authority:
// Weekly schedule, and the 2026-11-15 rows: Shift rules, Early arrival). Pure: no database,
// no clock, no zone. One person's shifts and overlap overrides on one calendar day go in; the
// one eligible shift at every scheduled moment comes out, or every reason the day is refused.
//
// A shift is a start and an end on the day's wall clock, to the minute, the start included
// and the end excluded: two shifts that touch do not overlap. Two shifts that overlap need an
// override naming the one that holds the whole of their shared time, and the overrides may
// not go in a circle. The day is then cut at every start and end; between two neighbouring
// cuts the covering shifts do not change, and the eligible one is the shift that holds
// against every other shift covering that stretch. A shift that holds no stretch has no
// eligible time and is refused as well.
//
// A circle is refused wherever it is, and not only where it leaves time uncovered: three
// shifts that go round always share a moment, and that moment is nobody's unless a fourth
// shift holds against all three there — a day that would stand only until that fourth
// shift is moved. So "no circle" is a rule of its own here, checked before the stretches.
//
// Times are wall-clock minutes and never instants: a caller places a recorded start by
// reading it as a date and a time in the company's zone and dropping its seconds, which
// loses nothing because every bound here is a whole minute. The repeated hour of a clock
// change is therefore eligible through both passes and the skipped hour never occurs.
//
// A start is admitted by the shift eligible at its minute, and by nothing else while one
// is. At a minute no shift is eligible, it is admitted on the shift that becomes eligible
// next that day when that is at most 15 minutes away (`admitStart`). That is leave to start
// and nothing more: it gives back no time, so the session begins when the start was
// recorded, and it never looks past the day's end at the next day's shifts.
//
// The answer does not depend on the order of the shifts or of the overrides.
// Consumed by: nothing yet (TASKS S3's writers, S4's push, the schedule reads).

// One person's shift on one day. `start` and `end` are HH:MM on a 24-hour clock.
export type Shift = { id: string; jobId: string; start: string; end: string };

// A decided overlap: `holderId` keeps the whole of the time the two shifts share.
export type Override = { holderId: string; yieldingId: string };

// HH:MM, the start included and the end excluded.
export type Window = { start: string; end: string };

export type Issue =
  | { code: "duplicate_shift_id"; shiftId: string }
  // The end is not after the start: an empty shift, or one across midnight.
  | { code: "invalid_interval"; shiftId: string }
  // The same job, start and end twice.
  | { code: "duplicate_shift"; shiftIds: [string, string] }
  // An override naming a shift that is not in the day, or one shift twice.
  | { code: "override_unknown_shift"; holderId: string; yieldingId: string }
  // One pair decided more than once, either way round.
  | { code: "override_conflict"; shiftIds: [string, string] }
  | { code: "override_not_overlapping"; shiftIds: [string, string] }
  // Two shifts overlap and nothing says which holds the shared time, `start` to `end`.
  | { code: "missing_decision"; shiftIds: [string, string]; start: string; end: string }
  // The overrides among these three go in a circle. `start` to `end` is the time all three
  // share: nobody's, unless another shift holds against all of them there.
  | {
      code: "circular_precedence";
      shiftIds: [string, string, string];
      start: string;
      end: string;
    }
  | { code: "no_eligible_time"; shiftId: string };

export type Segment = { start: string; end: string; shiftId: string; jobId: string };

export type ResolvedDay = {
  result: "resolved";
  // The covered time alone, in time order; neighbouring stretches of one shift are one.
  timeline: Segment[];
  // Every shift, by start, end and id, with the time it is eligible; never empty.
  shifts: { shiftId: string; jobId: string; windows: Window[] }[];
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

// The order issues are answered in: by kind, then by the shifts named, then by time.
const CODES: readonly Issue["code"][] = [
  "duplicate_shift_id",
  "invalid_interval",
  "duplicate_shift",
  "override_unknown_shift",
  "override_conflict",
  "override_not_overlapping",
  "missing_decision",
  "circular_precedence",
  "no_eligible_time",
];

function sortKey(issue: Issue): string[] {
  const kind = two(CODES.indexOf(issue.code));
  switch (issue.code) {
    case "duplicate_shift_id":
    case "invalid_interval":
    case "no_eligible_time":
      return [kind, "", issue.shiftId];
    case "override_unknown_shift":
      return [kind, "", issue.holderId, issue.yieldingId];
    case "duplicate_shift":
    case "override_conflict":
    case "override_not_overlapping":
      return [kind, "", ...issue.shiftIds];
    case "missing_decision":
    case "circular_precedence":
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

export function resolveDay(
  shifts: readonly Shift[],
  overrides: readonly Override[],
): DayResolution {
  // By start, end and id: the order of the input is gone from here on.
  const placed: Placed[] = shifts
    .map((s) => ({
      id: s.id,
      jobId: s.jobId,
      from: toMinutes(s.start),
      to: toMinutes(s.end),
    }))
    .sort((a, b) => a.from - b.from || a.to - b.to || compare(a.id, b.id));

  // 1. The shifts and the overrides, each on its own.
  const issues: Issue[] = [];
  const byId = new Map<string, Placed>();
  const unsound = new Set<string>();
  for (const s of placed) {
    if (byId.has(s.id)) {
      issues.push({ code: "duplicate_shift_id", shiftId: s.id });
      unsound.add(s.id);
    }
    byId.set(s.id, s);
    if (s.to <= s.from) {
      issues.push({ code: "invalid_interval", shiftId: s.id });
      unsound.add(s.id);
    }
  }
  for (const [i, a] of placed.entries()) {
    for (const b of placed.slice(i + 1)) {
      if (a.id !== b.id && a.jobId === b.jobId && a.from === b.from && a.to === b.to) {
        issues.push({ code: "duplicate_shift", shiftIds: pairOf(a.id, b.id) });
      }
    }
  }

  // holds.get(x) is every shift x holds the shared time against.
  const holds = new Map<string, Set<string>>();
  const decided = new Set<string>();
  for (const o of overrides) {
    const holder = byId.get(o.holderId);
    const yielding = byId.get(o.yieldingId);
    if (holder === undefined || yielding === undefined || o.holderId === o.yieldingId) {
      issues.push({
        code: "override_unknown_shift",
        holderId: o.holderId,
        yieldingId: o.yieldingId,
      });
      continue;
    }
    const pair = pairOf(holder.id, yielding.id);
    const key = JSON.stringify(pair);
    if (decided.has(key)) {
      issues.push({ code: "override_conflict", shiftIds: pair });
      continue;
    }
    decided.add(key);
    // A shift that is itself refused has no times to compare.
    if (
      !unsound.has(holder.id) &&
      !unsound.has(yielding.id) &&
      !overlap(holder, yielding)
    ) {
      issues.push({ code: "override_not_overlapping", shiftIds: pair });
    }
    const held = holds.get(holder.id) ?? new Set<string>();
    held.add(yielding.id);
    holds.set(holder.id, held);
  }
  if (issues.length > 0) return rejected(issues);

  // 2. Every overlap is decided.
  for (const [i, a] of placed.entries()) {
    for (const b of placed.slice(i + 1)) {
      if (overlap(a, b) && !decided.has(JSON.stringify(pairOf(a.id, b.id)))) {
        issues.push({
          code: "missing_decision",
          shiftIds: pairOf(a.id, b.id),
          start: toTime(Math.max(a.from, b.from)),
          end: toTime(Math.min(a.to, b.to)),
        });
      }
    }
  }

  // 3. No circle. Overrides join only shifts that overlap, and among shifts on a line a
  // circle of any length has a circle of three inside it once every overlap is decided, so
  // threes are all there is to look for. Three shifts that overlap in pairs share a moment.
  for (const [i, a] of placed.entries()) {
    for (const [j, b] of placed.slice(i + 1).entries()) {
      for (const c of placed.slice(i + j + 2)) {
        const round = (x: Placed, y: Placed, z: Placed) =>
          holds.get(x.id)?.has(y.id) === true &&
          holds.get(y.id)?.has(z.id) === true &&
          holds.get(z.id)?.has(x.id) === true;
        if (round(a, b, c) || round(a, c, b)) {
          issues.push({
            code: "circular_precedence",
            shiftIds: [a.id, b.id, c.id].sort(compare) as [string, string, string],
            start: toTime(Math.max(a.from, b.from, c.from)),
            end: toTime(Math.min(a.to, b.to, c.to)),
          });
        }
      }
    }
  }
  if (issues.length > 0) return rejected(issues);

  // 4. Between two neighbouring cuts, the one shift that holds against all the others there.
  const cuts = [...new Set(placed.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b);
  const won: { from: number; to: number; shift: Placed }[] = [];
  for (const [i, from] of cuts.entries()) {
    const to = cuts[i + 1];
    if (to === undefined) break;
    const covering = placed.filter((s) => s.from <= from && from < s.to);
    if (covering.length === 0) continue;
    const eligible = covering.find((a) =>
      covering.every((b) => a.id === b.id || holds.get(a.id)?.has(b.id) === true),
    );
    // Every overlap is decided and nothing goes in a circle, so one shift is on top.
    if (eligible === undefined)
      throw new Error("a covered stretch with no eligible shift");
    won.push({ from, to, shift: eligible });
  }

  // 5. Every shift holds some time of its own.
  const winners = new Set(won.map((w) => w.shift.id));
  for (const s of placed) {
    if (!winners.has(s.id)) issues.push({ code: "no_eligible_time", shiftId: s.id });
  }
  if (issues.length > 0) return rejected(issues);

  // 6. Neighbouring stretches of one shift are one window.
  const timeline: Segment[] = [];
  const windows = new Map<string, Window[]>();
  // Two stretches of one shift in a row have no gap between them: a gap inside a shift
  // would be time the shift covers and nobody holds.
  let last: Segment | undefined;
  for (const w of won) {
    if (last?.shiftId === w.shift.id) {
      last.end = toTime(w.to);
      continue;
    }
    const segment = {
      start: toTime(w.from),
      end: toTime(w.to),
      shiftId: w.shift.id,
      jobId: w.shift.jobId,
    };
    timeline.push(segment);
    last = segment;
  }
  for (const segment of timeline) {
    const own = windows.get(segment.shiftId) ?? [];
    own.push({ start: segment.start, end: segment.end });
    windows.set(segment.shiftId, own);
  }
  return {
    result: "resolved",
    timeline,
    shifts: placed.map((s) => ({
      shiftId: s.id,
      jobId: s.jobId,
      windows: windows.get(s.id) ?? [],
    })),
  };
}

// How long before the next eligible shift a start is admitted.
export const EARLY_MINUTES = 15;

export type StartAdmission =
  // A shift is eligible at that minute.
  | { result: "scheduled"; shiftId: string; jobId: string }
  // None is, and this one becomes eligible next, `minutesEarly` from now: 1 to 15.
  | { result: "early"; shiftId: string; jobId: string; minutesEarly: number }
  | { result: "none" };

// Whether a start at `at`, HH:MM on the day that was resolved, is admitted, and on which
// shift. The seconds of the recorded time are dropped by the caller, never rounded up.
export function admitStart(day: ResolvedDay, at: string): StartAdmission {
  const minute = toMinutes(at);
  // In time order: the first stretch that has not ended is the one `at` is in, or the next.
  const segment = day.timeline.find((s) => toMinutes(s.end) > minute);
  if (segment === undefined) return { result: "none" };
  const { shiftId, jobId } = segment;
  const minutesEarly = toMinutes(segment.start) - minute;
  if (minutesEarly <= 0) return { result: "scheduled", shiftId, jobId };
  if (minutesEarly <= EARLY_MINUTES)
    return { result: "early", shiftId, jobId, minutesEarly };
  return { result: "none" };
}
