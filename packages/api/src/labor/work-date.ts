// `work_date` (RULES: derived in `companies.timezone`, never stored). Pure. Consumed by
// closeout (per job and work date), approvals and the Stage 4 payroll export; an event's pay
// period is derived from its session's work date (ARCHITECTURE row 151).
import { foldSessions, type LaborEvent, type Session } from "./fold";

// The calendar date of `instant` in the IANA zone, as YYYY-MM-DD. Through the zone's rules,
// never a fixed offset, which is wrong on either side of a daylight-saving change. Built
// from parts so no locale's date format can change the shape. An unknown zone throws
// RangeError: an internal error, since the zone is validated where it is written.
export function workDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: "year" | "month" | "day") => {
    const value = parts.find((p) => p.type === type)?.value;
    if (value === undefined) throw new Error(`no ${type} in the formatted date`);
    return value;
  };
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

export type DerivedSession = Session & { workDate: string };

// A session belongs wholly to the date of its effective start (decision D2): a shift from
// 22:00 to 02:00 is four hours on the first day. Every event of the session takes that date.
export function deriveSessions(
  events: readonly LaborEvent[],
  timeZone: string,
): DerivedSession[] {
  return foldSessions(events).map((s) => ({
    ...s,
    workDate: workDate(s.startedAt, timeZone),
  }));
}
