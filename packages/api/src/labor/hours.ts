// Hours that count, per worker, job and work date (PRD, Labor: a worker's time on a job is
// summed for the day first, then rounded half-up to the hundredth of an hour; ARCHITECTURE,
// Accounting and exports, Rounding; V1-D13). Pure: no database, no clock. The one derivation
// of a rounded hour: whatever shows or exports approved hours, or prices them, reads a cell
// from here and never rounds a session, an event or a second sum of its own. Sessions and
// their milliseconds are the fold's (fold.ts), whether one counts is the accounting's
// (approval.ts); nothing here re-derives either, and no ledger row is rounded.
//
// A cell's approved milliseconds are those of its sessions that count and have ended. A
// session that counts but is still open adds nothing until its clock-out arrives (owner,
// 2026-11-12): it is counted apart, so an approved figure never moves while someone is on
// the clock. Pending and rejected sessions are apart too; a voided one adds nothing anywhere.
// Hours are integer hundredths everywhere: no float is ever an hour.
// Consumed by labor/day-hours.ts (readDayHours).
import type { sessionApprovals } from "./approval";
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
  approvedMs: number;
  // The one rounding: of the day's sum, never of a session.
  approvedHundredths: number;
  // What waits for a decision, as the fold measures it; in no approved figure.
  pendingMs: number;
  pendingHundredths: number;
  pendingSessions: number;
  rejectedSessions: number;
  // Sessions that count but have no clock-out yet.
  openSessions: number;
};

// One worker's cells, from that worker's whole folded ledger, ordered by work date then job.
export function dayHours(
  workerId: string,
  folded: ReturnType<typeof sessionApprovals>,
  timeZone: string,
): DayCell[] {
  const cells = new Map<string, DayCell>();
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
        approvedMs: 0,
        approvedHundredths: 0,
        pendingMs: 0,
        pendingHundredths: 0,
        pendingSessions: 0,
        rejectedSessions: 0,
        openSessions: 0,
      };
      cells.set(key, cell);
    }
    if (counted.accounting === "rejected") cell.rejectedSessions++;
    else if (counted.accounting === "pending") {
      cell.pendingSessions++;
      cell.pendingMs += s.workedMs;
    } else if (!counted.complete) cell.openSessions++;
    else cell.approvedMs += counted.eligibleWorkedMs;
  }
  return [...cells.values()]
    .map((c) => ({
      ...c,
      approvedHundredths: roundHours(c.approvedMs),
      pendingHundredths: roundHours(c.pendingMs),
    }))
    .sort(
      (a, b) =>
        (a.workDate < b.workDate ? -1 : a.workDate > b.workDate ? 1 : 0) ||
        (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0),
    );
}
