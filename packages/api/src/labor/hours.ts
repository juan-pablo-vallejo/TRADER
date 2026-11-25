// Hours that count, per worker, job and work date: a worker's time on a job is summed for the
// day first, then rounded half-up to the hundredth of an hour. Pure: no database, no clock.
// The one derivation of a rounded hour: whatever shows or exports hours reads a cell from
// here and never rounds a session, an event or a second sum of its own. Sessions and their
// milliseconds are the fold's (fold.ts), whether one counts is the accounting's
// (accounting.ts); nothing here re-derives either, and no ledger row is rounded.
//
// A cell's milliseconds are those of its sessions that have ended. A session still open adds
// nothing until its clock-out arrives: it is counted apart, so a figure never moves while
// someone is on the clock. A voided session adds nothing anywhere. A cell carries every flag
// of the entries its sessions are made of. Hours are integer hundredths everywhere: no float
// is ever an hour.
import { REASON_ORDER, type EntryFlag } from "../sync/reasons";
import type { sessionAccounting } from "./accounting";
import { workDate } from "./work-date";

// 0.01 h.
export const HUNDREDTH_HOUR_MS = 36_000;

// Milliseconds to hundredths of an hour, half-up: exactly half a hundredth rounds up.
export function roundHours(ms: number): number {
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new Error(`a duration is a non-negative whole number of milliseconds: ${ms}`);
  }
  return Math.floor((ms + HUNDREDTH_HOUR_MS / 2) / HUNDREDTH_HOUR_MS);
}

export type DayCell = {
  workerId: string;
  // The session's job: its effective start's (fold.ts).
  jobId: string;
  // The day of the session's effective start in the company's zone (work-date.ts).
  workDate: string;
  workedMs: number;
  // The one rounding: of the day's sum, never of a session.
  hundredths: number;
  // Sessions with no clock-out yet.
  openSessions: number;
  // Entries in effect behind this cell's sessions that carry a flag: what the office may
  // want to look at before it runs payroll. An entry is counted once, whatever it holds.
  flaggedEntries: number;
  // Every flag of the entries in effect behind this cell's sessions, in the enum's order.
  flags: EntryFlag[];
};

// One worker's cells, from that worker's whole folded ledger, ordered by work date then job.
// `flagsOf` answers an entry's stored flags by its id.
export function dayHours(
  workerId: string,
  folded: ReturnType<typeof sessionAccounting>,
  timeZone: string,
  flagsOf: (eventId: string) => readonly EntryFlag[],
): DayCell[] {
  const cells = new Map<string, DayCell & { seen: Set<EntryFlag> }>();
  for (const s of folded.structural.sessions) {
    const counted = folded.byRoot.get(s.rootEventId);
    if (counted === undefined)
      throw new Error(`session ${s.rootEventId} has no accounting`);
    if (counted.accounting === "voided") continue;
    const day = workDate(s.startedAt, timeZone);
    const key = `${day}|${s.jobId}`;
    let cell = cells.get(key);
    if (cell === undefined) {
      cell = {
        workerId,
        jobId: s.jobId,
        workDate: day,
        workedMs: 0,
        hundredths: 0,
        openSessions: 0,
        flaggedEntries: 0,
        flags: [],
        seen: new Set(),
      };
      cells.set(key, cell);
    }
    for (const id of s.eventSourceIds) {
      const held = flagsOf(id);
      if (held.length > 0) cell.flaggedEntries++;
      for (const f of held) cell.seen.add(f);
    }
    if (!counted.complete) cell.openSessions++;
    else cell.workedMs += counted.eligibleWorkedMs;
  }
  return [...cells.values()]
    .map(({ seen, ...c }) => ({
      ...c,
      hundredths: roundHours(c.workedMs),
      flags: REASON_ORDER.filter((f) => seen.has(f)),
    }))
    .sort(
      (a, b) =>
        (a.workDate < b.workDate ? -1 : a.workDate > b.workDate ? 1 : 0) ||
        (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0),
    );
}
