// A person's status on the company's today, named from what `overview.today` answers and
// the minute on the company's wall clock. Pure, and part of the client-safe contract: the
// phone's Crew tab and the office name a status with this one function and never with a
// rule of their own.
//
// On the clock and on a break are the clock's own word and come first: whoever is working
// is working, whatever their shifts say. Off the clock, a shift nobody has clocked in on
// decides: 15 minutes past its start it is late, before that it is expected. With no such
// shift left the person is done: they worked today, or every shift of theirs was met.
// Times are HH:MM on the company's wall clock, so text order is time order.

export const CREW_STATUSES = ["working", "break", "late", "expected", "done"] as const;
export type CrewStatus = (typeof CREW_STATUSES)[number];

// How long past a shift's start, with no clock-in on it, before it is late.
export const LATE_AFTER_MINUTES = 15;

// What the function reads of a person in `overview.today`'s answer.
export type CrewFacts = {
  shifts: readonly { start: string; clockedIn: boolean }[];
  clock: { status: "off" | "working" | "paused" };
};

const minutes = (wall: string) =>
  Number(wall.slice(0, 2)) * 60 + Number(wall.slice(3, 5));

export function crewStatus(person: CrewFacts, minute: string): CrewStatus {
  if (person.clock.status === "working") return "working";
  if (person.clock.status === "paused") return "break";
  const waiting = person.shifts.filter((s) => !s.clockedIn);
  if (waiting.length === 0) return "done";
  const now = minutes(minute);
  return waiting.some((s) => now >= minutes(s.start) + LATE_AFTER_MINUTES)
    ? "late"
    : "expected";
}

// How many people stand at each status: the counts above the list.
export function crewCounts(
  people: readonly CrewFacts[],
  minute: string,
): Record<CrewStatus, number> {
  const counts = { working: 0, break: 0, late: 0, expected: 0, done: 0 };
  for (const p of people) counts[crewStatus(p, minute)]++;
  return counts;
}
