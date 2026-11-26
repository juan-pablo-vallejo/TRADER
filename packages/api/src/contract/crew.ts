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

// What needs attention on the company's today, in the order it is drawn: sessions left
// open from an earlier day first, oldest first (the server's order), then the late, by how
// long ago their shift started. The office's Today and an admin's Today on the phone show
// these rows, each with what can be done about it there.
export type Attention<P> =
  | { kind: "open"; key: string; person: P; jobId: string; sinceDay: string }
  | { kind: "late"; key: string; person: P; jobId: string; start: string };

export function attention<P extends { id: string }>(
  today: {
    earlier: readonly { person: P; jobId: string; sinceDay: string }[];
    people: readonly (Omit<CrewFacts, "shifts"> & {
      person: P;
      shifts: readonly { jobId: string; start: string; clockedIn: boolean }[];
    })[];
  },
  minute: string,
): Attention<P>[] {
  const open: Attention<P>[] = today.earlier.map((e) => ({
    kind: "open",
    key: `open-${e.person.id}`,
    person: e.person,
    jobId: e.jobId,
    sinceDay: e.sinceDay,
  }));
  const late = today.people
    .filter((p) => crewStatus(p, minute) === "late")
    .flatMap((p) => {
      // The shift they are late for: the earliest nobody clocked in on that is past its
      // quarter hour.
      const shift = p.shifts
        .filter((s) => !s.clockedIn)
        .filter((s) => minutes(minute) >= minutes(s.start) + LATE_AFTER_MINUTES)
        .sort((a, b) => minutes(a.start) - minutes(b.start))[0];
      return shift === undefined
        ? []
        : [
            {
              kind: "late" as const,
              key: `late-${p.person.id}`,
              person: p.person,
              jobId: shift.jobId,
              start: shift.start,
            },
          ];
    })
    .sort((a, b) => minutes(a.start) - minutes(b.start));
  return [...open, ...late];
}
