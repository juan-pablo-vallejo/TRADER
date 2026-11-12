// What a pay-period close stores (PRD, Labor: hours belong to the period that contains their
// work date when approved before it closes; anything approved, corrected or repaired after is
// exported exactly once, as an adjustment in the next period to close; ARCHITECTURE,
// Accounting and exports: Pay-period close, Late adjustments; V1-D03). Pure: no database, no
// clock. The figures are the cells of the one derivation (labor/hours.ts) — integer
// hundredths, rounded once per worker, job and work date — and nothing here rounds, and no
// milliseconds are differenced: an adjustment is a difference of two exported-grade figures.
//
// The rule is one subtraction. For a worker, job and work date, "already exported" is the sum
// of every line any close stored for it. At a close, the approved figure now, minus that sum:
//   - on a date inside the closing period, the period's own hours;
//   - on a date inside an earlier closed period, an adjustment, signed;
//   - on any other date — before the first period, in a gap, after this period — nothing:
//     those days were in no close, so there is no export of theirs to correct (owner,
//     2026-11-12).
// A cell that no longer exists (a correction moved its session to another day or job) is an
// approved figure of zero, so what was exported for it comes back as a negative adjustment.
// Because the adjustment becomes a stored line of the closing period, the next close's
// subtraction finds zero: each change appears once, in one period, and no closed line is ever
// recomputed. Consumed by pay-periods/close.ts and pay-periods/read.ts.
import type { DayCell } from "../labor/hours";

export type Range = { startsOn: string; endsOn: string };

export type Line = {
  workerId: string;
  jobId: string;
  workDate: string;
  // Signed hundredths of an hour; never zero.
  hundredths: number;
};

export type Approved = Pick<
  DayCell,
  "workerId" | "jobId" | "workDate" | "approvedHundredths"
>;

const within = (day: string, r: Range) => day >= r.startsOn && day <= r.endsOn;

const keyOf = (l: { workerId: string; jobId: string; workDate: string }) =>
  `${l.workDate}|${l.workerId}|${l.jobId}`;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// By work date, then worker id, then job id: the order every reader and the export share.
export const lineOrder = (a: Line, b: Line) =>
  compare(a.workDate, b.workDate) ||
  compare(a.workerId, b.workerId) ||
  compare(a.jobId, b.jobId);

// The lines the close of `period` writes: `cells` are the approved figures as they stand,
// `exported` every line stored by the closes before it, `closed` those closes' periods.
export function closeLines(
  cells: readonly Approved[],
  exported: readonly Line[],
  period: Range,
  closed: readonly Range[],
): { own: Line[]; adjustments: Line[] } {
  const earlier = closed.filter((r) => r.endsOn < period.startsOn);
  if (earlier.length !== closed.length) {
    // Periods close in order and never overlap (0004, 0036): anything else is not a state
    // this subtraction is defined for.
    throw new Error("a period closes after every closed period has ended");
  }

  const now = new Map<string, Line>();
  for (const c of cells) {
    if (now.has(keyOf(c))) throw new Error("one cell per worker, job and work date");
    now.set(keyOf(c), {
      workerId: c.workerId,
      jobId: c.jobId,
      workDate: c.workDate,
      hundredths: c.approvedHundredths,
    });
  }
  const before = new Map<string, Line>();
  for (const l of exported) {
    const sum = before.get(keyOf(l));
    if (sum === undefined) before.set(keyOf(l), { ...l });
    else sum.hundredths += l.hundredths;
  }

  const own: Line[] = [];
  const adjustments: Line[] = [];
  for (const key of new Set([...now.keys(), ...before.keys()])) {
    const current = now.get(key);
    const previous = before.get(key);
    const at = (current ?? previous)!;
    const hundredths = (current?.hundredths ?? 0) - (previous?.hundredths ?? 0);
    if (!Number.isSafeInteger(hundredths)) {
      throw new Error("a line is a whole number of hundredths");
    }
    const inPeriod = within(at.workDate, period);
    // No close has stored a line for a day of a period that is still open.
    if (inPeriod && previous !== undefined) {
      throw new Error("a day of an open period was exported");
    }
    if (hundredths === 0) continue;
    const line = { ...at, hundredths };
    if (inPeriod) {
      own.push(line);
    } else if (earlier.some((r) => within(at.workDate, r))) {
      adjustments.push(line);
    }
  }
  return { own: own.sort(lineOrder), adjustments: adjustments.sort(lineOrder) };
}

// What a close of `period` leaves unresolved on its own dates: sessions that wait for a
// decision, and sessions that count but have no clock-out. Rejected sessions are decided.
export function unresolvedIn(
  cells: readonly Pick<DayCell, "workDate" | "pendingSessions" | "openSessions">[],
  period: Range,
): { pendingSessions: number; openSessions: number } {
  let pendingSessions = 0;
  let openSessions = 0;
  for (const c of cells) {
    if (!within(c.workDate, period)) continue;
    pendingSessions += c.pendingSessions;
    openSessions += c.openSessions;
  }
  return { pendingSessions, openSessions };
}
