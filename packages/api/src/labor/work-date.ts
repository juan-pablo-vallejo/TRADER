// `work_date`: derived in `companies.timezone`, never stored. Pure.
import { dayIn } from "../contract/calendar";
import { foldSessions, type LaborEvent, type Session } from "./fold";

// The calendar date of an instant in the company's zone: a work date.
export const workDate = dayIn;

type DerivedSession = Session & { workDate: string };

// A session belongs wholly to the date of its effective start: a shift from
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
