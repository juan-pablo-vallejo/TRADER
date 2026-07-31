import { foldSessions, type FoldEvent, type Session } from "./fold";

/**
 * LOGIC.md DERIVE. Nothing here is stored; every value is computed from the fold
 * so the ledger and the numbers cannot disagree.
 */

/**
 * DERIVE-1: the calendar date of the session's `started` `client_timestamp`,
 * evaluated in the company's timezone. Never entered, never editable.
 *
 * Uses `Intl` with an explicit `timeZone` rather than any date arithmetic. The
 * tempting shortcut — shifting by a fixed UTC offset — is wrong twice a year: on
 * a DST boundary the offset itself changes, and `America/New_York` is exactly the
 * kind of zone where a 22:00 start lands on a different date depending on which
 * side of the transition it falls. `en-CA` is used because it formats as
 * ISO-like `YYYY-MM-DD`, which is the shape the rest of the system wants.
 */
export function workDate(startedAt: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(startedAt);
}

export type DerivedSession = Session & {
  /** DERIVE-1/2. A session crossing midnight belongs entirely to its start date. */
  workDate: string;
  /** DERIVE-5: an open session is excluded from payroll totals. */
  countsTowardPayroll: boolean;
};

export function deriveSessions(
  events: readonly FoldEvent[],
  timezone: string,
): DerivedSession[] {
  return foldSessions(events).map((session) => ({
    ...session,
    // DERIVE-2 needs no special handling: the date comes from `startedAt` alone,
    // so a 22:00–02:00 shift is four hours on the first day rather than split.
    // Stating it here because "no code" is easy to mistake for "not implemented".
    workDate: workDate(session.startedAt, timezone),
    countsTowardPayroll: session.endedAt !== null && !session.voided,
  }));
}

/**
 * Worked milliseconds per `work_date` — the payroll input.
 *
 * Open sessions are excluded (DERIVE-5) and voided ones contribute zero
 * (DERIVE-4). An open session may be *displayed* as accruing against the current
 * time, but that display value never enters here, which is why this function
 * takes no clock.
 */
export function payrollByWorkDate(
  events: readonly FoldEvent[],
  timezone: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of deriveSessions(events, timezone)) {
    if (!session.countsTowardPayroll) continue;
    totals.set(session.workDate, (totals.get(session.workDate) ?? 0) + session.workedMs);
  }
  return totals;
}
