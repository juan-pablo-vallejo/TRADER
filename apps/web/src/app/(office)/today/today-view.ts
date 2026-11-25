// How the office's Today lays out `overview.today`'s answer. Pure, and no rule of its own:
// a person's status is the shared function's (`@trader/api/contract`, crewStatus), the same
// one the phone's Crew tab names it with. This module only sorts people into the screen's
// bands and its attention rows.
import type { AppRouter } from "@trader/api";
import { crewStatus, LATE_AFTER_MINUTES } from "@trader/api/contract";
import type { inferRouterOutputs } from "@trpc/server";

export type Today = inferRouterOutputs<AppRouter>["overview"]["today"];
export type Person = Today["people"][number];

// The most rows the attention band shows before it says how many more there are.
export const ATTENTION_ROWS = 10;

type Attention =
  // A session left open from an earlier day: Fix opens that day's panel in Hours.
  | {
      kind: "open";
      key: string;
      person: Today["earlier"][number]["person"];
      jobId: string;
      sinceDay: string;
    }
  // Someone late for a shift: Call.
  | {
      kind: "late";
      key: string;
      person: Person["person"];
      jobId: string;
      start: string;
    };

const minutes = (wall: string) =>
  Number(wall.slice(0, 2)) * 60 + Number(wall.slice(3, 5));

// What needs attention, in the order it is drawn: open sessions first, oldest first (the
// server's order), then the late, by how long ago their shift started. Only a thing with
// an action is admitted here.
export function attention(today: Today, minute: string): Attention[] {
  const open: Attention[] = today.earlier.map((e) => ({
    kind: "open",
    key: `open-${e.person.id}`,
    person: e.person,
    jobId: e.jobId,
    sinceDay: e.sinceDay,
  }));
  const late: Attention[] = today.people
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
    .sort((a, b) =>
      a.kind === "late" && b.kind === "late" ? minutes(a.start) - minutes(b.start) : 0,
    );
  return [...open, ...late];
}

type Bands = {
  // On the clock or on a break, in the server's order (by name).
  working: Person[];
  expected: Person[];
  done: Person[];
};

// Everyone of today under the heading their status puts them. The late are in the
// attention band above and in no band here.
export function bands(today: Today, minute: string): Bands {
  const of = (...statuses: ReturnType<typeof crewStatus>[]) =>
    today.people.filter((p) => statuses.includes(crewStatus(p, minute)));
  return { working: of("working", "break"), expected: of("expected"), done: of("done") };
}

// The shift an expected person is expected on: the earliest nobody clocked in on.
export function nextShift(person: Person): Person["shifts"][number] | null {
  return (
    person.shifts
      .filter((s) => !s.clockedIn)
      .sort((a, b) => minutes(a.start) - minutes(b.start))[0] ?? null
  );
}

// Where Fix goes: Hours on the day the session was left open, with that person's day
// panel open on it.
export const fixHref = (row: Extract<Attention, { kind: "open" }>): string =>
  `/hours?range=dates&from=${row.sinceDay}&to=${row.sinceDay}&who=${row.person.id}&day=${row.sinceDay}`;
