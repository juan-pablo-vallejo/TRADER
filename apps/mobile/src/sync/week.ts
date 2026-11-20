// What Week works out from the last pull: the person's hours by day, each session with the
// flags the office may look at, in words. Pure. The hours are the server's own fold
// (`sessions`), never recomputed here; this only groups them and names their flags.
import type { PullOutput } from "@trader/api/contract";

type Session = PullOutput["sessions"][number];
export type Flag = PullOutput["events"][number]["flags"][number];

// The enum's order, so the same facts read the same way every time.
const ORDER: readonly Flag[] = [
  "offline",
  "corrected",
  "user_timed",
  "location",
  "clock_skewed",
  "unscheduled",
];

export type HoursSession = { session: Session; flags: Flag[] };
export type HoursDay = { day: string; workedMs: number; sessions: HoursSession[] };

// A session's flags: those of the person's own entries on that job from its clock-in to
// its clock-out (to the end of time while it is open). Each flag once.
function flagsOf(session: Session, events: PullOutput["events"]): Flag[] {
  const from = session.startedAt.getTime();
  const to = session.endedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const seen = new Set<Flag>();
  for (const e of events) {
    const at = e.clientTimestamp.getTime();
    if (e.jobId !== session.jobId || at < from || at > to) continue;
    for (const flag of e.flags) seen.add(flag);
  }
  return ORDER.filter((flag) => seen.has(flag));
}

// Days newest first, a day's sessions in the order they began. A voided session is left
// out: the office took it off the record.
export function hoursByDay(data: PullOutput): HoursDay[] {
  const days = new Map<string, HoursDay>();
  const kept = data.sessions
    .filter((s) => !s.voided)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  for (const session of kept) {
    let day = days.get(session.workDate);
    if (day === undefined) {
      day = { day: session.workDate, workedMs: 0, sessions: [] };
      days.set(session.workDate, day);
    }
    day.workedMs += session.workedMs;
    day.sessions.push({ session, flags: flagsOf(session, data.events) });
  }
  return [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

// The scheduled days from today on, today first, each with its shifts in time order.
export function shiftDays(
  data: PullOutput,
  today: string,
): { day: string; shifts: PullOutput["shifts"] }[] {
  const days = new Map<string, PullOutput["shifts"]>();
  for (const shift of data.shifts) {
    if (shift.workDate < today) continue;
    days.set(shift.workDate, [...(days.get(shift.workDate) ?? []), shift]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, shifts]) => ({
      day,
      shifts: [...shifts].sort((a, b) => (a.start < b.start ? -1 : 1)),
    }));
}
